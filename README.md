# TradePilot

TradePilot is a production-oriented SaaS monorepo that routes trading signals from Telegram into MetaTrader execution flows.

## Stack

- `apps/server`: NestJS + Supabase + BullMQ + raw WebSocket EA gateway
- `apps/App`: React + Vite + Tailwind CSS + React Query + Zustand
- `packages/shared`: Zod schemas and DTO contracts
- `packages/config`: shared runtime env parsing and constants
- `packages/trading`: regex-first trading rule parsing and validation helpers

## Quick start

1. Copy `.env.example` to `.env`
2. Put your Supabase project URL, service role key, and anon key into `.env`
3. Add your Telegram app credentials from `https://my.telegram.org` as `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and set a long `TELEGRAM_SESSION_SECRET`
4. Make sure `SUPABASE_URL` and `VITE_SUPABASE_URL` point to the same Supabase project
5. In Supabase Auth, add `http://localhost:5173/auth/callback` and `http://localhost:8080/auth/callback` as redirect URLs
6. Install dependencies with `npm install`
7. Create the `tradepilot` schema and tables in Supabase from `supabase/tradepilot-schema.sql`
8. Start local containers with `docker compose up --build -d`
9. Re-run the schema SQL after pulling updates that add new execution columns or Telegram connection tables

## EC2 deployment with Nginx Proxy Manager

Use `docker-compose.prod.yml` when deploying behind Nginx Proxy Manager on `tradepilot.yassinecastro.com`.

1. Copy `.env.production.example` to `.env` on the server
2. Fill in your real Supabase values
3. Keep `VITE_API_BASE_URL=/api` and `VITE_WS_BASE_URL=auto`
4. Set `CORS_ORIGIN` and `ALLOWED_ORIGINS` to `https://tradepilot.yassinecastro.com`
5. Start with `docker-compose -f docker-compose.prod.yml up --build -d`

Recommended Nginx Proxy Manager target:

- Forward `tradepilot.yassinecastro.com` to the app container on port `8080`
- The app container proxies `/api`, `/ws/ea`, and `/admin/queues` to the backend internally
- Supabase Auth redirect URLs must include `https://tradepilot.yassinecastro.com/auth/callback`

## Docker runtime

- `api`: NestJS backend container on `http://localhost:4000`
- `app`: static frontend container on `http://localhost:8080`
- `redis`: local BullMQ/queue dependency
- Bull Board queue dashboard on `http://localhost:4000/admin/queues`
- PostgreSQL lives in Supabase and the backend reads/writes through the Supabase client in schema `tradepilot`
- Authentication is handled by Supabase Auth with a magic-link callback at `/auth/callback`
- The frontend and backend must use the same Supabase project for session validation to work
- Redis now powers both BullMQ and EA pub/sub fan-out for multi-instance dispatch delivery
- Telegram uses a real MTProto user session flow, encrypted server-side before it is stored in Supabase

## Notes

- Signal ingestion is queued through BullMQ.
- Execution dispatch is real-time and sent directly over WebSocket.
- Parsing uses a regex-first path with a structured AI fallback seam.
- Execution includes idempotency keys, guard checks, retry backoff, and explicit failure status codes.
- Dashboard health now includes EA latency and last-seen metadata.
- Telegram channels are synced from the connected Telegram account and can be enabled per user.
