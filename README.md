# TradePilot

TradePilot is a production-oriented SaaS monorepo that routes trading signals from Telegram into MetaTrader execution flows.

## Stack

- `apps/Server`: NestJS + Supabase + BullMQ + raw WebSocket EA gateway
- `apps/App`: React + Vite + Tailwind CSS + React Query + Zustand
- `packages/shared`: Zod schemas and DTO contracts
- `packages/config`: shared runtime env parsing and constants
- `packages/trading`: mock AI parsing and trading rule validation

## Quick start

1. Copy `.env.example` to `.env`
2. Put your Supabase project URL, service role key, and anon key into `.env`
3. Make sure `SUPABASE_URL` and `VITE_SUPABASE_URL` point to the same Supabase project
4. In Supabase Auth, add `http://localhost:5173/auth/callback` and `http://localhost:8080/auth/callback` as redirect URLs
5. Install dependencies with `npm install`
6. Create the `tradepilot` schema and tables in Supabase from `supabase/tradepilot-schema.sql`
7. Start local containers with `docker compose up --build -d`
8. Re-run the schema SQL after pulling updates that add new execution columns or status codes

## Docker runtime

- `api`: NestJS backend container on `http://localhost:4000`
- `app`: static frontend container on `http://localhost:8080`
- `redis`: local BullMQ/queue dependency
- Bull Board queue dashboard on `http://localhost:4000/admin/queues`
- PostgreSQL lives in Supabase and the backend reads/writes through the Supabase client in schema `tradepilot`
- Authentication is handled by Supabase Auth with a magic-link callback at `/auth/callback`
- The frontend and backend must use the same Supabase project for session validation to work
- Redis now powers both BullMQ and EA pub/sub fan-out for multi-instance dispatch delivery

## Notes

- Signal ingestion is queued through BullMQ.
- Execution dispatch is real-time and sent directly over WebSocket.
- Parsing uses a regex-first path with a structured AI fallback seam.
- Execution includes idempotency keys, guard checks, retry backoff, and explicit failure status codes.
- Dashboard health now includes EA latency and last-seen metadata.
- Telegram integration and AI parsing are mocked behind replaceable services.
