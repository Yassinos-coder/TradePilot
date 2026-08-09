# TradePilot

TradePilot is a production SaaS monorepo that copies trades from one MetaTrader account to your other MetaTrader accounts in real time, sizing each copy to the risk parameters you set per account.

Live at: `https://tradepilot.sidedevelopments.com`

## Stack

- `apps/server`: NestJS + Supabase + Redis + raw WebSocket EA gateway
- `apps/App`: React + Vite + Tailwind CSS v4 + React Query + Zustand
- `apps/Metatrader-eas`: MT5 and MT4 Expert Advisors (MQL5/MQL4)
- `packages/shared`: Zod schemas and DTO contracts
- `packages/config`: shared runtime env parsing and constants
- `packages/trading`: broker symbol resolution and EA command builders

## Quick start (local)

1. Copy `.env.example` to `.env` and fill in all values
2. Create the Supabase schema: paste `supabase/tradepilot-schema-v2.sql` into the Supabase SQL editor
3. In Supabase → API settings → Exposed schemas: add `tradepilot`
4. In Supabase Auth, add `http://localhost:5173/auth/callback` as a redirect URL
5. `npm install`
6. `docker compose up --build -d`
7. Frontend: `http://localhost:5173` — Backend: `http://localhost:4000/api`

Re-run the schema SQL after any pull that adds new tables or columns.

## Environment variables

```bash
# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_SCHEMA=tradepilot
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# API keys (rotation grace window for a live EA session)
API_KEY_ROTATION_GRACE_HOURS=24

# OpenAI — optional, only powers the analytics AI coach
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4.1
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
LLM_TEMPERATURE=0.1

# Redis
REDIS_URL=redis://localhost:6379

# Frontend
VITE_API_BASE_URL=http://localhost:4000/api
VITE_WS_BASE_URL=ws://localhost:4000
VITE_MAGIC_LINK_REDIRECT_PATH=/auth/callback
```

## EC2 deployment (Nginx Proxy Manager)

Uses `docker-compose.prod.yml` behind Nginx Proxy Manager on the EC2 server.

### Initial setup

1. SSH to EC2 and clone the repo to `/home/ec2-user/tradepilot`
2. Copy `.env.production.example` to `.env` and fill in all values
3. Run the Supabase schema SQL
4. Add `tradepilot` to Supabase Exposed Schemas
5. Build and start:

```bash
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

### Updating production

```bash
git pull origin production
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

Note: `docker compose` (v2 plugin) requires buildx 0.17+. Use `docker-compose` (standalone) instead.

### Nginx Proxy Manager

- Forward `tradepilot.sidedevelopments.com` → `tradepilot-frontend:80`
- Enable WebSocket support in NPM
- The frontend nginx proxies `/api/*` and `/ws/ea` to the backend internally
- Supabase Auth redirect URL: `https://tradepilot.sidedevelopments.com/auth/callback`

### EC2 security group (required inbound rules)

| Port | Protocol | Source    | Purpose                        |
|------|----------|-----------|--------------------------------|
| 80   | TCP      | 0.0.0.0/0 | HTTP (NPM redirect to HTTPS)   |
| 443  | TCP      | 0.0.0.0/0 | HTTPS (web app)                |
| 4000 | TCP      | 0.0.0.0/0 | Direct WS for MetaTrader EA    |
| 8083 | TCP      | 0.0.0.0/0 | NPM → frontend container       |

## MetaTrader EA setup

The EA connects directly to the backend on port 4000 (plain WebSocket — no TLS).
MT5's built-in TLS stack is incompatible with Let's Encrypt/ECDSA certificates, so TLS is bypassed at the socket level while the API key provides authentication security.

### MT5

1. Copy `apps/Metatrader-eas/MT5/TradePilot_EA.mq5` to:

   ```text
   %APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts\
   ```

2. In MT5: **Tools → Options → Expert Advisors**
   - Check "Allow WebRequest for listed URL"
   - Add `tradepilot.sidedevelopments.com`
3. Open MetaEditor (F4) → compile TradePilot_EA (F7) → 0 errors
4. Attach to any chart. Input settings:
   - `ServerHost`: `api.tradepilot.sidedevelopments.com`
   - `ServerPort`: `4000`
   - `UseSSL`: `false`
   - `ApiKey`: an **EA key** created in Settings → API & Keys (`tp_ea_…`, shown once)
5. Check **Experts tab** — should show `Auth success, ready for signals`
6. In Settings → Trade Copier, set this account as the master, or link it as a slave

### MT4

1. Copy `apps/Metatrader-eas/MT4/TradePilot_EA.mq4` to `MQL4/Experts/`
2. **Tools → Options → Expert Advisors** → Allow DLL imports
3. Compile and attach with the same inputs as above

## Architecture

Each user marks one connected account as `MASTER`; the rest can be linked as slaves.
A `copier_links` row holds the risk parameters for one master → slave route.

```text
Master EA (MT4/MT5)
    │  trade_event  (OnTradeTransaction)
    ▼
EaGatewayService               ← account role = MASTER?
    │
    ▼
CopierService.onMasterTradeEvent()
    │   copy_events row (deduped on ticket + action)
    │
    ├── per enabled copier_link:
    │     CopyEventValidators.isCopyable()   ← action flags, symbol filter, staleness
    │     CopierGuardService.evaluate()      ← positions, daily loss, drawdown, equity floor
    │     CopySizingService.resolveVolume()  ← sizing mode → lot, clamped to min/max
    │     resolveBrokerSymbol()              ← broker's own spelling, or prefix/suffix
    │     copy_orders row (execution_key)
    │
    ▼
Redis PUBLISH tradepilot:ea:dispatch
    │
    ▼
Slave EA                       ← opens the position, comment = execution_key
    │  trade_event / command_result
    ▼
copy_orders.slave_ticket       ← the master ↔ slave ticket map

A later CLOSE / PARTIAL_CLOSE / MODIFY on the master resolves the slave ticket
from that map and reuses the EA's existing close_all / partial_close / move_sl
commands.
```

### Trade API

`POST /api/v1/trades/open|close|modify` and `GET /api/v1/trades/positions`,
authenticated with a REST key (`x-api-key: tp_sk_…`). Opening additionally
requires **Allow trade opening through API** to be on in Settings → API & Keys;
closing and modifying are never gated by it, so revoking the permission can't
strand open exposure.

## Docker services

| Service               | Container            | Port  | Notes                          |
|-----------------------|----------------------|-------|--------------------------------|
| NestJS backend        | tradepilot-backend   | 4000  | Also exposes EA WS directly    |
| React frontend (nginx)| tradepilot-frontend  | 8083  | Proxied by NPM                 |
| Redis                 | tradepilot-redis     | 6379  | EA presence + dispatch pub/sub |

- Health check: `GET /api/health` → `{status, api, database, redis}`
