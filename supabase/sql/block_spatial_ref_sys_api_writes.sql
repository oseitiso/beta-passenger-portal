-- ============================================================================
-- Block API writes to public.spatial_ref_sys
--
-- Why: PostGIS owns this table (owner = supabase_admin). The `postgres` role
-- used by the SQL Editor has TRIGGER privilege but no GRANT OPTION, so it
-- cannot REVOKE the anon/authenticated write grants that supabase_admin issued.
-- RLS cannot be enabled either, because we don't own the table.
--
-- Solution: install a BEFORE INSERT/UPDATE/DELETE/TRUNCATE trigger that
-- raises an exception when the current role is anon or authenticated.
-- PostgREST switches to those roles for API requests, so API writes are
-- blocked. PostGIS internal operations (as supabase_admin), the SQL Editor
-- (as postgres), migrations, and service_role are unaffected.
--
-- Caveats:
--   1. Grants remain. The Supabase Advisor "RLS Disabled in Public" lint will
--      still fire. Dismiss it with an explanatory note.
--   2. If PostGIS is ever dropped and recreated, this trigger disappears with
--      the table and must be recreated.
--   3. service_role can still write. Keep the service key server-side.
-- ============================================================================

create or replace function public.block_spatial_ref_sys_api_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'spatial_ref_sys is read-only for API roles';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger spatial_ref_sys_no_api_writes
before insert or update or delete on public.spatial_ref_sys
for each row execute function public.block_spatial_ref_sys_api_writes();

create trigger spatial_ref_sys_no_api_truncate
before truncate on public.spatial_ref_sys
for each statement execute function public.block_spatial_ref_sys_api_writes();

comment on function public.block_spatial_ref_sys_api_writes() is
  'Blocks anon/authenticated writes to spatial_ref_sys. Replaces the REVOKE that cannot run because the table is owned by supabase_admin.';