-- Adds the EA-reported floating profit to the current account status.
-- Safe to run more than once. Run before (or after) deploying 2.9.1; the API falls back to equity - balance until it is populated.
alter table tradepilot.ea_account_current_status add column if not exists floating_profit numeric(18,2);

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
    (user_id,account_id,account_name,balance,equity,margin,free_margin,drawdown_percent,open_positions,created_at,starting_balance,first_reported_at,floating_profit)
  values (p.user_id,p.account_id,p.account_name,p.balance,p.equity,p.margin,p.free_margin,p.drawdown_percent,p.open_positions,p.created_at,p.balance,p.created_at,(p_status->>'floating_profit')::numeric)
  on conflict (user_id,account_id) do update set
    account_name=excluded.account_name,balance=excluded.balance,equity=excluded.equity,margin=excluded.margin,
    free_margin=excluded.free_margin,drawdown_percent=excluded.drawdown_percent,
    open_positions=excluded.open_positions,created_at=excluded.created_at,
    floating_profit=excluded.floating_profit;
  perform merge_account_status_bucket(p,300);
end $$;
