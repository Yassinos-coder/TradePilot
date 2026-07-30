-- TradePilot — full database setup (v2: multi-account trade copier)
--
-- Re-run safe: every statement uses IF NOT EXISTS / CREATE OR REPLACE /
-- DROP IF EXISTS / DO $$ … $$. Safe to run on a fresh database or on an
-- existing v1 (Telegram signal router) database.
--
-- DESTRUCTIVE for the Telegram/signal era: telegram_connections,
-- telegram_channels, signals, copier_programs, copier_invite_codes and
-- follower_devices are dropped. Analytics data (trade_executions,
-- ea_account_status_snapshots, trade_history_files, user_symbols) is preserved.
--
-- Remember to add `tradepilot` to Supabase → Settings → API → Exposed schemas.

create schema if not exists tradepilot;

create extension if not exists pgcrypto;

grant usage on schema tradepilot to postgres, anon, authenticated, service_role;

-- ─── functions ───────────────────────────────────────────────────────────────

create or replace function tradepilot.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Explicit search_path so digest() resolves whether pgcrypto is installed into
-- `extensions` (Supabase default) or `public`.
create or replace function tradepilot.hash_secret(secret text)
returns text as $$
  select encode(digest(secret, 'sha256'), 'hex');
$$ language sql immutable
set search_path = tradepilot, extensions, public;

-- ─── users ───────────────────────────────────────────────────────────────────

create table if not exists tradepilot.users (
  id                          uuid        primary key default gen_random_uuid(),
  auth_user_id                uuid        unique references auth.users(id) on delete cascade,
  email                       text        not null unique,
  password                    text,
  full_name                   text,
  nickname                    text,
  phone_number                text,
  country                     text,
  city                        text,
  street                      text,
  postal_code                 text,
  pending_email               text,
  pending_email_token         text,
  pending_email_requested_at  timestamptz,
  created_at                  timestamptz not null default now()
);

alter table tradepilot.users add column if not exists nickname    text;
alter table tradepilot.users add column if not exists country     text;
alter table tradepilot.users add column if not exists city        text;
alter table tradepilot.users add column if not exists street      text;
alter table tradepilot.users add column if not exists postal_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tradepilot_users_auth_user_id_fkey'
  ) then
    alter table tradepilot.users
      add constraint tradepilot_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists idx_tradepilot_users_auth_user_id
  on tradepilot.users(auth_user_id)
  where auth_user_id is not null;

-- ─── api keys ────────────────────────────────────────────────────────────────
-- Two kinds: EA keys authenticate an Expert Advisor over /ws/ea, REST keys
-- authenticate the HTTP trade API. Only the SHA-256 hash is stored; `prefix`
-- exists purely so the UI can identify a key it can never show again.

create table if not exists tradepilot.api_keys (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references tradepilot.users(id) on delete cascade,
  kind            text        not null,
  name            text        not null,
  prefix          text        not null,
  key_hash        text        not null unique,
  scopes          jsonb       not null default '[]'::jsonb,
  hmac_secret     text,
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  rotated_from_id uuid        references tradepilot.api_keys(id) on delete set null,
  created_at      timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'api_keys_kind_check' and conrelid = 'tradepilot.api_keys'::regclass
  ) then
    alter table tradepilot.api_keys drop constraint api_keys_kind_check;
  end if;
  alter table tradepilot.api_keys
    add constraint api_keys_kind_check check (kind in ('EA', 'REST'));
end $$;

create index if not exists idx_api_keys_lookup
  on tradepilot.api_keys(key_hash)
  where revoked_at is null;
create index if not exists idx_api_keys_user_kind
  on tradepilot.api_keys(user_id, kind, created_at desc);

-- Carry existing EAs over: hash the legacy plaintext users.api_key into an EA
-- key so terminals in the field keep authenticating after the migration.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'tradepilot'
      and table_name = 'users'
      and column_name = 'api_key'
  ) then
    insert into tradepilot.api_keys (user_id, kind, name, prefix, key_hash)
    select u.id,
           'EA',
           'Migrated EA key',
           left(u.api_key, 11),
           tradepilot.hash_secret(u.api_key)
    from tradepilot.users u
    where u.api_key is not null
    on conflict (key_hash) do nothing;

    alter table tradepilot.users drop column api_key;
  end if;
end $$;

drop function if exists tradepilot.generate_api_key();

-- ─── accounts ────────────────────────────────────────────────────────────────

create table if not exists tradepilot.accounts (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references tradepilot.users(id) on delete cascade,
  name                text        not null,
  broker              text,
  external_account_id text,
  source              text        not null default 'MANUAL',
  role                text        not null default 'UNASSIGNED',
  platform            text,
  account_login       text,
  currency            text,
  leverage            integer,
  last_seen_at        timestamptz,
  latency_ms          integer,
  created_at          timestamptz not null default now()
);

alter table tradepilot.accounts add column if not exists role          text not null default 'UNASSIGNED';
alter table tradepilot.accounts add column if not exists platform      text;
alter table tradepilot.accounts add column if not exists account_login text;
alter table tradepilot.accounts add column if not exists currency      text;
alter table tradepilot.accounts add column if not exists leverage      integer;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'accounts_source_check' and conrelid = 'tradepilot.accounts'::regclass
  ) then
    alter table tradepilot.accounts drop constraint accounts_source_check;
  end if;
  alter table tradepilot.accounts
    add constraint accounts_source_check check (source in ('MANUAL', 'EA'));

  if exists (
    select 1 from pg_constraint
    where conname = 'accounts_role_check' and conrelid = 'tradepilot.accounts'::regclass
  ) then
    alter table tradepilot.accounts drop constraint accounts_role_check;
  end if;
  alter table tradepilot.accounts
    add constraint accounts_role_check check (role in ('MASTER', 'SLAVE', 'UNASSIGNED'));

  if exists (
    select 1 from pg_constraint
    where conname = 'accounts_platform_check' and conrelid = 'tradepilot.accounts'::regclass
  ) then
    alter table tradepilot.accounts drop constraint accounts_platform_check;
  end if;
  alter table tradepilot.accounts
    add constraint accounts_platform_check check (platform is null or platform in ('MT4', 'MT5'));
end $$;

create unique index if not exists idx_accounts_user_external
  on tradepilot.accounts(user_id, external_account_id)
  where external_account_id is not null;

-- At most one master per user; the promotion path relies on this.
create unique index if not exists idx_accounts_one_master_per_user
  on tradepilot.accounts(user_id)
  where role = 'MASTER';

-- ─── settings ────────────────────────────────────────────────────────────────

create table if not exists tradepilot.settings (
  id                            uuid        primary key default gen_random_uuid(),
  user_id                       uuid        not null unique references tradepilot.users(id) on delete cascade,
  auto_copy_enabled             boolean     not null default true,
  execution_paused              boolean     not null default false,
  execution_pause_reason        text,
  execution_paused_at           timestamptz,
  allow_api_trade_opening       boolean     not null default false,
  excluded_symbols              jsonb       not null default '[]'::jsonb,
  sessions                      jsonb       not null default '{}'::jsonb,
  copier_defaults               jsonb       not null default '{}'::jsonb,
  notification_channels         jsonb       not null default '{"email":true,"whatsapp":false}'::jsonb,
  notification_events           jsonb       not null default '{"newTradeOpened":true,"tpHit":true,"slHit":true,"lowMargin":true,"eaDisconnected":true,"masterOffline":true,"copyFailed":true,"executionFailed":true,"dailySummary":false}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

alter table tradepilot.settings add column if not exists allow_api_trade_opening boolean not null default false;
alter table tradepilot.settings add column if not exists copier_defaults         jsonb   not null default '{}'::jsonb;
alter table tradepilot.settings add column if not exists auto_copy_enabled       boolean not null default true;
alter table tradepilot.settings add column if not exists execution_paused        boolean not null default false;
alter table tradepilot.settings add column if not exists execution_pause_reason  text;
alter table tradepilot.settings add column if not exists execution_paused_at     timestamptz;

-- Signal-era columns: per-trade risk now lives on each copier_link.
alter table tradepilot.settings drop column if exists mode;
alter table tradepilot.settings drop column if exists allowed_symbols;
alter table tradepilot.settings drop column if exists risk_percent;
alter table tradepilot.settings drop column if exists max_trades;
alter table tradepilot.settings drop column if exists max_simultaneous_trades;
alter table tradepilot.settings drop column if exists max_daily_loss_percent;
alter table tradepilot.settings drop column if exists max_trades_per_day;
alter table tradepilot.settings drop column if exists low_margin_threshold_percent;

update tradepilot.settings
set notification_channels = (notification_channels - 'telegram'),
    notification_events   = (notification_events - 'telegramDisconnected')
                            || '{"masterOffline":true,"copyFailed":true}'::jsonb
where notification_channels ? 'telegram'
   or notification_events ? 'telegramDisconnected';

-- ─── copier links ────────────────────────────────────────────────────────────
-- One row per master → slave route. This is the risk-aware parameter set the
-- user configures; nothing here is global.

create table if not exists tradepilot.copier_links (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references tradepilot.users(id) on delete cascade,
  master_account_id      uuid        not null references tradepilot.accounts(id) on delete cascade,
  slave_account_id       uuid        not null references tradepilot.accounts(id) on delete cascade,
  enabled                boolean     not null default true,

  sizing_mode            text        not null default 'MULTIPLIER',
  fixed_lot              numeric(12,4),
  lot_multiplier         numeric(8,4)  not null default 1,
  risk_percent           numeric(5,2),
  min_lot                numeric(12,4) not null default 0.01,
  max_lot                numeric(12,4) not null default 5,

  max_open_positions     integer       not null default 10,
  max_daily_loss_percent numeric(5,2)  not null default 5,
  max_drawdown_percent   numeric(5,2)  not null default 20,
  equity_floor           numeric(18,2),
  max_spread_points      integer,
  max_slippage_points    integer       not null default 20,
  max_copy_delay_ms      integer       not null default 5000,

  copy_stop_loss         boolean     not null default true,
  copy_take_profit       boolean     not null default true,
  copy_modifications     boolean     not null default true,
  copy_partial_closes    boolean     not null default true,
  copy_closes            boolean     not null default true,
  reverse_copy           boolean     not null default false,

  symbol_filter_mode     text        not null default 'ALL',
  symbol_filter          jsonb       not null default '[]'::jsonb,
  symbol_prefix          text,
  symbol_suffix          text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint copier_links_distinct_accounts check (master_account_id <> slave_account_id),
  constraint copier_links_lot_bounds        check (max_lot >= min_lot),
  constraint copier_links_unique_route      unique (master_account_id, slave_account_id)
);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'copier_links_sizing_mode_check'
      and conrelid = 'tradepilot.copier_links'::regclass
  ) then
    alter table tradepilot.copier_links drop constraint copier_links_sizing_mode_check;
  end if;
  alter table tradepilot.copier_links
    add constraint copier_links_sizing_mode_check
    check (sizing_mode in ('FIXED_LOT', 'MULTIPLIER', 'RISK_PERCENT', 'BALANCE_RATIO'));

  if exists (
    select 1 from pg_constraint
    where conname = 'copier_links_symbol_filter_mode_check'
      and conrelid = 'tradepilot.copier_links'::regclass
  ) then
    alter table tradepilot.copier_links drop constraint copier_links_symbol_filter_mode_check;
  end if;
  alter table tradepilot.copier_links
    add constraint copier_links_symbol_filter_mode_check
    check (symbol_filter_mode in ('ALL', 'ALLOWLIST', 'BLOCKLIST'));
end $$;

create index if not exists idx_copier_links_user
  on tradepilot.copier_links(user_id);
create index if not exists idx_copier_links_master_enabled
  on tradepilot.copier_links(master_account_id, enabled);
create index if not exists idx_copier_links_slave
  on tradepilot.copier_links(slave_account_id);

-- ─── copy events ─────────────────────────────────────────────────────────────
-- One row per master action worth mirroring.

create table if not exists tradepilot.copy_events (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references tradepilot.users(id) on delete cascade,
  master_account_id uuid        not null references tradepilot.accounts(id) on delete cascade,
  master_ticket     text        not null,
  action            text        not null,
  symbol            text        not null,
  base_symbol       text        not null,
  side              text,
  volume            numeric(12,4),
  entry_price       numeric(18,8),
  stop_loss         numeric(18,8),
  take_profit       numeric(18,8),
  close_percent     numeric(5,2),
  master_event_at   timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'copy_events_action_check' and conrelid = 'tradepilot.copy_events'::regclass
  ) then
    alter table tradepilot.copy_events drop constraint copy_events_action_check;
  end if;
  alter table tradepilot.copy_events
    add constraint copy_events_action_check
    check (action in ('OPEN', 'CLOSE', 'PARTIAL_CLOSE', 'MODIFY'));

  if exists (
    select 1 from pg_constraint
    where conname = 'copy_events_side_check' and conrelid = 'tradepilot.copy_events'::regclass
  ) then
    alter table tradepilot.copy_events drop constraint copy_events_side_check;
  end if;
  alter table tradepilot.copy_events
    add constraint copy_events_side_check check (side is null or side in ('BUY', 'SELL'));
end $$;

-- The master EA can resend the same transaction; dedupe on the action tuple.
-- COALESCE needs the extra parens to be accepted as an index expression.
create unique index if not exists idx_copy_events_unique_master_action
  on tradepilot.copy_events(master_account_id, master_ticket, action, (coalesce(close_percent, -1)));
create index if not exists idx_copy_events_user_created
  on tradepilot.copy_events(user_id, created_at desc);

-- ─── copy orders ─────────────────────────────────────────────────────────────
-- Fan-out result per link, and the master ↔ slave ticket map that lets a later
-- close or modify on the master find the right slave position.

create table if not exists tradepilot.copy_orders (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references tradepilot.users(id) on delete cascade,
  copy_event_id     uuid        not null references tradepilot.copy_events(id) on delete cascade,
  copier_link_id    uuid        not null references tradepilot.copier_links(id) on delete cascade,
  slave_account_id  uuid        not null references tradepilot.accounts(id) on delete cascade,
  master_ticket     text        not null,
  slave_ticket      text,
  requested_symbol  text        not null,
  resolved_symbol   text,
  side              text,
  requested_volume  numeric(12,4),
  filled_volume     numeric(12,4),
  status            text        not null default 'PENDING',
  skip_reason       text,
  execution_key     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint copy_orders_unique_per_link unique (copy_event_id, copier_link_id)
);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'copy_orders_status_check' and conrelid = 'tradepilot.copy_orders'::regclass
  ) then
    alter table tradepilot.copy_orders drop constraint copy_orders_status_check;
  end if;
  alter table tradepilot.copy_orders
    add constraint copy_orders_status_check
    check (status in ('PENDING', 'SENT', 'FILLED', 'SKIPPED', 'REJECTED', 'FAILED'));
end $$;

create index if not exists idx_copy_orders_user_created
  on tradepilot.copy_orders(user_id, created_at desc);
create index if not exists idx_copy_orders_event
  on tradepilot.copy_orders(copy_event_id);
create unique index if not exists idx_copy_orders_execution_key
  on tradepilot.copy_orders(execution_key)
  where execution_key is not null;
-- Ticket map lookup: "which slave position mirrors this master ticket?"
create index if not exists idx_copy_orders_ticket_map
  on tradepilot.copy_orders(copier_link_id, master_ticket)
  where slave_ticket is not null;

-- ─── execution logs ──────────────────────────────────────────────────────────

create table if not exists tradepilot.execution_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references tradepilot.users(id) on delete cascade,
  copy_event_id uuid        references tradepilot.copy_events(id) on delete set null,
  execution_key text,
  attempt       integer     not null default 0,
  account_id    text,
  account_name  text,
  status        text        not null,
  message       text        not null,
  details       jsonb,
  created_at    timestamptz not null default now()
);

alter table tradepilot.execution_logs
  add column if not exists copy_event_id uuid references tradepilot.copy_events(id) on delete set null;
alter table tradepilot.execution_logs drop column if exists signal_id;

create index if not exists idx_execution_logs_user_created
  on tradepilot.execution_logs(user_id, created_at desc);
create index if not exists idx_execution_logs_copy_event
  on tradepilot.execution_logs(copy_event_id);

-- ─── ea account status snapshots ─────────────────────────────────────────────

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

create index if not exists idx_ea_status_user_account_created
  on tradepilot.ea_account_status_snapshots(user_id, account_id, created_at desc);

-- ─── trade executions (analytics source of truth — preserved) ────────────────

create table if not exists tradepilot.trade_executions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references tradepilot.users(id) on delete cascade,
  copy_event_id      uuid        references tradepilot.copy_events(id) on delete set null,
  account_id         text        not null,
  account_name       text,
  ticket             text        not null,
  symbol             text        not null,
  type               text        not null,
  opening_order_type text,
  position_direction text,
  volume             numeric(12,4) not null,
  entry_price        numeric(18,8) not null,
  exit_price         numeric(18,8),
  stop_loss          numeric(18,8),
  take_profit        numeric(18,8),
  profit             numeric(18,2) not null default 0,
  status             text        not null,
  close_reason       text,
  entry_type         text        not null default 'MARKET',
  comment            text,
  opened_at          timestamptz not null,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table tradepilot.trade_executions
  add column if not exists copy_event_id uuid references tradepilot.copy_events(id) on delete set null;
alter table tradepilot.trade_executions
  add column if not exists entry_type text not null default 'MARKET';
alter table tradepilot.trade_executions drop column if exists signal_id;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'trade_executions_entry_type_check'
      and conrelid = 'tradepilot.trade_executions'::regclass
  ) then
    alter table tradepilot.trade_executions drop constraint trade_executions_entry_type_check;
  end if;
  alter table tradepilot.trade_executions
    add constraint trade_executions_entry_type_check
    check (entry_type in ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'));
end $$;

create unique index if not exists idx_trade_executions_user_account_ticket
  on tradepilot.trade_executions(user_id, account_id, ticket);
create index if not exists idx_trade_executions_user_status_closed
  on tradepilot.trade_executions(user_id, status, closed_at desc);

-- ─── user symbols (broker symbol map) ────────────────────────────────────────

create table if not exists tradepilot.user_symbols (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references tradepilot.users(id) on delete cascade,
  account_id  text        not null,
  symbol      text        not null,
  base_symbol text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, account_id, symbol)
);

create index if not exists idx_user_symbols_user_account
  on tradepilot.user_symbols(user_id, account_id);

-- ─── notification preferences ────────────────────────────────────────────────

create table if not exists tradepilot.notification_preferences (
  id                          uuid        primary key default gen_random_uuid(),
  user_id                     uuid        not null unique references tradepilot.users(id) on delete cascade,
  email_enabled               boolean     not null default true,
  whatsapp_enabled            boolean     not null default false,
  notify_new_trade_opened     boolean     not null default true,
  notify_tp_hit               boolean     not null default true,
  notify_sl_hit               boolean     not null default true,
  notify_low_margin           boolean     not null default true,
  notify_ea_disconnected      boolean     not null default true,
  notify_master_offline       boolean     not null default true,
  notify_copy_failed          boolean     not null default true,
  notify_execution_failed     boolean     not null default true,
  notify_daily_summary        boolean     not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table tradepilot.notification_preferences
  add column if not exists notify_master_offline boolean not null default true;
alter table tradepilot.notification_preferences
  add column if not exists notify_copy_failed    boolean not null default true;
alter table tradepilot.notification_preferences drop column if exists telegram_enabled;
alter table tradepilot.notification_preferences drop column if exists notify_telegram_disconnected;

-- ─── user sessions ───────────────────────────────────────────────────────────

create table if not exists tradepilot.user_sessions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references tradepilot.users(id) on delete cascade,
  auth_session_id uuid        not null,
  user_agent      text,
  ip_address      text,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, auth_session_id)
);

-- ─── trade history files ─────────────────────────────────────────────────────

create table if not exists tradepilot.trade_history_files (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references tradepilot.users(id) on delete cascade,
  display_name       text        not null,
  original_filename  text        not null,
  storage_bucket     text        not null,
  storage_path       text        not null,
  content_type       text,
  file_size          bigint      not null default 0,
  platform           text        not null default 'GENERIC',
  account_id         text        not null default 'default',
  parsed_trade_count integer     not null default 0 check (parsed_trade_count >= 0),
  skipped_row_count  integer     not null default 0 check (skipped_row_count >= 0),
  status             text        not null default 'UPLOADED',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table tradepilot.trade_history_files
  add column if not exists account_id text not null default 'default';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'trade_history_files_platform_check'
      and conrelid = 'tradepilot.trade_history_files'::regclass
  ) then
    alter table tradepilot.trade_history_files drop constraint trade_history_files_platform_check;
  end if;
  alter table tradepilot.trade_history_files
    add constraint trade_history_files_platform_check
    check (platform in ('MT4', 'MT5', 'GENERIC'));

  if exists (
    select 1 from pg_constraint
    where conname = 'trade_history_files_status_check'
      and conrelid = 'tradepilot.trade_history_files'::regclass
  ) then
    alter table tradepilot.trade_history_files drop constraint trade_history_files_status_check;
  end if;
  alter table tradepilot.trade_history_files
    add constraint trade_history_files_status_check
    check (status in ('UPLOADED', 'PARSED', 'FAILED'));
end $$;

-- ─── drop the Telegram / signal / cross-user-copier era ──────────────────────

drop table if exists tradepilot.telegram_channels    cascade;
drop table if exists tradepilot.telegram_connections cascade;
drop table if exists tradepilot.signals              cascade;
drop table if exists tradepilot.follower_devices     cascade;
drop table if exists tradepilot.copier_invite_codes  cascade;
drop table if exists tradepilot.copier_programs      cascade;

-- ─── triggers ────────────────────────────────────────────────────────────────

drop trigger if exists trg_settings_updated_at on tradepilot.settings;
create trigger trg_settings_updated_at
  before update on tradepilot.settings
  for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_copier_links_updated_at on tradepilot.copier_links;
create trigger trg_copier_links_updated_at
  before update on tradepilot.copier_links
  for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_copy_orders_updated_at on tradepilot.copy_orders;
create trigger trg_copy_orders_updated_at
  before update on tradepilot.copy_orders
  for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_trade_executions_updated_at on tradepilot.trade_executions;
create trigger trg_trade_executions_updated_at
  before update on tradepilot.trade_executions
  for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_user_symbols_updated_at on tradepilot.user_symbols;
create trigger trg_user_symbols_updated_at
  before update on tradepilot.user_symbols
  for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_notification_preferences_updated_at on tradepilot.notification_preferences;
create trigger trg_notification_preferences_updated_at
  before update on tradepilot.notification_preferences
  for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_user_sessions_updated_at on tradepilot.user_sessions;
create trigger trg_user_sessions_updated_at
  before update on tradepilot.user_sessions
  for each row execute function tradepilot.set_updated_at();

drop trigger if exists trg_trade_history_files_updated_at on tradepilot.trade_history_files;
create trigger trg_trade_history_files_updated_at
  before update on tradepilot.trade_history_files
  for each row execute function tradepilot.set_updated_at();

-- ─── user lifecycle ──────────────────────────────────────────────────────────

create or replace function tradepilot.handle_new_tradepilot_user()
returns trigger as $$
begin
  insert into tradepilot.settings (user_id, sessions)
  values (new.id, '{"london": true, "newYork": true}'::jsonb)
  on conflict (user_id) do nothing;

  insert into tradepilot.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- No API key is seeded here on purpose: a key generated in SQL could never be
  -- shown to the user. Keys are minted by the API, which returns the plaintext
  -- exactly once.

  return new;
end;
$$ language plpgsql
set search_path = tradepilot, extensions, public;

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
  set auth_user_id = new.id, email = new.email
  where email = new.email and auth_user_id is null;

  if found then
    return new;
  end if;

  insert into tradepilot.users (auth_user_id, email)
  values (new.id, new.email)
  on conflict do nothing;

  return new;
end;
$$ language plpgsql security definer
set search_path = tradepilot, extensions, public;

drop trigger if exists trg_tradepilot_users_default_settings on tradepilot.users;
create trigger trg_tradepilot_users_default_settings
  after insert on tradepilot.users
  for each row execute function tradepilot.handle_new_tradepilot_user();

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created_tradepilot'
  ) then
    create trigger on_auth_user_created_tradepilot
      after insert on auth.users
      for each row execute function tradepilot.handle_new_auth_user();
  end if;
end $$;

-- ─── grants ──────────────────────────────────────────────────────────────────

grant all on all tables in schema tradepilot to postgres, service_role;
grant select, insert, update, delete on all tables in schema tradepilot to authenticated;
grant usage, select on all sequences in schema tradepilot to postgres, service_role, authenticated, anon;

alter default privileges in schema tradepilot
  grant all on tables to postgres, service_role;

alter default privileges in schema tradepilot
  grant select, insert, update, delete on tables to authenticated;

-- ─── row level security ──────────────────────────────────────────────────────

alter table tradepilot.users                       enable row level security;
alter table tradepilot.api_keys                    enable row level security;
alter table tradepilot.accounts                    enable row level security;
alter table tradepilot.settings                    enable row level security;
alter table tradepilot.copier_links                enable row level security;
alter table tradepilot.copy_events                 enable row level security;
alter table tradepilot.copy_orders                 enable row level security;
alter table tradepilot.execution_logs              enable row level security;
alter table tradepilot.ea_account_status_snapshots enable row level security;
alter table tradepilot.trade_executions            enable row level security;
alter table tradepilot.user_symbols                enable row level security;
alter table tradepilot.notification_preferences    enable row level security;
alter table tradepilot.user_sessions               enable row level security;
alter table tradepilot.trade_history_files         enable row level security;

-- service_role bypass (the API uses the service-role key)

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users', 'api_keys', 'accounts', 'settings', 'copier_links', 'copy_events',
    'copy_orders', 'execution_logs', 'ea_account_status_snapshots',
    'trade_executions', 'user_symbols', 'notification_preferences',
    'user_sessions', 'trade_history_files'
  ]
  loop
    execute format('drop policy if exists service_role_%1$s on tradepilot.%1$s', table_name);
    execute format(
      'create policy service_role_%1$s on tradepilot.%1$s for all to service_role using (true) with check (true)',
      table_name
    );
  end loop;
end $$;

-- authenticated user policies (own data only)

drop policy if exists users_select_own on tradepilot.users;
create policy users_select_own on tradepilot.users for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists users_insert_own on tradepilot.users;
create policy users_insert_own on tradepilot.users for insert to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists users_update_own on tradepilot.users;
create policy users_update_own on tradepilot.users for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

drop policy if exists users_delete_own on tradepilot.users;
create policy users_delete_own on tradepilot.users for delete to authenticated
  using (auth_user_id = auth.uid());

-- Every other table is scoped through users.auth_user_id on its user_id column.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'api_keys', 'accounts', 'settings', 'copier_links', 'copy_events',
    'copy_orders', 'execution_logs', 'ea_account_status_snapshots',
    'trade_executions', 'user_symbols', 'notification_preferences',
    'user_sessions', 'trade_history_files'
  ]
  loop
    execute format('drop policy if exists %1$s_select_own on tradepilot.%1$s', table_name);
    execute format(
      'create policy %1$s_select_own on tradepilot.%1$s for select to authenticated
         using (user_id in (select id from tradepilot.users where auth_user_id = auth.uid()))',
      table_name
    );

    execute format('drop policy if exists %1$s_insert_own on tradepilot.%1$s', table_name);
    execute format(
      'create policy %1$s_insert_own on tradepilot.%1$s for insert to authenticated
         with check (user_id in (select id from tradepilot.users where auth_user_id = auth.uid()))',
      table_name
    );

    execute format('drop policy if exists %1$s_update_own on tradepilot.%1$s', table_name);
    execute format(
      'create policy %1$s_update_own on tradepilot.%1$s for update to authenticated
         using (user_id in (select id from tradepilot.users where auth_user_id = auth.uid()))
         with check (user_id in (select id from tradepilot.users where auth_user_id = auth.uid()))',
      table_name
    );

    execute format('drop policy if exists %1$s_delete_own on tradepilot.%1$s', table_name);
    execute format(
      'create policy %1$s_delete_own on tradepilot.%1$s for delete to authenticated
         using (user_id in (select id from tradepilot.users where auth_user_id = auth.uid()))',
      table_name
    );
  end loop;
end $$;
