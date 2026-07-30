# TradePilot — Implementation Status

## Status: Production ✓

All core features are live at `https://tradepilot.yassinecastro.com`.

---

## What is built

### Copier pipeline

- Each user marks one connected account `MASTER`; the others are linked as slaves
- A `copier_links` row holds the risk parameters for one master → slave route
- The master EA reports `trade_event` on every transaction; the gateway hands it to `CopierService`
- `copy_events` dedupes the action, then each enabled link runs: copyability check → per-link risk gate → sizing → broker symbol resolution
- Commands fan out over Redis pub/sub; `copy_orders` records the outcome and the master <→ slave ticket map
- Sizing modes: `MULTIPLIER`, `FIXED_LOT`, `BALANCE_RATIO`, `RISK_PERCENT` (all clamped to the link's min/max lot)

### EA WebSocket gateway

- Raw `ws.Server` on `/ws/ea` (NestJS HTTP server upgrade)
- Auth via `{ type: "auth", apiKey: "tp_ea_..." }` → SHA-256 hash lookup in `api_keys`
- Presence tracked in Redis with TTL — survives multi-instance deploys
- Server pings EA every 10s; EA must pong within 35s or connection is dropped
- Redis pub/sub fan-out for copy delivery across multiple backend instances
- Account status snapshots and trade events stored in Supabase on receipt

### MetaTrader EAs

| File | Platform | Method |
| ---- | -------- | ------ |
| `apps/Metatrader-eas/MT5/TradePilot_EA.mq5` | MT5 build 2265+ | Native MQL5 socket functions |
| `apps/Metatrader-eas/MT4/TradePilot_EA.mq4` | MT4 (Windows) | `winhttp.dll` WinHTTP WS API |

**Connection**: plain WS on port 4000 (no TLS — MT5's Schannel is incompatible with Let's Encrypt ECDSA certs; API key secures the session)

**MT5 EA features**: grouped inputs (Server / Auth / Trade Execution / Connection), `CTrade` order placement, multi-TP splitting, account status push every 10s, trade event reporting (OPEN / CLOSED / REJECTED), exponential backoff reconnect, 4s HTTP upgrade wait loop

**Known MT5 setup steps**:

1. Tools → Options → Expert Advisors → Allow WebRequest → add `tradepilot.yassinecastro.com`
2. Compile in MetaEditor (F7)
3. Inputs: `ServerPort=4000`, `UseSSL=false`, paste an EA key (`tp_ea_...`) from Settings > API & Keys

### Backend modules

| Module | Key endpoints |
| ------ | ------------- |
| Auth | `GET /api/auth/me` |
| Users | `GET/PUT /api/users/me`, email change, password change, sessions |
| API keys | `GET/POST /api/api-keys`, `POST /api/api-keys/:id/rotate`, `DELETE /api/api-keys/:id` |
| Accounts | `GET/POST /api/accounts`, `DELETE /api/accounts/:id`, `POST /api/accounts/:id/promote-master` |
| Settings | `GET/PUT /api/settings`, `PUT /api/settings/auto-copy`, `PUT /api/settings/api-trade-opening` |
| Copier | `GET /api/copier/overview`, `GET/POST/PUT/DELETE /api/copier/links`, `PUT /api/copier/master`, `GET /api/copier/events` |
| Trade API | `POST /api/v1/trades/open|close|modify`, `GET /api/v1/trades/positions` (REST key auth) |
| Analytics | `GET /api/analytics/summary`, `daily-summary`, `ai-analysis`, `trades`, `logs`, `history-files` |
| Dashboard | `GET /api/dashboard/overview` |
| Health | `GET /api/health` → `{status, api, database, redis}` |

### Frontend pages

- **Overview**: copier status strip, monthly/annual net, unrealized P&L, trading calendar, trade history
- **Trade Copier**: master selector, per-slave link cards with a risk drawer, live copy feed
- **Analytics**: full performance metrics, equity curve, drawdown, AI coach, history import
- **Accounts**: connected terminals, role badges, promote to master
- **Settings**: My Account, Security & Sign-in, API & Keys, Copier Defaults, Notifications

---

## Infrastructure

### EC2 + Docker

```text
Internet
  │
  ▼ :443 (HTTPS)
Nginx Proxy Manager (container, nginx-proxy-manager_default network)
  │  proxies tradepilot.yassinecastro.com → tradepilot-frontend:80
  ▼
tradepilot-frontend (nginx, port 80)
  │  /api/*          → api:4000
  │  /ws/ea          → api:4000  (WebSocket upgrade)
  ▼
tradepilot-backend (NestJS, port 4000)
  │  also exposed directly on 0.0.0.0:4000 for EA plain WS
  ▼
tradepilot-redis (EA presence + copy dispatch pub/sub, port 6379)
```

### Build workaround

EC2 has Docker Compose v5.1.1 which requires buildx 0.17+ (only 0.12.1 installed). Use:

```bash
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

### Required EC2 security group ports

| Port | Use |
| ---- | --- |
| 80 | HTTP (NPM) |
| 443 | HTTPS (web app) |
| 4000 | Direct WS for EA (no TLS) |
| 8083 | NPM → frontend container |

---

## Database (Supabase, schema: `tradepilot`)

| Table | Purpose |
| ----- | ------- |
| `users` | auth link, email, profile and address fields |
| `api_keys` | EA and REST keys as SHA-256 hashes, rotation lineage, expiry |
| `accounts` | connected terminals, `role` (MASTER/SLAVE/UNASSIGNED), platform |
| `settings` | copier kill switch, `allow_api_trade_opening`, copier defaults |
| `copier_links` | one master → slave route and its full risk parameter set |
| `copy_events` | one row per master action worth mirroring |
| `copy_orders` | fan-out result per link + the master <→ slave ticket map |
| `execution_logs` | per-attempt dispatch log with details JSON |
| `ea_account_status_snapshots` | balance/equity/drawdown snapshots from EA |
| `trade_executions` | ticket, symbol, P&L, lifecycle status from EA |

Schema must be re-run after any pull that adds tables. Add `tradepilot` to Supabase Exposed Schemas in API settings.

---

## Environment variables (full list)

```bash
# Runtime
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://tradepilot.yassinecastro.com
ALLOWED_ORIGINS=https://tradepilot.yassinecastro.com

# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>
SUPABASE_SCHEMA=tradepilot
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<key>
VITE_MAGIC_LINK_REDIRECT_PATH=/auth/callback

# API keys
API_KEY_ROTATION_GRACE_HOURS=24
API_KEY_LAST_USED_THROTTLE_MS=60000

# OpenAI - optional, only powers the analytics AI coach
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4.1
LLM_TEMPERATURE=0.1

# Redis
REDIS_URL=redis://redis:6379

# EA tuning (defaults shown)
EA_SERVER_PING_INTERVAL_MS=10000
EA_HEARTBEAT_TIMEOUT_MS=30000
EA_PRESENCE_TTL_MS=45000

# Frontend (Vite build args)
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=auto
```
