-- ============================================================================
-- B-ETA Booking Flow — Fix: Enable pgcrypto for gen_random_bytes()
-- ============================================================================

-- Ensure the pgcrypto extension is available
create extension if not exists pgcrypto;

-- Verify
select 
  'pgcrypto extension' as component,
  exists (select 1 from pg_extension where extname = 'pgcrypto') as enabled;

-- Test gen_random_bytes()
select 
  'gen_random_bytes(24)' as test,
  length(encode(gen_random_bytes(24), 'hex')) as output_length_should_be_48;