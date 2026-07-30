# Database

Apply **`tradepilot-schema-v2.sql`** in the Supabase SQL editor. It is the single
canonical setup file: re-runnable, and safe on both a fresh database and an
existing v1 (Telegram signal router) database.

It is destructive for the signal era on purpose — `signals`,
`telegram_connections`, `telegram_channels`, `copier_programs`,
`copier_invite_codes` and `follower_devices` are dropped. Analytics data
(`trade_executions`, `ea_account_status_snapshots`, `trade_history_files`,
`user_symbols`) is preserved, and existing `users.api_key` values are migrated
into hashed `api_keys` rows so terminals already in the field keep working.

After applying it, add `tradepilot` to Supabase → Settings → API → Exposed schemas.

`migrations/` holds the dated v1 migrations for historical reference only. Do not
run them against a v2 database — they recreate tables v2 removes.
