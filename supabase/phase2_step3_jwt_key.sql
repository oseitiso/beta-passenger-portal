-- ============================================================================
-- B-ETA Booking Flow — Phase 2, Step 3: Driver JWT signing key
-- Creates a system_config table storing the HMAC key for driver session tokens.
-- ============================================================================

create table if not exists public.system_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.system_config is
  'Stores system-level config values like the driver JWT signing secret.';

alter table public.system_config enable row level security;
-- No policies — service_role only.

-- Generate the JWT signing secret once (idempotent)
insert into public.system_config (key, value)
values (
  'driver_jwt_secret',
  encode(gen_random_bytes(48), 'hex')
)
on conflict (key) do nothing;

-- Verify
select 
  key, 
  length(value) as value_length,
  created_at
from public.system_config
where key = 'driver_jwt_secret';