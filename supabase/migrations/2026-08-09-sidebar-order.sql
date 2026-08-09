alter table tradepilot.settings
  add column if not exists sidebar_order jsonb not null default '[]'::jsonb;
