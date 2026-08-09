-- Weekly Commitments of Traders history, backfilled from the CFTC's public
-- Socrata datasets. Public market data with no user dimension: every row is the
-- same for every account, so this table is read by all and written only by the
-- service role.

create table if not exists tradepilot.cot_history (
  contract_code text not null,
  report_date date not null,
  mode text not null check (mode in ('futures', 'combined')),

  open_interest bigint not null default 0,

  -- The speculative bucket for whichever taxonomy covers this market:
  -- Managed Money for commodities, Leveraged Funds for financials.
  spec_long bigint not null default 0,
  spec_short bigint not null default 0,

  -- Legacy categories, which exist for every market and every year on record.
  noncomm_long bigint not null default 0,
  noncomm_short bigint not null default 0,
  comm_long bigint not null default 0,
  comm_short bigint not null default 0,
  nonrept_long bigint not null default 0,
  nonrept_short bigint not null default 0,

  spec_net bigint generated always as (spec_long - spec_short) stored,
  noncomm_net bigint generated always as (noncomm_long - noncomm_short) stored,
  comm_net bigint generated always as (comm_long - comm_short) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (contract_code, mode, report_date)
);

-- Every read is "one contract, one mode, most recent N weeks".
create index if not exists idx_cot_history_contract_mode_date
on tradepilot.cot_history(contract_code, mode, report_date desc);

drop trigger if exists trg_cot_history_updated_at on tradepilot.cot_history;
create trigger trg_cot_history_updated_at
before update on tradepilot.cot_history
for each row execute function tradepilot.set_updated_at();

alter table tradepilot.cot_history enable row level security;

-- No policies are defined, so anon and authenticated roles get nothing while the
-- service-role key the API uses bypasses RLS entirely. Ingestion and reads both
-- go through the backend.
