-- ============================================================================
-- B-ETA Booking Flow — Fix: Move pgcrypto to public schema
-- ============================================================================

-- Check where pgcrypto currently lives
select 
  e.extname,
  n.nspname as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

-- Drop and reinstall in public schema
drop extension if exists pgcrypto;
create extension pgcrypto with schema public;

-- Verify it's now in public
select 
  e.extname,
  n.nspname as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

-- Test the function works from a public-schema context
do $$
begin
  raise notice 'Test token: %', encode(gen_random_bytes(24), 'hex');
end $$;