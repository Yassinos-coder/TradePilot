# Database

Apply **`schema.sql`** in the Supabase SQL editor. It is the only SQL file in the
project — there are no migrations to run alongside it.

Every statement is idempotent, so it is safe on a fresh database and safe to
re-run on a live one. Re-run it after any pull that adds tables or indexes.

After applying it, add `tradepilot` to Supabase → Settings → API → Exposed schemas.

## What it creates

15 tables in the `tradepilot` schema, plus the functions, triggers, indexes and
row-level-security policies they depend on.

The API connects with the service-role key and bypasses RLS; the policies exist
so that the anon and authenticated keys can only ever reach a user's own rows.
`cot_history` is the one exception — it holds public CFTC market data with no
user dimension, so it has RLS enabled and no policies at all, leaving it
reachable only by the backend.

It depends on Supabase specifically, not just Postgres: `tradepilot.users` keys
off `auth.users`, the policies use `auth.uid()`, and grants target the
`service_role`, `authenticated` and `anon` roles.
