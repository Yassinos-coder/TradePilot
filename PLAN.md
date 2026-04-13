# TradePilot — Complete Implementation Plan

## Context

TradePilot is a SaaS platform that routes trading signals from Telegram channels into MetaTrader 4/5 EAs in real time. Users connect their MT4/MT5 EA using an API key, configure risk settings and allowed symbols, then let the system automatically execute parsed signals.

The monorepo scaffold is ~90% complete. This plan documents the full architecture, what is already implemented, and the remaining gaps to close before the system is production-ready.

---

## Architecture Overview

```
Telegram (mock)
    │
    ▼
POST /api/signals/simulate   (trigger)
    │
    ▼
SignalsService.ingest()       ← saves to DB with PENDING status
    │                         ← pushes job to BullMQ (SIGNAL_INGESTION_QUEUE)
    ▼
SignalsProcessor.process()    ← BullMQ consumer
    │  mockAiParseSignal()     ← @tradepilot/trading
    │  validateSignalBusiness() ← @tradepilot/trading
    │  status → VALIDATED
    ▼
ExecutionService.dispatch()   ← real-time, no queue
    │  retry (max 3, exponential backoff)
    │  status → DISPATCHED or FAILED
    ▼
EaGatewayService              ← WebSocket server on /ws/ea
    │  { type: "signal", data: EaSignalPayload }
    ▼
MetaTrader EA (WebSocket client)
```

---

## Monorepo Structure

```
/
├── apps/
│   ├── api/                    NestJS backend (port 4000)
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   ├── auth/           JWT guard + /auth/me
│   │   │   ├── users/          profile + API key rotation
│   │   │   ├── accounts/       trading accounts CRUD
│   │   │   ├── settings/       risk controls CRUD
│   │   │   ├── signals/        ingestion + BullMQ processor
│   │   │   ├── telegram/       mock channels + simulate
│   │   │   ├── execution/      dispatch + retry + logs
│   │   │   ├── ea/             WebSocket gateway
│   │   │   ├── dashboard/      aggregated overview
│   │   │   ├── database/       Supabase client singleton
│   │   │   └── common/         guard, pipe, decorators, utils
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                    React + Vite + Tailwind (port 5173/8080)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── pages/          Auth, Dashboard, Settings, Telegram, Accounts
│       │   ├── components/
│       │   │   ├── ui/         Button, Input, Card, Badge, Toggle
│       │   │   ├── dashboard/  EaSocketDemoCard
│       │   │   ├── brand/      TradePilotLogo
│       │   │   └── layout/     AppShell (sidebar + content)
│       │   ├── lib/            api.ts, query-client.ts, supabase.ts, utils.ts
│       │   ├── store/          auth-store.ts (Zustand)
│       │   └── styles.css
│       └── package.json
│
├── packages/
│   ├── shared/                 Zod schemas + TypeScript types
│   │   └── src/index.ts        SignalDTO, UserDTO, SettingsDTO, WS messages
│   ├── config/                 Env parsing + constants
│   │   └── src/
│   │       ├── env.ts          serverEnvSchema / clientEnvSchema + parse fns
│   │       └── constants.ts    queue name, WS path, default symbols/sessions
│   └── trading/                Signal parsing + business rule validation
│       └── src/
│           ├── parser.ts       mockAiParseSignal() → SignalDTO
│           └── validation.ts   validateSignalBusinessRules() → EaSignalPayload
│
├── supabase/
│   └── tradepilot-schema.sql   Complete PostgreSQL schema with RLS
│
├── docker-compose.yml          Redis + API + Web containers
├── package.json                npm workspaces root
├── turbo.json                  Turborepo task graph
├── tsconfig.base.json          Shared TS config (ES2022, strict)
├── .env.example
└── .gitignore
```

---

## Database Schema (Supabase / PostgreSQL)

Schema: `tradepilot`

| Table | Key Columns |
|-------|-------------|
| `users` | `id` (auth.users FK), `email`, `api_key` (uuid), `created_at` |
| `accounts` | `id`, `user_id`, `name`, `broker`, `created_at` |
| `settings` | `id`, `user_id`, `risk_percent`, `max_trades`, `allowed_symbols` (json), `sessions` (json) |
| `signals` | `id`, `user_id`, `raw_message`, `parsed_data` (json), `status` (PENDING/VALIDATED/DISPATCHED/FAILED) |
| `execution_logs` | `id`, `user_id`, `signal_id`, `status` (RECEIVED/DISPATCHED/RETRIED/FAILED), `message` |
| `telegram_channels` | `id`, `user_id`, `external_id`, `name`, `enabled` |

RLS policies enforce row-level isolation per authenticated user. Service role bypasses RLS for internal operations.

---

## Backend Modules

### Auth Module
- **File:** `apps/api/src/auth/`
- **Service:** Validates Supabase JWT, calls `UsersService.ensureUser()` to upsert profile
- **Controller:** `GET /api/auth/me` — returns `UserDTO` for the authenticated caller
- **Guard:** `JwtAuthGuard` — applies to all protected routes via `@UseGuards(JwtAuthGuard)`

### Users Module
- **File:** `apps/api/src/users/`
- **Service:**
  - `ensureUser(supabaseUser)` — upserts user row, auto-generates API key if none
  - `getProfile(userId)` — returns `UserDTO` with masked API key suffix
  - `rotateApiKey(userId)` — generates new `uuid()`, updates DB, returns new key
- **Controller:** `POST /api/users/rotate-api-key`

### Accounts Module
- **File:** `apps/api/src/accounts/`
- **Service:** Standard CRUD against `accounts` table (no credentials stored)
- **Controller:** `GET/POST /api/accounts`, `DELETE /api/accounts/:id`

### Settings Module
- **File:** `apps/api/src/settings/`
- **Service:**
  - `getSettings(userId)` — auto-creates default row if none exists
  - `updateSettings(userId, dto)` — partial update with Zod validation
- **Controller:** `GET/PUT /api/settings`

### Signals Module
- **File:** `apps/api/src/signals/`
- **Service:**
  - `ingest(userId, rawMessage)` — inserts PENDING record, enqueues BullMQ job
  - `listRecent(userId)` — returns last N signals ordered by `created_at DESC`
- **Processor:** `SignalsProcessor` (BullMQ consumer)
  1. Calls `mockAiParseSignal(rawMessage)` from `@tradepilot/trading`
  2. Calls `validateSignalBusinessRules(parsedSignal)` for BUY/SELL logic
  3. Updates signal status to VALIDATED
  4. Calls `ExecutionService.dispatch(userId, signalId, eaPayload)`
  5. On failure: updates status to FAILED, logs error
- **Controller:** `GET /api/signals`, `POST /api/signals/simulate`

### Telegram Module
- **File:** `apps/api/src/telegram/`
- **Service:**
  - `getChannels(userId)` — returns list from `telegram_channels` (seeded from constants)
  - `toggleChannel(userId, channelId, enabled)` — update enabled flag
  - `simulateSignal(userId, channelId, rawMessage)` — calls `SignalsService.ingest()`
- **Controller:** `GET /api/telegram/channels`, `PATCH /api/telegram/channels/:id/toggle`, `POST /api/telegram/simulate`

### EA Gateway Module
- **File:** `apps/api/src/ea/`
- **Service:** Raw `ws.Server` attached to the HTTP server (not NestJS WebSockets)
  - On connection: wait for `{ type: "auth", apiKey }`, validate against DB
  - On auth success: register connection in `Map<userId, Set<WebSocket>>`
  - Heartbeat: expects `{ type: "ping" }` every `EA_HEARTBEAT_TIMEOUT_MS`, closes stale connections
  - `sendSignal(userId, payload)` — fans out to all active connections for user
  - `isConnected(userId)` — returns boolean for dashboard status

### Execution Module
- **File:** `apps/api/src/execution/`
- **Service:**
  - `dispatch(userId, signalId, payload)` — calls `EaGatewayService.sendSignal()`
  - Retries up to `DISPATCH_RETRY_COUNT` with `DISPATCH_RETRY_DELAY_MS` backoff
  - Writes `ExecutionLog` record for each attempt
  - Updates signal status to DISPATCHED or FAILED
- **Controller:** `GET /api/execution/logs`

### Dashboard Module
- **File:** `apps/api/src/dashboard/`
- **Service:**
  - Aggregates: EA online status, total signals, recent signals[], recent logs[]
  - Returns `DashboardOverviewDTO`
- **Controller:** `GET /api/dashboard/overview`

---

## WebSocket Protocol

EA connects to `ws://<host>/ws/ea`

```
// 1. EA authenticates
EA → Server:   { "type": "auth", "apiKey": "<user-api-key>" }
Server → EA:   { "type": "auth_success" }
               { "type": "auth_error", "message": "Invalid API key" }

// 2. Heartbeat (EA must send every <EA_HEARTBEAT_TIMEOUT_MS>)
EA → Server:   { "type": "ping" }
Server → EA:   { "type": "pong" }

// 3. Signal dispatch (server → EA)
Server → EA:   {
  "type": "signal",
  "data": {
    "symbol": "XAUUSD",
    "side": "BUY",
    "entry": "MARKET",
    "stop_loss": 2015,
    "take_profits": [2025, 2035]
  }
}
```

---

## Shared Types (`packages/shared`)

Key exports from `src/index.ts`:

```typescript
// Signal
SignalDTO               // symbol, side, entry, stop_loss, take_profits
signalDtoSchema         // Zod schema

// User
UserDTO                 // id, email, apiKeyMasked, apiKey
userDtoSchema

// Settings
SettingsDTO             // riskPercent, maxTrades, allowedSymbols, sessions
settingsDtoSchema

// WebSocket messages (discriminated union)
EaClientMessage         // auth | ping
EaServerMessage         // auth_success | auth_error | pong | signal | error

// Records
SignalRecord            // + id, rawMessage, parsedData, status, createdAt
ExecutionLogRecord      // + id, signalId, status, message, createdAt
DashboardOverviewDTO    // eaOnline, signalCount, recentSignals, recentLogs
```

---

## Frontend Pages & Components

### AppShell (layout)
Sticky sidebar: logo, nav links (Dashboard, Settings, Telegram, Accounts), user email + logout.
Motion-animated main content area.

### AuthPage
- Supabase Magic Link email form
- Handles both login and register (Magic Link works for both)
- Redirects to `/auth/callback` after email sent

### AuthCallbackPage
- Handles Supabase session exchange from URL hash
- Sets auth store, redirects to `/`

### DashboardPage
- 4 stat cards: EA status badge, signal count, log count, API key (last 4 chars + copy)
- Rotate API key button (`POST /api/users/rotate-api-key`)
- Recent signals table (status badge + timestamp)
- Recent execution logs list
- `EaSocketDemoCard` — connects browser WebSocket to `/ws/ea` for live demo

### SettingsPage
- Risk % slider (1–10)
- Max trades input (1–20)
- Session toggles: London, New York
- Symbol multi-select: XAUUSD, EURUSD, GBPUSD, BTCUSD, NAS100, US30
- Live JSON preview of pending changes
- Save button (`PUT /api/settings`)

### TelegramPage
- Mock channel list from `GET /api/telegram/channels`
- Toggle per channel (`PATCH /api/telegram/channels/:id/toggle`)
- Simulate signal form: text area + "Send" → `POST /api/telegram/simulate`

### AccountsPage
- List accounts from `GET /api/accounts`
- Add account form (name, broker) → `POST /api/accounts`
- Delete account → `DELETE /api/accounts/:id`

### UI Primitives (`components/ui/`)
- `Button` — variant: primary/ghost/danger, size: sm/md/lg
- `Input` — label, error state, helper text
- `Card` — padding, optional header slot
- `Badge` — variant: success/warning/error/neutral
- `Toggle` — controlled boolean with label

---

## Signal Validation Rules (`packages/trading`)

```
BUY:  stop_loss < entry_price < take_profits[all]
SELL: stop_loss > entry_price > take_profits[all]

entry = "MARKET" → skip entry comparison, use 0 sentinel
```

Parser (`mockAiParseSignal`) detects:
- Symbol via keywords (XAUUSD, EURUSD, GBPUSD, BTCUSD, NAS100, US30) or regex `([A-Z]{6}|[A-Z]{2,4}[0-9]{2,3})`
- Side: BUY/SELL keyword
- Entry: `@<number>` or `ENTRY: <number>` or "MARKET"
- SL: `SL: <number>`
- TPs: `TP1: / TP2:` or `TPS: <n1>,<n2>`

---

## Environment Variables

```bash
# Runtime
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173,http://localhost:8080

# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_SCHEMA=tradepilot

# Redis
REDIS_URL=redis://localhost:6379

# Execution tuning
DISPATCH_RETRY_COUNT=3
DISPATCH_RETRY_DELAY_MS=750
EA_HEARTBEAT_TIMEOUT_MS=30000

# Frontend (Vite)
VITE_API_BASE_URL=http://localhost:4000/api
VITE_WS_BASE_URL=ws://localhost:4000
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_MAGIC_LINK_REDIRECT_PATH=/auth/callback
```

---

## Docker & Dev Setup

```yaml
# docker-compose.yml services
redis:7-alpine       → port 6379, volume redis-data
api (Dockerfile)     → port ${API_PORT:-4000}, depends on redis
web (Dockerfile)     → port ${WEB_PORT:-8080}, build-args for Vite envs
```

### Quick Start

```bash
# 1. Install deps
npm install

# 2. Copy env
cp .env.example .env  # fill in Supabase URL + keys

# 3. Load DB schema into Supabase
#    Paste supabase/tradepilot-schema.sql into Supabase SQL editor

# 4. Start infrastructure
docker compose up redis -d

# 5. Dev (all packages hot-reload)
npm run dev

# 6. Open
#    Frontend: http://localhost:5173
#    Backend:  http://localhost:4000/api
#    Bull Board: http://localhost:4000/admin/queues
```

---

## Implementation Gaps to Close

### Critical (blocking functionality)
1. **`apps/api/src/users/users.controller.ts`** — `POST /api/users/rotate-api-key` endpoint
2. **`apps/api/src/signals/signals.controller.ts`** — `GET /api/signals` + `POST /api/signals/simulate`
3. **`apps/api/src/execution/execution.controller.ts`** — `GET /api/execution/logs`
4. **`apps/api/src/dashboard/dashboard.controller.ts`** — `GET /api/dashboard/overview`
5. **`apps/api/src/telegram/telegram.controller.ts`** — channels + toggle + simulate endpoints
6. **`apps/api/src/accounts/accounts.controller.ts`** — CRUD endpoints
7. **`apps/api/src/settings/settings.controller.ts`** — GET/PUT endpoints
8. **`apps/web/src/pages/AuthPage.tsx`** — magic link form
9. **`apps/web/src/pages/TelegramPage.tsx`** — channel list + toggle + simulate
10. **`apps/web/src/pages/AccountsPage.tsx`** — accounts CRUD UI
11. **`apps/web/src/components/dashboard/EaSocketDemoCard.tsx`** — live WS demo

### Nice-to-have (production hardening)
12. Per-package `tsconfig.json` files (if not present)
13. `apps/web/Dockerfile` — multi-stage nginx build
14. Rate limiting on `/api/signals/simulate`
15. Health check endpoint `GET /api/health`

---

## Verification Steps

### End-to-end signal flow
1. Start: `npm run dev`
2. Register via Magic Link → confirm redirect to dashboard
3. Note API key shown on dashboard
4. Open wscat: `wscat -c ws://localhost:4000/ws/ea`
5. Send: `{"type":"auth","apiKey":"<your-api-key>"}`
6. Expect: `{"type":"auth_success"}`
7. In TradePilot UI → Telegram → Simulate with text: `XAUUSD BUY @ 2020 SL: 2010 TP1: 2030 TP2: 2040`
8. Expect: WS client receives `{"type":"signal","data":{...}}`
9. Dashboard → recent signals shows DISPATCHED status
10. Bull Board at `/admin/queues` shows completed job

### Settings persistence
1. Change risk % + max trades in Settings page → Save
2. Refresh page → values persist from `GET /api/settings`

### Docker build
```bash
docker compose build
docker compose up
# Verify: http://localhost:8080 (web), http://localhost:4000/api/health (api)
```
