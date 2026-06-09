create schema if not exists tradepilot;

create extension if not exists pgcrypto;

grant usage on schema tradepilot to postgres, anon, authenticated, service_role;

create or replace function tradepilot.generate_api_key()
returns text as $$
begin
  return 'tp_' || encode(gen_random_bytes(24), 'hex');
end;
$$ language plpgsql;

create or replace function tradepilot.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists tradepilot.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  password text,
  api_key text not null unique default tradepilot.generate_api_key(),
  created_at timestamptz not null default now()
);

alter table tradepilot.users
  add column if not exists auth_user_id uuid;

alter table tradepilot.users
  add column if not exists password text;

alter table tradepilot.users
  alter column password drop not null;

alter table tradepilot.users
  alter column api_key set default tradepilot.generate_api_key();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tradepilot_users_auth_user_id_fkey'
  ) then
    alter table tradepilot.users
      add constraint tradepilot_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists idx_tradepilot_users_auth_user_id
  on tradepilot.users(auth_user_id)
  where auth_user_id is not null;

create table if not exists tradepilot.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  name text not null,
  broker text not null,
  created_at timestamptz not null default now()
);

create table if not exists tradepilot.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references tradepilot.users(id) on delete cascade,
  risk_percent numeric(5,2) not null,
  max_trades integer not null,
  allowed_symbols jsonb not null default '[]'::jsonb,
  sessions jsonb not null default '{}'::jsonb,
  mode text not null default 'AUTO' check (mode in ('AUTO', 'SEMI_AUTO', 'MANUAL')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tradepilot.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  raw_message text not null,
  raw_message_hash text,
  source_channel text,
  parsed_data jsonb,
  confidence numeric(4,3),
  status text not null check (
    status in (
      'PENDING',
      'VALIDATED',
      'DISPATCHED',
      'PARSE_FAILED',
      'VALIDATION_FAILED',
      'EA_OFFLINE',
      'DISPATCH_TIMEOUT',
      'EXECUTION_REJECTED'
    )
  ),
  created_at timestamptz not null default now()
);

create table if not exists tradepilot.execution_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  signal_id uuid references tradepilot.signals(id) on delete set null,
  execution_key text,
  attempt integer not null default 0,
  status text not null check (
    status in (
      'RECEIVED',
      'RETRYING',
      'DISPATCHED',
      'PARSE_FAILED',
      'VALIDATION_FAILED',
      'EA_OFFLINE',
      'DISPATCH_TIMEOUT',
      'EXECUTION_REJECTED'
    )
  ),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists tradepilot.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references tradepilot.users(id) on delete cascade,
  phone_number text not null,
  session_ciphertext text,
  status text not null default 'DISCONNECTED' check (
    status in (
      'DISCONNECTED',
      'PENDING_CODE',
      'PENDING_PASSWORD',
      'CONNECTED',
      'ERROR'
    )
  ),
  phone_code_hash text,
  telegram_user_id text,
  username text,
  display_name text,
  last_error text,
  last_connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tradepilot.telegram_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  telegram_connection_id uuid references tradepilot.telegram_connections(id) on delete cascade,
  external_id text not null,
  name text not null,
  username text,
  kind text not null default 'CHANNEL' check (kind in ('CHANNEL', 'GROUP')),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);

alter table tradepilot.settings
  add column if not exists mode text default 'AUTO';

update tradepilot.settings
set mode = 'AUTO'
where mode is null;

alter table tradepilot.settings
  alter column mode set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'settings_mode_check'
      and conrelid = 'tradepilot.settings'::regclass
  ) then
    alter table tradepilot.settings drop constraint settings_mode_check;
  end if;

  alter table tradepilot.settings
    add constraint settings_mode_check check (mode in ('AUTO', 'SEMI_AUTO', 'MANUAL'));
exception
  when duplicate_object then null;
end $$;

alter table tradepilot.signals
  add column if not exists raw_message_hash text;

alter table tradepilot.signals
  add column if not exists confidence numeric(4,3);

alter table tradepilot.execution_logs
  add column if not exists execution_key text;

alter table tradepilot.execution_logs
  add column if not exists attempt integer default 0;

update tradepilot.execution_logs
set attempt = 0
where attempt is null;

alter table tradepilot.execution_logs
  alter column attempt set not null;

alter table tradepilot.telegram_channels
  add column if not exists telegram_connection_id uuid references tradepilot.telegram_connections(id) on delete cascade;

alter table tradepilot.telegram_channels
  add column if not exists username text;

alter table tradepilot.telegram_channels
  add column if not exists kind text default 'CHANNEL';

update tradepilot.telegram_channels
set kind = 'CHANNEL'
where kind is null;

alter table tradepilot.telegram_channels
  alter column kind set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'telegram_channels_kind_check'
      and conrelid = 'tradepilot.telegram_channels'::regclass
  ) then
    alter table tradepilot.telegram_channels drop constraint telegram_channels_kind_check;
  end if;

  alter table tradepilot.telegram_channels
    add constraint telegram_channels_kind_check check (kind in ('CHANNEL', 'GROUP'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_accounts_user_id on tradepilot.accounts(user_id);
create index if not exists idx_signals_user_created_at on tradepilot.signals(user_id, created_at desc);
create index if not exists idx_signals_user_hash_created_at on tradepilot.signals(user_id, raw_message_hash, created_at desc);
create index if not exists idx_execution_logs_user_created_at on tradepilot.execution_logs(user_id, created_at desc);
create index if not exists idx_execution_logs_execution_key on tradepilot.execution_logs(execution_key);
create index if not exists idx_telegram_connections_user_id on tradepilot.telegram_connections(user_id);
create index if not exists idx_telegram_channels_user_id on tradepilot.telegram_channels(user_id);
create index if not exists idx_telegram_channels_connection_id on tradepilot.telegram_channels(telegram_connection_id);
create unique index if not exists idx_execution_logs_dispatched_execution_key
  on tradepilot.execution_logs(execution_key)
  where status = 'DISPATCHED' and execution_key is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'signals_status_check'
      and conrelid = 'tradepilot.signals'::regclass
  ) then
    alter table tradepilot.signals drop constraint signals_status_check;
  end if;

  alter table tradepilot.signals
    add constraint signals_status_check check (
      status in (
        'PENDING',
        'VALIDATED',
        'DISPATCHED',
        'PARSE_FAILED',
        'VALIDATION_FAILED',
        'EA_OFFLINE',
        'DISPATCH_TIMEOUT',
        'EXECUTION_REJECTED'
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'execution_logs_status_check'
      and conrelid = 'tradepilot.execution_logs'::regclass
  ) then
    alter table tradepilot.execution_logs drop constraint execution_logs_status_check;
  end if;

  alter table tradepilot.execution_logs
    add constraint execution_logs_status_check check (
      status in (
        'RECEIVED',
        'RETRYING',
        'DISPATCHED',
        'PARSE_FAILED',
        'VALIDATION_FAILED',
        'EA_OFFLINE',
        'DISPATCH_TIMEOUT',
        'EXECUTION_REJECTED'
      )
    );
exception
  when duplicate_object then null;
end $$;

create or replace function tradepilot.handle_new_tradepilot_user()
returns trigger as $$
begin
  insert into tradepilot.settings (
    user_id,
    risk_percent,
    max_trades,
    allowed_symbols,
    sessions,
    mode
  )
  values (
    new.id,
    1,
    3,
    '["XAUUSD","EURUSD","GBPUSD","BTCUSD"]'::jsonb,
    '{"london": true, "newYork": true}'::jsonb,
    'AUTO'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql;

create or replace function tradepilot.handle_new_auth_user()
returns trigger as $$
begin
  update tradepilot.users
  set email = new.email
  where auth_user_id = new.id;

  if found then
    return new;
  end if;

  update tradepilot.users
  set auth_user_id = new.id,
      email = new.email
  where email = new.email
    and auth_user_id is null;

  if found then
    return new;
  end if;

  insert into tradepilot.users (
    auth_user_id,
    email,
    api_key
  )
  values (
    new.id,
    new.email,
    tradepilot.generate_api_key()
  )
  on conflict do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_settings_updated_at on tradepilot.settings;
create trigger trg_settings_updated_at
before update on tradepilot.settings
for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_telegram_connections_updated_at on tradepilot.telegram_connections;
create trigger trg_telegram_connections_updated_at
before update on tradepilot.telegram_connections
for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_telegram_channels_updated_at on tradepilot.telegram_channels;
create trigger trg_telegram_channels_updated_at
before update on tradepilot.telegram_channels
for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_tradepilot_users_default_settings on tradepilot.users;
create trigger trg_tradepilot_users_default_settings
after insert on tradepilot.users
for each row execute function tradepilot.handle_new_tradepilot_user();

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_tradepilot'
  ) then
    create trigger on_auth_user_created_tradepilot
      after insert on auth.users
      for each row execute function tradepilot.handle_new_auth_user();
  end if;
end $$;

grant all on all tables in schema tradepilot to postgres, service_role;
grant select, insert, update, delete on all tables in schema tradepilot to authenticated;
grant usage, select on all sequences in schema tradepilot to postgres, service_role, authenticated, anon;

alter default privileges in schema tradepilot
grant all on tables to postgres, service_role;

alter default privileges in schema tradepilot
grant select, insert, update, delete on tables to authenticated;

alter table tradepilot.users enable row level security;
alter table tradepilot.accounts enable row level security;
alter table tradepilot.settings enable row level security;
alter table tradepilot.signals enable row level security;
alter table tradepilot.execution_logs enable row level security;
alter table tradepilot.telegram_connections enable row level security;
alter table tradepilot.telegram_channels enable row level security;

drop policy if exists service_role_users on tradepilot.users;
create policy service_role_users
on tradepilot.users
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_accounts on tradepilot.accounts;
create policy service_role_accounts
on tradepilot.accounts
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_settings on tradepilot.settings;
create policy service_role_settings
on tradepilot.settings
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_signals on tradepilot.signals;
create policy service_role_signals
on tradepilot.signals
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_execution_logs on tradepilot.execution_logs;
create policy service_role_execution_logs
on tradepilot.execution_logs
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_telegram_connections on tradepilot.telegram_connections;
create policy service_role_telegram_connections
on tradepilot.telegram_connections
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_telegram_channels on tradepilot.telegram_channels;
create policy service_role_telegram_channels
on tradepilot.telegram_channels
for all
to service_role
using (true)
with check (true);

drop policy if exists users_select_own on tradepilot.users;
create policy users_select_own
on tradepilot.users
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists users_insert_own on tradepilot.users;
create policy users_insert_own
on tradepilot.users
for insert
to authenticated
with check (auth_user_id = auth.uid());

drop policy if exists users_update_own on tradepilot.users;
create policy users_update_own
on tradepilot.users
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists users_delete_own on tradepilot.users;
create policy users_delete_own
on tradepilot.users
for delete
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists accounts_select_own on tradepilot.accounts;
create policy accounts_select_own
on tradepilot.accounts
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists accounts_insert_own on tradepilot.accounts;
create policy accounts_insert_own
on tradepilot.accounts
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists accounts_update_own on tradepilot.accounts;
create policy accounts_update_own
on tradepilot.accounts
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists accounts_delete_own on tradepilot.accounts;
create policy accounts_delete_own
on tradepilot.accounts
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists settings_select_own on tradepilot.settings;
create policy settings_select_own
on tradepilot.settings
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists settings_insert_own on tradepilot.settings;
create policy settings_insert_own
on tradepilot.settings
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists settings_update_own on tradepilot.settings;
create policy settings_update_own
on tradepilot.settings
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists settings_delete_own on tradepilot.settings;
create policy settings_delete_own
on tradepilot.settings
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists signals_select_own on tradepilot.signals;
create policy signals_select_own
on tradepilot.signals
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists signals_insert_own on tradepilot.signals;
create policy signals_insert_own
on tradepilot.signals
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists signals_update_own on tradepilot.signals;
create policy signals_update_own
on tradepilot.signals
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists signals_delete_own on tradepilot.signals;
create policy signals_delete_own
on tradepilot.signals
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists execution_logs_select_own on tradepilot.execution_logs;
create policy execution_logs_select_own
on tradepilot.execution_logs
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists execution_logs_insert_own on tradepilot.execution_logs;
create policy execution_logs_insert_own
on tradepilot.execution_logs
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists execution_logs_update_own on tradepilot.execution_logs;
create policy execution_logs_update_own
on tradepilot.execution_logs
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists execution_logs_delete_own on tradepilot.execution_logs;
create policy execution_logs_delete_own
on tradepilot.execution_logs
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_connections_select_own on tradepilot.telegram_connections;
create policy telegram_connections_select_own
on tradepilot.telegram_connections
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_connections_insert_own on tradepilot.telegram_connections;
create policy telegram_connections_insert_own
on tradepilot.telegram_connections
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_connections_update_own on tradepilot.telegram_connections;
create policy telegram_connections_update_own
on tradepilot.telegram_connections
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_connections_delete_own on tradepilot.telegram_connections;
create policy telegram_connections_delete_own
on tradepilot.telegram_connections
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_channels_select_own on tradepilot.telegram_channels;
create policy telegram_channels_select_own
on tradepilot.telegram_channels
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_channels_insert_own on tradepilot.telegram_channels;
create policy telegram_channels_insert_own
on tradepilot.telegram_channels
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_channels_update_own on tradepilot.telegram_channels;
create policy telegram_channels_update_own
on tradepilot.telegram_channels
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists telegram_channels_delete_own on tradepilot.telegram_channels;
create policy telegram_channels_delete_own
on tradepilot.telegram_channels
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

alter table tradepilot.settings
  add column if not exists excluded_symbols jsonb not null default '[]'::jsonb;

update tradepilot.settings
set excluded_symbols = '[]'::jsonb
where excluded_symbols is null;

alter table tradepilot.execution_logs
  add column if not exists details jsonb;

create table if not exists tradepilot.ea_account_status_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  balance numeric(18,2) not null,
  equity numeric(18,2) not null,
  margin numeric(18,2) not null,
  free_margin numeric(18,2) not null,
  drawdown_percent numeric(8,3) not null,
  open_positions integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists tradepilot.trade_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  signal_id uuid references tradepilot.signals(id) on delete set null,
  ticket text not null,
  symbol text not null,
  type text not null check (type in ('BUY', 'SELL')),
  volume numeric(12,4) not null,
  entry_price numeric(18,8) not null,
  exit_price numeric(18,8),
  stop_loss numeric(18,8),
  take_profit numeric(18,8),
  profit numeric(18,2) not null default 0,
  status text not null check (status in ('OPEN', 'CLOSED', 'REJECTED')),
  comment text,
  opened_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticket)
);

drop trigger if exists trg_trade_executions_updated_at on tradepilot.trade_executions;
create trigger trg_trade_executions_updated_at
before update on tradepilot.trade_executions
for each row execute function tradepilot.set_updated_at();

create index if not exists idx_ea_account_status_snapshots_user_created_at
  on tradepilot.ea_account_status_snapshots(user_id, created_at desc);
create index if not exists idx_trade_executions_user_created_at
  on tradepilot.trade_executions(user_id, created_at desc);
create index if not exists idx_trade_executions_signal_id
  on tradepilot.trade_executions(signal_id);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'execution_logs_status_check'
      and conrelid = 'tradepilot.execution_logs'::regclass
  ) then
    alter table tradepilot.execution_logs drop constraint execution_logs_status_check;
  end if;

  alter table tradepilot.execution_logs
    add constraint execution_logs_status_check check (
      status in (
        'RECEIVED',
        'RETRYING',
        'DISPATCHED',
        'PARSE_FAILED',
        'VALIDATION_FAILED',
        'EA_OFFLINE',
        'DISPATCH_TIMEOUT',
        'EXECUTION_REJECTED',
        'ACCOUNT_STATUS_RECEIVED',
        'TRADE_OPENED',
        'TRADE_CLOSED',
        'TRADE_REJECTED'
      )
    );
exception
  when duplicate_object then null;
end $$;

grant all on tradepilot.ea_account_status_snapshots to postgres, service_role;
grant all on tradepilot.trade_executions to postgres, service_role;
grant select on tradepilot.ea_account_status_snapshots to authenticated;
grant select on tradepilot.trade_executions to authenticated;

alter table tradepilot.ea_account_status_snapshots enable row level security;
alter table tradepilot.trade_executions enable row level security;

drop policy if exists service_role_ea_account_status_snapshots on tradepilot.ea_account_status_snapshots;
create policy service_role_ea_account_status_snapshots
on tradepilot.ea_account_status_snapshots
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_trade_executions on tradepilot.trade_executions;
create policy service_role_trade_executions
on tradepilot.trade_executions
for all
to service_role
using (true)
with check (true);

drop policy if exists ea_account_status_snapshots_select_own on tradepilot.ea_account_status_snapshots;
create policy ea_account_status_snapshots_select_own
on tradepilot.ea_account_status_snapshots
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists trade_executions_select_own on tradepilot.trade_executions;
create policy trade_executions_select_own
on tradepilot.trade_executions
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

alter table tradepilot.accounts
  alter column broker drop not null;

alter table tradepilot.accounts
  add column if not exists external_account_id text;

alter table tradepilot.accounts
  add column if not exists source text not null default 'MANUAL';

alter table tradepilot.accounts
  add column if not exists last_seen_at timestamptz;

alter table tradepilot.accounts
  add column if not exists latency_ms integer;

update tradepilot.accounts
set source = 'MANUAL'
where source is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'accounts_source_check'
      and conrelid = 'tradepilot.accounts'::regclass
  ) then
    alter table tradepilot.accounts drop constraint accounts_source_check;
  end if;

  alter table tradepilot.accounts
    add constraint accounts_source_check check (source in ('MANUAL', 'EA'));
exception
  when duplicate_object then null;
end $$;

drop index if exists tradepilot.idx_accounts_user_external_account_id;
create unique index if not exists idx_accounts_user_external_account_id
  on tradepilot.accounts(user_id, external_account_id);

alter table tradepilot.signals
  add column if not exists telegram_message_id text;

alter table tradepilot.signals
  add column if not exists telegram_channel_id text;

alter table tradepilot.signals
  add column if not exists message_timestamp timestamptz;

alter table tradepilot.signals
  add column if not exists ingestion_source text not null default 'MANUAL';

update tradepilot.signals
set ingestion_source = 'MANUAL'
where ingestion_source is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'signals_ingestion_source_check'
      and conrelid = 'tradepilot.signals'::regclass
  ) then
    alter table tradepilot.signals drop constraint signals_ingestion_source_check;
  end if;

  alter table tradepilot.signals
    add constraint signals_ingestion_source_check check (
      ingestion_source in ('MANUAL', 'TELEGRAM_REALTIME', 'TELEGRAM_BACKFILL')
    );
exception
  when duplicate_object then null;
end $$;

create unique index if not exists idx_signals_unique_telegram_message
  on tradepilot.signals(user_id, telegram_channel_id, telegram_message_id)
  where telegram_channel_id is not null and telegram_message_id is not null;

alter table tradepilot.execution_logs
  add column if not exists account_id text;

alter table tradepilot.execution_logs
  add column if not exists account_name text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'execution_logs_status_check'
      and conrelid = 'tradepilot.execution_logs'::regclass
  ) then
    alter table tradepilot.execution_logs drop constraint execution_logs_status_check;
  end if;

  alter table tradepilot.execution_logs
    add constraint execution_logs_status_check check (
      status in (
        'RECEIVED',
        'RETRYING',
        'DISPATCHED',
        'PARSE_FAILED',
        'PARSING_COMPLETED',
        'VALIDATION_FAILED',
        'VALIDATION_COMPLETED',
        'TELEGRAM_MESSAGE_RECEIVED',
        'SYMBOL_MAPPED',
        'SYMBOL_MAPPING_FAILED',
        'EA_OFFLINE',
        'DISPATCH_TIMEOUT',
        'EXECUTION_REJECTED',
        'ACCOUNT_STATUS_RECEIVED',
        'TRADE_OPENED',
        'TRADE_CLOSED',
        'TRADE_REJECTED',
        'COMMAND_SUCCEEDED',
        'COMMAND_FAILED'
      )
    );
exception
  when duplicate_object then null;
end $$;

alter table tradepilot.ea_account_status_snapshots
  add column if not exists account_id text;

alter table tradepilot.ea_account_status_snapshots
  add column if not exists account_name text;

update tradepilot.ea_account_status_snapshots
set account_id = 'legacy'
where account_id is null;

alter table tradepilot.ea_account_status_snapshots
  alter column account_id set not null;

alter table tradepilot.trade_executions
  add column if not exists account_id text;

alter table tradepilot.trade_executions
  add column if not exists account_name text;

update tradepilot.trade_executions
set account_id = 'legacy'
where account_id is null;

alter table tradepilot.trade_executions
  alter column account_id set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'trade_executions_user_id_ticket_key'
      and conrelid = 'tradepilot.trade_executions'::regclass
  ) then
    alter table tradepilot.trade_executions
      drop constraint trade_executions_user_id_ticket_key;
  end if;
end $$;

drop index if exists tradepilot.idx_trade_executions_user_created_at;

create index if not exists idx_trade_executions_user_created_at
  on tradepilot.trade_executions(user_id, created_at desc);

create unique index if not exists idx_trade_executions_user_account_ticket
  on tradepilot.trade_executions(user_id, account_id, ticket);

create table if not exists tradepilot.user_symbols (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  account_id text not null,
  symbol text not null,
  base_symbol text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id, symbol)
);

drop trigger if exists trg_user_symbols_updated_at on tradepilot.user_symbols;
create trigger trg_user_symbols_updated_at
before update on tradepilot.user_symbols
for each row execute function tradepilot.set_updated_at();

create index if not exists idx_user_symbols_user_account
  on tradepilot.user_symbols(user_id, account_id);

grant all on tradepilot.user_symbols to postgres, service_role;
grant select on tradepilot.user_symbols to authenticated;

alter table tradepilot.user_symbols enable row level security;

drop policy if exists service_role_user_symbols on tradepilot.user_symbols;
create policy service_role_user_symbols
on tradepilot.user_symbols
for all
to service_role
using (true)
with check (true);

drop policy if exists user_symbols_select_own on tradepilot.user_symbols;
create policy user_symbols_select_own
on tradepilot.user_symbols
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

alter table tradepilot.users
  add column if not exists full_name text;

alter table tradepilot.users
  add column if not exists phone_number text;

alter table tradepilot.users
  add column if not exists pending_email text;

alter table tradepilot.users
  add column if not exists pending_email_token text;

alter table tradepilot.users
  add column if not exists pending_email_requested_at timestamptz;

alter table tradepilot.settings
  add column if not exists auto_copy_enabled boolean not null default true;

alter table tradepilot.settings
  add column if not exists max_daily_loss_percent numeric(5,2) not null default 5;

alter table tradepilot.settings
  add column if not exists max_simultaneous_trades integer not null default 3;

alter table tradepilot.settings
  add column if not exists max_trades_per_day integer not null default 20;

alter table tradepilot.settings
  add column if not exists low_margin_threshold_percent numeric(5,2) not null default 50;

alter table tradepilot.settings
  add column if not exists execution_paused boolean not null default false;

alter table tradepilot.settings
  add column if not exists execution_pause_reason text;

alter table tradepilot.settings
  add column if not exists execution_paused_at timestamptz;

update tradepilot.settings
set max_simultaneous_trades = max_trades
where max_simultaneous_trades is null;

update tradepilot.settings
set max_trades_per_day = 20
where max_trades_per_day is null;

update tradepilot.settings
set max_daily_loss_percent = 5
where max_daily_loss_percent is null;

update tradepilot.settings
set low_margin_threshold_percent = 50
where low_margin_threshold_percent is null;

alter table tradepilot.settings
  add column if not exists notification_channels jsonb not null default '{"email": true, "telegram": true, "whatsapp": false}'::jsonb;

alter table tradepilot.settings
  add column if not exists notification_events jsonb not null default '{"newTradeOpened": true, "tpHit": true, "slHit": true, "lowMargin": true, "eaDisconnected": true, "telegramDisconnected": true, "executionFailed": true, "dailySummary": false}'::jsonb;

alter table tradepilot.signals
  add column if not exists classification text not null default 'SIGNAL';

alter table tradepilot.signals
  add column if not exists deleted_at timestamptz;

update tradepilot.signals
set classification = 'SIGNAL'
where classification is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'signals_classification_check'
      and conrelid = 'tradepilot.signals'::regclass
  ) then
    alter table tradepilot.signals drop constraint signals_classification_check;
  end if;

  alter table tradepilot.signals
    add constraint signals_classification_check check (
      classification in ('SIGNAL', 'MANAGEMENT', 'NOISE')
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_signals_user_classification_created_at
  on tradepilot.signals(user_id, classification, created_at desc)
  where deleted_at is null;

create index if not exists idx_signals_user_deleted_at
  on tradepilot.signals(user_id, deleted_at);

alter table tradepilot.trade_executions
  add column if not exists opening_order_type text;

alter table tradepilot.trade_executions
  add column if not exists position_direction text;

alter table tradepilot.trade_executions
  add column if not exists close_reason text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'trade_executions_opening_order_type_check'
      and conrelid = 'tradepilot.trade_executions'::regclass
  ) then
    alter table tradepilot.trade_executions
      drop constraint trade_executions_opening_order_type_check;
  end if;

  alter table tradepilot.trade_executions
    add constraint trade_executions_opening_order_type_check check (
      opening_order_type in ('BUY', 'SELL')
      or opening_order_type is null
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'trade_executions_position_direction_check'
      and conrelid = 'tradepilot.trade_executions'::regclass
  ) then
    alter table tradepilot.trade_executions
      drop constraint trade_executions_position_direction_check;
  end if;

  alter table tradepilot.trade_executions
    add constraint trade_executions_position_direction_check check (
      position_direction in ('LONG', 'SHORT')
      or position_direction is null
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'trade_executions_close_reason_check'
      and conrelid = 'tradepilot.trade_executions'::regclass
  ) then
    alter table tradepilot.trade_executions
      drop constraint trade_executions_close_reason_check;
  end if;

  alter table tradepilot.trade_executions
    add constraint trade_executions_close_reason_check check (
      close_reason in ('TP', 'SL', 'MANUAL', 'PARTIAL', 'BREAKEVEN', 'UNKNOWN')
      or close_reason is null
    );
exception
  when duplicate_object then null;
end $$;

create table if not exists tradepilot.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references tradepilot.users(id) on delete cascade,
  email_enabled boolean not null default true,
  telegram_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  notify_new_trade_opened boolean not null default true,
  notify_tp_hit boolean not null default true,
  notify_sl_hit boolean not null default true,
  notify_low_margin boolean not null default true,
  notify_ea_disconnected boolean not null default true,
  notify_telegram_disconnected boolean not null default true,
  notify_execution_failed boolean not null default true,
  notify_daily_summary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_notification_preferences_updated_at on tradepilot.notification_preferences;
create trigger trg_notification_preferences_updated_at
before update on tradepilot.notification_preferences
for each row execute function tradepilot.set_updated_at();

grant all on tradepilot.notification_preferences to postgres, service_role;
grant select, insert, update, delete on tradepilot.notification_preferences to authenticated;

alter table tradepilot.notification_preferences enable row level security;

drop policy if exists service_role_notification_preferences on tradepilot.notification_preferences;
create policy service_role_notification_preferences
on tradepilot.notification_preferences
for all
to service_role
using (true)
with check (true);

drop policy if exists notification_preferences_select_own on tradepilot.notification_preferences;
create policy notification_preferences_select_own
on tradepilot.notification_preferences
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists notification_preferences_insert_own on tradepilot.notification_preferences;
create policy notification_preferences_insert_own
on tradepilot.notification_preferences
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists notification_preferences_update_own on tradepilot.notification_preferences;
create policy notification_preferences_update_own
on tradepilot.notification_preferences
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists notification_preferences_delete_own on tradepilot.notification_preferences;
create policy notification_preferences_delete_own
on tradepilot.notification_preferences
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

insert into tradepilot.notification_preferences (
  user_id
)
select id
from tradepilot.users
on conflict (user_id) do nothing;

create table if not exists tradepilot.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  auth_session_id uuid not null,
  user_agent text,
  ip_address text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, auth_session_id)
);

drop trigger if exists trg_user_sessions_updated_at on tradepilot.user_sessions;
create trigger trg_user_sessions_updated_at
before update on tradepilot.user_sessions
for each row execute function tradepilot.set_updated_at();

create index if not exists idx_user_sessions_user_last_seen
  on tradepilot.user_sessions(user_id, last_seen_at desc);

grant all on tradepilot.user_sessions to postgres, service_role;
grant select, insert, update, delete on tradepilot.user_sessions to authenticated;

alter table tradepilot.user_sessions enable row level security;

drop policy if exists service_role_user_sessions on tradepilot.user_sessions;
create policy service_role_user_sessions
on tradepilot.user_sessions
for all
to service_role
using (true)
with check (true);

drop policy if exists user_sessions_select_own on tradepilot.user_sessions;
create policy user_sessions_select_own
on tradepilot.user_sessions
for select
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists user_sessions_insert_own on tradepilot.user_sessions;
create policy user_sessions_insert_own
on tradepilot.user_sessions
for insert
to authenticated
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists user_sessions_update_own on tradepilot.user_sessions;
create policy user_sessions_update_own
on tradepilot.user_sessions
for update
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
)
with check (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

drop policy if exists user_sessions_delete_own on tradepilot.user_sessions;
create policy user_sessions_delete_own
on tradepilot.user_sessions
for delete
to authenticated
using (
  user_id in (
    select id
    from tradepilot.users
    where auth_user_id = auth.uid()
  )
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'signals_status_check'
      and conrelid = 'tradepilot.signals'::regclass
  ) then
    alter table tradepilot.signals drop constraint signals_status_check;
  end if;

  alter table tradepilot.signals
    add constraint signals_status_check check (
      status in (
        'PENDING',
        'PARSED',
        'VALIDATED',
        'DISPATCHED',
        'EXECUTED',
        'PARSE_FAILED',
        'VALIDATION_FAILED',
        'EA_OFFLINE',
        'DISPATCH_TIMEOUT',
        'EXECUTION_REJECTED',
        'IGNORED',
        'BLOCKED',
        'AUTO_COPY_DISABLED',
        'SYMBOL_UNRESOLVED'
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'execution_logs_status_check'
      and conrelid = 'tradepilot.execution_logs'::regclass
  ) then
    alter table tradepilot.execution_logs drop constraint execution_logs_status_check;
  end if;

  alter table tradepilot.execution_logs
    add constraint execution_logs_status_check check (
      status in (
        'RECEIVED',
        'RETRYING',
        'DISPATCHED',
        'PARSE_FAILED',
        'PARSING_COMPLETED',
        'VALIDATION_FAILED',
        'VALIDATION_COMPLETED',
        'TELEGRAM_MESSAGE_RECEIVED',
        'SYMBOL_MAPPED',
        'SYMBOL_MAPPING_FAILED',
        'EA_OFFLINE',
        'DISPATCH_TIMEOUT',
        'EXECUTION_REJECTED',
        'AUTO_COPY_DISABLED',
        'IGNORED',
        'BLOCKED',
        'RISK_LIMIT_HIT',
        'FAILSAFE_TRIGGERED',
        'ACCOUNT_STATUS_RECEIVED',
        'TRADE_OPENED',
        'TRADE_CLOSED',
        'TRADE_REJECTED',
        'COMMAND_SUCCEEDED',
        'COMMAND_FAILED'
      )
    );
exception
  when duplicate_object then null;
end $$;
-- Trade history imports (2026-06-09)
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

