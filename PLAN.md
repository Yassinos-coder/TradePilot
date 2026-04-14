# TradePilot — Implementation Status

## Status: Production ✓

All core features are live at `https://tradepilot.yassinecastro.com`.

---

## What is built

### Signal pipeline

- Telegram MTProto session (gramjs) listens to user-enabled channels
- Messages ingested via `POST /api/signals/ingest` → BullMQ job queue
- `SignalsProcessor` runs regex parse first, falls back to OpenAI (`gpt-4.1`) for ambiguous signals
- Validated signals dispatched via `ExecutionService` with retry × 3 + exponential backoff
- Status progression: `PENDING → VALIDATED → DISPATCHED | FAILED`

### EA WebSocket gateway

- Raw `ws.Server` on `/ws/ea` (NestJS HTTP server upgrade)
- Auth via `{ type: "auth", apiKey: "tp_xxx" }` → validated against DB
- Presence tracked in Redis with TTL — survives multi-instance deploys
- Server pings EA every 10s; EA must pong within 35s or connection is dropped
- Redis pub/sub fan-out for signal delivery across multiple backend instances
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
3. Inputs: `ServerPort=4000`, `UseSSL=false`, paste `tp_xxx` API key

### Backend modules

| Module | Key endpoints |
| ------ | ------------- |
| Auth | `GET /api/auth/me` |
| Users | `GET /api/users/me`, `POST /api/users/api-key/regenerate` |
| Accounts | `GET/POST /api/accounts`, `DELETE /api/accounts/:id`, `GET /api/accounts/status` |
| Settings | `GET/PUT /api/settings` |
| Signals | `GET /api/signals`, `POST /api/signals/ingest` |
| Execution | `GET /api/execution/logs`, `GET /api/execution/trades`, `GET /api/execution/analytics` |
| Telegram | `GET /api/telegram/connection`, connect/verify/disconnect, `GET /api/telegram/channels`, sync, toggle |
| Dashboard | `GET /api/dashboard/overview` |
| Health | `GET /api/health` → `{status, api, database, redis}` |

### Frontend pages

- **Dashboard**: EA status, account balance/equity, signal count, execution logs, API key management, WS demo card
- **Telegram**: connect with phone number + OTP, sync channels, toggle per channel
- **Settings**: risk %, max trades, session toggles, symbol multi-select
- **Accounts**: CRUD trading accounts
- **Analytics**: execution history, trade P&L

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
  │  /admin/queues   → api:4000
  ▼
tradepilot-backend (NestJS, port 4000)
  │  also exposed directly on 0.0.0.0:4000 for EA plain WS
  ▼
tradepilot-redis (BullMQ + EA pub/sub, port 6379)
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
| `users` | auth link, email, `api_key` (`tp_` + 48 hex) |
| `accounts` | trading account records per user |
| `settings` | risk %, max trades, symbols, sessions |
| `signals` | raw message, parsed JSON, status |
| `execution_logs` | per-attempt dispatch log with details JSON |
| `telegram_connections` | MTProto session ciphertext (AES-256-GCM), status |
| `telegram_channels` | synced channel list, enabled flag |
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

# Telegram
TELEGRAM_API_ID=<integer from my.telegram.org>
TELEGRAM_API_HASH=<hash from my.telegram.org>
TELEGRAM_SESSION_SECRET=<random 32+ char string>

# OpenAI
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4.1
LLM_TEMPERATURE=0.3

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
