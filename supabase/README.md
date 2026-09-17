# Database

Apply **`schema.sql`** for a fresh database or a full schema update.
For an existing deployment, **`account-status-upgrade.sql`** contains the same
account telemetry upgrade in a transaction. Apply either before deploying the
updated backend.

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

## Account telemetry storage

- `ea_account_current_status` has one row per user/account. Each EA report updates it atomically with history. The first observed balance and timestamp are preserved. Accounts, copier risk checks, and current analytics values read this table.
- `ea_account_status_snapshots` stores five-minute buckets, with opening/closing balance and equity, minimum/maximum equity, maximum reported drawdown, and sample count. `created_at` is the closing report timestamp; `first_reported_at` is the opening timestamp. Margin, free margin, and position count are closing values.
- A backend worker compacts up to 2,000 eligible rows each minute: five-minute data older than 30 days becomes hourly, hourly data older than 365 days becomes daily. UTC day boundaries prevent partially expired buckets. Daily summaries remain indefinitely. Legacy raw rows are folded into the appropriate buckets. Compaction merges summaries and removes source rows in the same transaction; failures roll everything back. Multiple backends coordinate through database locks.
- Trades and broker ledger events are independent of this retention. Account status no longer creates an execution-log row for every report; existing execution logs are untouched.
- Detailed trade calculations retain their 45-second cache. Current balance, equity, floating P/L, and account growth are overlaid from current state on each analytics request. History and closed-trade queries paginate past the PostgREST row cap.

The first observed balance is not necessarily the broker's original deposit. Deposits/withdrawals still require a broker ledger. Equity extrema are preserved for future historical analysis, but summaries cannot reconstruct the exact intrabucket equity path. Existing margin/exposure analytics use bucket closing values.

### Rollout

1. Apply `account-status-upgrade.sql` (or the full `schema.sql`) in Supabase before deploying the backend. It backfills current state without deleting existing history.
2. Deploy the updated backend. Its worker then gradually compacts history automatically; monitor retention warnings in backend logs.
3. Verify the current balance against the terminal. No EA or frontend rebuild is required.

Reverting the backend writer would resume raw inserts and stop refreshing the new current-state table. Roll back readers and writers together if necessary. Do not drop the new tables during rollback; summaries preserve history that has already been compacted.

### Regression checks

From the repository root, set `TS_NODE_PROJECT=apps/server/tsconfig.json`, then run:

```
node -r ts-node/register -r tsconfig-paths/register apps/server/src/database/read-all-pages.test.ts
node -r ts-node/register -r tsconfig-paths/register apps/server/src/analytics/services/account-status.test.ts
npm run typecheck --workspace=@tradepilot/server
npm run build --workspace=@tradepilot/server
```

In an **isolated PostgreSQL test database**, apply `tests/account-status-setup.sql`, then `account-status-upgrade.sql`, then `tests/account-status.sql` with `psql -v ON_ERROR_STOP=1`. The setup creates test roles/schema and must never run against production. The assertions cover current-state uniqueness, baseline preservation, bucket chronology/extrema, legacy compaction, retention tiers, repeated compaction, and restricted access.
