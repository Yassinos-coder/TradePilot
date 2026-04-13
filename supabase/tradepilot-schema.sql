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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tradepilot.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  raw_message text not null,
  source_channel text,
  parsed_data jsonb,
  status text not null check (status in ('PENDING', 'VALIDATED', 'DISPATCHED', 'FAILED')),
  created_at timestamptz not null default now()
);

create table if not exists tradepilot.execution_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  signal_id uuid references tradepilot.signals(id) on delete set null,
  status text not null check (status in ('RECEIVED', 'DISPATCHED', 'RETRIED', 'FAILED')),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists tradepilot.telegram_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references tradepilot.users(id) on delete cascade,
  external_id text not null,
  name text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists idx_accounts_user_id on tradepilot.accounts(user_id);
create index if not exists idx_signals_user_created_at on tradepilot.signals(user_id, created_at desc);
create index if not exists idx_execution_logs_user_created_at on tradepilot.execution_logs(user_id, created_at desc);
create index if not exists idx_telegram_channels_user_id on tradepilot.telegram_channels(user_id);

create or replace function tradepilot.handle_new_tradepilot_user()
returns trigger as $$
begin
  insert into tradepilot.settings (
    user_id,
    risk_percent,
    max_trades,
    allowed_symbols,
    sessions
  )
  values (
    new.id,
    1,
    3,
    '["XAUUSD","EURUSD","GBPUSD","BTCUSD"]'::jsonb,
    '{"london": true, "newYork": true}'::jsonb
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
