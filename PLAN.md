# TradePilot — Implementation Status

## Status: Production ✓

All core features are live at `https://tradepilot.sidedevelopments.com`.

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

**Connection**: secure WebSocket (`wss://`) to `api.tradepilot.sidedevelopments.com` on port 443, through Berth's proxy. The API key authenticates the session.

**MT5 EA features**: grouped inputs (Server / Auth / Trade Execution / Connection), `CTrade` order placement, multi-TP splitting, account status push every 10s, trade event reporting (OPEN / CLOSED / REJECTED), exponential backoff reconnect, 4s HTTP upgrade wait loop

**Known MT5 setup steps**:

1. Tools → Options → Expert Advisors → Allow WebRequest → add `api.tradepilot.sidedevelopments.com`
2. Compile in MetaEditor (F7)
3. Inputs: `ServerPort=443`, `UseSSL=true`, paste an EA key (`tp_ea_...`) from Settings > API & Keys

### Backend modules

| Module | Key endpoints |
| ------ | ------------- |
| Auth | `GET /api/auth/me` |
| Users | `GET/PUT /api/users/me`, email change, password change, sessions |
| API keys | `GET/POST /api/api-keys`, `POST /api/api-keys/:id/rotate`, `DELETE /api/api-keys/:id` |
| Accounts | `GET/POST /api/accounts`, `DELETE /api/accounts/:id`, `POST /api/accounts/:id/promote-master` |
| Settings | `GET/PUT /api/settings`, `PUT /api/settings/auto-copy`, `PUT /api/settings/api-trade-opening`, `PUT /api/settings/sidebar-order` |
| Copier | `GET /api/copier/overview`, `GET/POST/PUT/DELETE /api/copier/links`, `PUT /api/copier/master`, `GET /api/copier/events` |
| Manual trade | Manual order entry against a connected terminal |
| Trade API | `POST /api/v1/trades/open|close|modify`, `GET /api/v1/trades/positions` (REST key auth) |
| Analytics | `GET /api/analytics/summary`, `daily-summary`, `ai-analysis`, `trades`, `logs`, `history-files` |
| Assistant analytics | Conversational analytics over the same trade history |
| COT | `GET /api/cot/markets`, `GET /api/cot/reports/:code`, `GET /api/cot/reports/:code/history` |
| Notifications | `GET/PUT /api/notifications/preferences` |
| Dashboard | `GET /api/dashboard/overview` |
| Health | `GET /api/health` → `{status, api, database, redis}` |

### Frontend pages

- **Overview**: copier status strip, monthly/annual net, unrealized P&L, trading calendar, trade history
- **Trade Copier**: master selector, per-slave link cards with a risk drawer, live copy feed
- **Analytics**: full performance metrics, equity curve, drawdown, AI coach, history import
- **Calculators**: lot sizing, pip value/P&L, compounding with Monte Carlo paths, risk of ruin, margin/leverage
- **Open Trades**: live positions with manual close and modify
- **COT**: weekly Commitments of Traders positioning, index windows and AI interpretation
- **News**: placeholder — the economic calendar is shelved until it can be rebuilt on a source that publishes released figures
- **Accounts**: connected terminals, role badges, promote to master
- **Settings**: My Account, Security & Sign-in, API & Keys, Copier Defaults, Notifications

---

## Infrastructure

### VPS + Berth

Everything runs on a single VPS managed by [Berth](https://berth.sh), a
self-hosted deployment panel. Berth's proxy terminates TLS with automatic
Let's Encrypt certificates, so no container handles certificates itself.

```text
Internet
  │
  ▼ :443 (HTTPS / WSS)
Berth proxy (Caddy, automatic Let's Encrypt)
  │  tradepilot.sidedevelopments.com      → tradepilot-frontend:80
  │  api.tradepilot.sidedevelopments.com  → tradepilot-backend:4000
  ▼
tradepilot-frontend (stock nginx serving the built SPA)
  │  /api/*  and  /ws/ea   → tradepilot-backend:4000
  ▼
tradepilot-backend (NestJS, port 4000)
  │  REST API + the /ws/ea gateway MetaTrader terminals connect to
  ▼
redis (EA presence + copy dispatch pub/sub, port 6379)
```

### Deploying

Push to `production`. Berth rebuilds the changed service from its Dockerfile
(`apps/server/Dockerfile`, `apps/App/Dockerfile`) and rolls it over. Build logs,
rollbacks and per-service CPU/RAM limits live in the panel. There is no CI
workflow in the repo and no SSH step.

### Configuration

Environment values are set per service under **Variables** in Berth rather than
from a `.env` file on the host. Managed dependencies are provisioned as their own
Berth services and reached over the internal Docker network by service name, so
they need no public exposure.

The compose files in the repo are for local development only.

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
| `user_symbols` | per-account broker symbol map, for symbol resolution |
| `user_sessions` | one row per browser session, folded by device on read |
| `notification_preferences` | per-user channel and event toggles |
| `trade_history_files` | uploaded statement imports and their parse results |
| `cot_history` | weekly CFTC Commitments of Traders rows, no user dimension |

Schema must be re-run after any pull that adds tables. Add `tradepilot` to Supabase Exposed Schemas in API settings.

---

## Environment variables

`.env.example` is the authoritative list and is kept current; this file
deliberately does not duplicate it, because the copy that used to live here
drifted out of date. In production these are set per service under **Variables**
in Berth rather than in a file on the host.

Groups, and what each is for:

| Group | Purpose |
| ----- | ------- |
| Runtime | `NODE_ENV`, ports, `CORS_ORIGIN` / `ALLOWED_ORIGINS`, `PUBLIC_APP_URL` |
| Supabase | Service-role credentials plus the `tradepilot` schema, and the anon key the browser uses |
| Redis | `REDIS_URL`, and the Bull Board dashboard credentials |
| SMTP | Transactional email — magic links, email-change and password-reset |
| EA tuning | Heartbeat, ping interval, presence TTL and dispatch ack timeout |
| API keys | Rotation grace window and the last-used write throttle |
| LLM | Anthropic and OpenAI keys and models, for the analytics coach and COT interpretation |
| Frontend | `VITE_*` build args baked into the SPA at build time |
