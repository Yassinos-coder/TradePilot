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

## Deployment (Berth)

Production runs on a VPS managed by [Berth](https://berth.sh), a self-hosted
deployment panel. There is no CI workflow in this repo and no SSH step: Berth
watches the `production` branch and redeploys on push.

Two services are built straight from the Dockerfiles in this repo:

| Service  | Dockerfile               | Serves                                         |
| -------- | ------------------------ | ---------------------------------------------- |
| Backend  | `apps/server/Dockerfile` | NestJS API and the `/ws/ea` gateway            |
| Frontend | `apps/App/Dockerfile`    | Built SPA on stock nginx, behind Berth's proxy |

Berth's reverse proxy terminates TLS and issues Let's Encrypt certificates
automatically, so neither container handles certificates itself.

### Deploying

Push to `production`. Berth builds the changed service and rolls it over. Build
logs, rollbacks and per-service resource limits live in the panel.

### Configuration

Environment values are set per service under **Variables** in Berth, not from a
`.env` file on the host. `.env.production.example` lists everything the backend
reads. Managed dependencies (Postgres, Redis, object storage) are provisioned as
their own Berth services and addressed over the internal network by service
name, so they need no public exposure.

### First-time database setup

1. Run the schema SQL in `supabase/tradepilot-schema-v2.sql`
2. Add `tradepilot` to the Supabase **Exposed schemas** list under Settings → API

### Local development

The compose files are for running the stack locally, not for deploying:

```bash
docker-compose up -d
```

## MetaTrader EA setup

The EA connects over a secure WebSocket (`wss://`) to
`api.tradepilot.sidedevelopments.com` on port 443, authenticating with an EA key.

### MT5

1. Copy `apps/Metatrader-eas/MT5/TradePilot_EA.mq5` to:

   ```text
   %APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts\
   ```

2. In MT5: **Tools → Options → Expert Advisors**
   - Check "Allow WebRequest for listed URL"
   - Add `api.tradepilot.sidedevelopments.com`
3. Open MetaEditor (F4) → compile TradePilot_EA (F7) → 0 errors
4. Attach to any chart. The server inputs already default to production; the only
   one you must set is the key:
   - `ServerHost`: `api.tradepilot.sidedevelopments.com`
   - `ServerPort`: `443`
   - `UseSSL`: `true`
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

| Service                | Container           | Port | Notes                          |
| ---------------------- | ------------------- | ---- | ------------------------------ |
| NestJS backend         | tradepilot-backend  | 4000 | Serves the API and `/ws/ea`    |
| React frontend (nginx) | tradepilot-frontend | 8083 | Behind Berth's proxy           |
| Redis                  | tradepilot-redis    | 6379 | EA presence + dispatch pub/sub |

- Health check: `GET /api/health` → `{status, api, database, redis}`
