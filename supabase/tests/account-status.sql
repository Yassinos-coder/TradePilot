-- Run only in an isolated test database after account-status-setup.sql and the upgrade.
begin;
do $$ begin
  assert (select starting_balance=200 and balance=149.65 from tradepilot.ea_account_current_status where account_id='legacy'), 'legacy backfill lost baseline/current balance';
end $$;
delete from tradepilot.users where id='00000000-0000-0000-0000-000000000002';
insert into tradepilot.users values ('00000000-0000-0000-0000-000000000001');
do $$
declare u uuid := '00000000-0000-0000-0000-000000000001'; p tradepilot.ea_account_status_snapshots; n integer; total bigint;
begin
  perform tradepilot.record_account_status(u,'live','{"balance":200,"equity":210,"margin":10,"free_margin":200,"drawdown_percent":0,"open_positions":2}');
  perform tradepilot.record_account_status(u,'live','{"balance":149.65,"equity":154.55,"margin":21.44,"free_margin":133.11,"drawdown_percent":5,"open_positions":2}');
  assert (select count(*)=1 from tradepilot.ea_account_current_status where account_id='live'), 'current row must be unique';
  assert (select balance=149.65 and starting_balance=200 and equity=154.55 from tradepilot.ea_account_current_status where account_id='live'), 'live balance or baseline lost';
  assert (select sum(sample_count)=2 from tradepilot.ea_account_status_snapshots where account_id='live'), 'report count lost';

  p.user_id:=u; p.account_id:='historical'; p.balance:=200; p.equity:=220; p.margin:=10; p.free_margin:=210; p.drawdown_percent:=0; p.open_positions:=1;
  p.created_at:=date_trunc('day',now())-interval '400 days'+interval '10 minutes';
  perform tradepilot.merge_account_status_bucket(p,300);
  p.created_at:=p.created_at+interval '10 seconds'; p.balance:=149.65; p.equity:=140;
  perform tradepilot.merge_account_status_bucket(p,300);
  -- Merge an out-of-order report: it must not replace the closing balance.
  p.created_at:=p.created_at-interval '5 seconds'; p.balance:=180; p.equity:=250;
  perform tradepilot.merge_account_status_bucket(p,300);
  assert (select count(*)=1 from tradepilot.ea_account_status_snapshots where account_id='historical'), 'bucket not coalesced';
  assert (select balance=149.65 and opening_balance=200 and min_equity=140 and max_equity=250 and sample_count=3 from tradepilot.ea_account_status_snapshots where account_id='historical'), 'bucket extrema or chronology lost';

  -- Raw legacy reports are merged into the same daily summary.
  insert into tradepilot.ea_account_status_snapshots(user_id,account_id,balance,equity,margin,free_margin,drawdown_percent,open_positions,created_at)
  values (u,'historical',100,90,10,80,10,1,date_trunc('day',now())-interval '400 days'+interval '20 minutes'),
         (u,'hourly',100,101,1,100,0,1,date_trunc('day',now())-interval '40 days'+interval '20 minutes'),
         (u,'recent',100,101,1,100,0,1,date_trunc('day',now())-interval '2 days'+interval '20 minutes');
  n:=tradepilot.compact_account_status_history(1000);
  assert n=4, 'unexpected compaction count';
  assert (select count(*)=1 from tradepilot.ea_account_status_snapshots where account_id='historical'), 'daily bucket duplicated';
  assert (select balance=100 and opening_balance=200 and min_equity=90 and max_equity=250 and sample_count=4 and resolution_seconds=86400 from tradepilot.ea_account_status_snapshots where account_id='historical'), 'daily aggregation lost data';
  assert (select resolution_seconds=3600 from tradepilot.ea_account_status_snapshots where account_id='hourly'), 'hourly retention failed';
  assert (select resolution_seconds=300 from tradepilot.ea_account_status_snapshots where account_id='recent'), 'five-minute retention failed';
  assert tradepilot.compact_account_status_history(1000)=0, 'compaction must be idempotent';
  assert not has_function_privilege('authenticated','tradepilot.record_account_status(uuid,text,jsonb)','execute'), 'RPC exposed to clients';
  assert not has_table_privilege('authenticated','tradepilot.ea_account_current_status','select'), 'current state exposed';
end $$;
rollback;
