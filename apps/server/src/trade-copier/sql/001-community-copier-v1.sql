-- TradePilot community copier V1 tables.
-- Apply in the configured Supabase schema (default: tradepilot).

create table if not exists copier_programs (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'DISABLED')),
  max_follower_devices integer not null default 10 check (max_follower_devices between 1 and 500),
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_copier_programs_provider_user_id
  on copier_programs(provider_user_id);

create table if not exists copier_invite_codes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references copier_programs(id) on delete cascade,
  code text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_copier_invite_codes_one_active_per_program
  on copier_invite_codes(program_id)
  where active = true;

create table if not exists follower_devices (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references copier_programs(id) on delete cascade,
  nickname text,
  token_hash text not null unique,
  account_login_hash text not null,
  account_login_masked text,
  broker_server text,
  platform text check (platform in ('MT4', 'MT5')),
  terminal_fingerprint_hash text not null,
  status text not null default 'ACTIVE' check (status in ('PENDING_APPROVAL', 'ACTIVE', 'REVOKED')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, account_login_hash, terminal_fingerprint_hash)
);

create index if not exists idx_follower_devices_program_id
  on follower_devices(program_id);

create index if not exists idx_follower_devices_program_status_seen
  on follower_devices(program_id, status, last_seen_at desc);
