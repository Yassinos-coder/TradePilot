create role anon; create role authenticated; create role service_role; create schema tradepilot; create table tradepilot.users(id uuid primary key);
create table if not exists tradepilot.ea_account_status_snapshots (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references tradepilot.users(id) on delete cascade,
  account_id       text        not null,
  account_name     text,
  balance          numeric(18,2) not null,
  equity           numeric(18,2) not null,
  margin           numeric(18,2) not null,
  free_margin      numeric(18,2) not null,
  drawdown_percent numeric(8,3)  not null,
  open_positions   integer       not null default 0,
  created_at       timestamptz   not null default now()
);


-- Legacy rows exercise the upgrade's current-state backfill.
insert into tradepilot.users values ('00000000-0000-0000-0000-000000000002');
insert into tradepilot.ea_account_status_snapshots(user_id,account_id,balance,equity,margin,free_margin,drawdown_percent,open_positions,created_at)
values ('00000000-0000-0000-0000-000000000002','legacy',200,200,0,200,0,0,'2026-07-30T00:00:00Z'),
       ('00000000-0000-0000-0000-000000000002','legacy',149.65,154.55,0,154.55,0,0,'2026-09-17T00:00:00Z');
