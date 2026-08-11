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

## Migrations

`migrations/` holds dated SQL either side of the v2 rewrite, so check the date
before running anything.

| File | Run it? |
| ---- | ------- |
| `2026-05-06-backend-hardening.sql` | No — pre-v2, already folded into the schema file. It recreates tables v2 removes. |
| `2026-06-09-trade-history-imports.sql` | No — pre-v2, already folded in. |
| `2026-08-09-cot-history.sql` | **Yes** — post-v2. `cot_history` is not in the schema file, so the COT feature has no table without it. |
| `2026-08-09-sidebar-order.sql` | Optional — post-v2, but the schema file already adds `sidebar_order`. Re-running is harmless. |

Anything dated after the v2 schema file has to be applied on top of it.
