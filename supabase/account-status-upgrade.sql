BEGIN;

-- Account telemetry: current state is independent of retained history.
create table if not exists tradepilot.ea_account_current_status (
  like tradepilot.ea_account_status_snapshots including defaults including constraints,
  primary key (user_id, account_id),
  foreign key (user_id) references tradepilot.users(id) on delete cascade
);
alter table tradepilot.ea_account_current_status add column if not exists starting_balance numeric(18,2);
alter table tradepilot.ea_account_current_status add column if not exists first_reported_at timestamptz;
alter table tradepilot.ea_account_current_status enable row level security;
revoke all on tradepilot.ea_account_current_status from anon, authenticated;
grant all on tradepilot.ea_account_current_status to service_role;

-- Backfill without overwriting a newer current state on subsequent schema runs.
insert into tradepilot.ea_account_current_status
  (user_id,account_id,account_name,balance,equity,margin,free_margin,drawdown_percent,open_positions,created_at,starting_balance,first_reported_at)
select distinct on (user_id,account_id)
  user_id,account_id,account_name,balance,equity,margin,free_margin,drawdown_percent,open_positions,created_at,
  first_value(balance) over w, first_value(created_at) over w
from tradepilot.ea_account_status_snapshots
window w as (partition by user_id,account_id order by created_at,id)
order by user_id,account_id,created_at desc,id desc
on conflict (user_id,account_id) do nothing;

alter table tradepilot.ea_account_status_snapshots add column if not exists bucket_start timestamptz;
alter table tradepilot.ea_account_status_snapshots add column if not exists resolution_seconds integer;
alter table tradepilot.ea_account_status_snapshots add column if not exists opening_balance numeric(18,2);
alter table tradepilot.ea_account_status_snapshots add column if not exists opening_equity numeric(18,2);
alter table tradepilot.ea_account_status_snapshots add column if not exists min_equity numeric(18,2);
alter table tradepilot.ea_account_status_snapshots add column if not exists max_equity numeric(18,2);
alter table tradepilot.ea_account_status_snapshots add column if not exists first_reported_at timestamptz;
alter table tradepilot.ea_account_status_snapshots add column if not exists sample_count bigint;
create unique index if not exists idx_ea_status_bucket on tradepilot.ea_account_status_snapshots
  (user_id,account_id,resolution_seconds,bucket_start);

create index if not exists idx_ea_status_retention on tradepilot.ea_account_status_snapshots
  (resolution_seconds,created_at);

-- Merge both individual reports and compacted buckets; preserve first/last and extrema.
create or replace function tradepilot.merge_account_status_bucket(p tradepilot.ea_account_status_snapshots, seconds integer)
returns void language plpgsql set search_path = tradepilot, pg_temp as $$
begin
  insert into ea_account_status_snapshots as h
    (user_id,account_id,account_name,balance,equity,margin,free_margin,drawdown_percent,open_positions,created_at,
     bucket_start,resolution_seconds,opening_balance,opening_equity,min_equity,max_equity,first_reported_at,sample_count)
  values (p.user_id,p.account_id,p.account_name,p.balance,p.equity,p.margin,p.free_margin,p.drawdown_percent,p.open_positions,p.created_at,
    to_timestamp(floor(extract(epoch from p.created_at)/seconds)*seconds),seconds,
    coalesce(p.opening_balance,p.balance),coalesce(p.opening_equity,p.equity),coalesce(p.min_equity,p.equity),coalesce(p.max_equity,p.equity),
    coalesce(p.first_reported_at,p.created_at),coalesce(p.sample_count,1))
  on conflict (user_id,account_id,resolution_seconds,bucket_start) do update set
    account_name = case when excluded.created_at >= h.created_at then excluded.account_name else h.account_name end,
    balance = case when excluded.created_at >= h.created_at then excluded.balance else h.balance end,
    equity = case when excluded.created_at >= h.created_at then excluded.equity else h.equity end,
    margin = case when excluded.created_at >= h.created_at then excluded.margin else h.margin end,
    free_margin = case when excluded.created_at >= h.created_at then excluded.free_margin else h.free_margin end,
    open_positions = case when excluded.created_at >= h.created_at then excluded.open_positions else h.open_positions end,
    drawdown_percent = greatest(h.drawdown_percent,excluded.drawdown_percent),
    opening_balance = case when excluded.first_reported_at < h.first_reported_at then excluded.opening_balance else h.opening_balance end,
    opening_equity = case when excluded.first_reported_at < h.first_reported_at then excluded.opening_equity else h.opening_equity end,
    min_equity = least(h.min_equity,excluded.min_equity), max_equity = greatest(h.max_equity,excluded.max_equity),
    first_reported_at = least(h.first_reported_at,excluded.first_reported_at),
    created_at = greatest(h.created_at,excluded.created_at), sample_count = h.sample_count+excluded.sample_count;
end $$;

create or replace function tradepilot.record_account_status(p_user_id uuid,p_account_id text,p_status jsonb)
returns void language plpgsql set search_path = tradepilot, pg_temp as $$
declare p ea_account_status_snapshots;
begin
  p := jsonb_populate_record(null::ea_account_status_snapshots,p_status);
  p.user_id := p_user_id; p.account_id := p_account_id;
  -- Serialize with retention and with other API instances for this account.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_account_id,0));
  p.created_at := clock_timestamp();
  insert into ea_account_current_status as c
    (user_id,account_id,account_name,balance,equity,margin,free_margin,drawdown_percent,open_positions,created_at,starting_balance,first_reported_at)
  values (p.user_id,p.account_id,p.account_name,p.balance,p.equity,p.margin,p.free_margin,p.drawdown_percent,p.open_positions,p.created_at,p.balance,p.created_at)
  on conflict (user_id,account_id) do update set
    account_name=excluded.account_name,balance=excluded.balance,equity=excluded.equity,margin=excluded.margin,
    free_margin=excluded.free_margin,drawdown_percent=excluded.drawdown_percent,
    open_positions=excluded.open_positions,created_at=excluded.created_at;
  perform merge_account_status_bucket(p,300);
end $$;

-- Bounded, transactional batches. No raw row is removed unless its summary succeeds.
-- Also compacts legacy raw snapshots. Daily summaries are retained indefinitely.
create or replace function tradepilot.compact_account_status_history(p_limit integer default 2000)
returns integer language plpgsql set search_path = tradepilot, pg_temp as $$
declare p ea_account_status_snapshots; target integer; processed integer := 0; cutoff timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(hashtextextended('tradepilot:status-compaction',0)) then return 0; end if;
  for p in select * from ea_account_status_snapshots
    where resolution_seconds is null
      or (resolution_seconds=300 and created_at < date_trunc('day',cutoff at time zone 'UTC') at time zone 'UTC' - interval '30 days')
      or (resolution_seconds=3600 and created_at < date_trunc('day',cutoff at time zone 'UTC') at time zone 'UTC' - interval '365 days')
    order by created_at,id limit greatest(1,least(p_limit,10000))
  loop
    perform pg_advisory_xact_lock(hashtextextended(p.user_id::text || ':' || p.account_id,0));
    target := case
      when p.created_at < (date_trunc('day',cutoff at time zone 'UTC') at time zone 'UTC') - interval '365 days' then 86400
      when p.created_at < (date_trunc('day',cutoff at time zone 'UTC') at time zone 'UTC') - interval '30 days' then 3600
      else 300 end;
    perform merge_account_status_bucket(p,target);
    delete from ea_account_status_snapshots where id=p.id;
    processed := processed+1;
  end loop;
  return processed;
end $$;
revoke all on function tradepilot.merge_account_status_bucket(tradepilot.ea_account_status_snapshots,integer) from public,anon,authenticated;
revoke all on function tradepilot.record_account_status(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function tradepilot.compact_account_status_history(integer) from public,anon,authenticated;
grant execute on function tradepilot.merge_account_status_bucket(tradepilot.ea_account_status_snapshots,integer) to service_role;
grant execute on function tradepilot.record_account_status(uuid,text,jsonb) to service_role;
grant execute on function tradepilot.compact_account_status_history(integer) to service_role;

COMMIT;
