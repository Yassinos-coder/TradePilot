create table if not exists tradepilot.trade_history_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  display_name text not null,
  original_filename text not null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  file_size bigint not null default 0,
  platform text not null default 'GENERIC' check (platform in ('MT4', 'MT5', 'GENERIC')),
  parsed_trade_count integer not null default 0 check (parsed_trade_count >= 0),
  skipped_row_count integer not null default 0 check (skipped_row_count >= 0),
  status text not null default 'UPLOADED' check (status in ('UPLOADED', 'PARSED', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_trade_history_files_updated_at on tradepilot.trade_history_files;
create trigger trg_trade_history_files_updated_at
before update on tradepilot.trade_history_files
for each row execute function tradepilot.set_updated_at();

create index if not exists idx_trade_history_files_user_created_at
on tradepilot.trade_history_files(user_id, created_at desc);

alter table tradepilot.trade_executions
add column if not exists account_id text;

update tradepilot.trade_executions
set account_id = 'default'
where account_id is null;

alter table tradepilot.trade_executions
alter column account_id set not null;

alter table tradepilot.trade_executions
add column if not exists account_name text;

create unique index if not exists idx_trade_executions_user_account_ticket
on tradepilot.trade_executions(user_id, account_id, ticket);

alter table tradepilot.trade_history_files enable row level security;

grant all on tradepilot.trade_history_files to postgres, service_role;
grant select, delete on tradepilot.trade_history_files to authenticated;

drop policy if exists service_role_trade_history_files on tradepilot.trade_history_files;
create policy service_role_trade_history_files
on tradepilot.trade_history_files
for all
to service_role
using (true)
with check (true);

drop policy if exists trade_history_files_select_own on tradepilot.trade_history_files;
create policy trade_history_files_select_own
on tradepilot.trade_history_files
for select
to authenticated
using (
  exists (
    select 1
    from tradepilot.users u
    where u.id = trade_history_files.user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists trade_history_files_delete_own on tradepilot.trade_history_files;
create policy trade_history_files_delete_own
on tradepilot.trade_history_files
for delete
to authenticated
using (
  exists (
    select 1
    from tradepilot.users u
    where u.id = trade_history_files.user_id
      and u.auth_user_id = auth.uid()
  )
);
