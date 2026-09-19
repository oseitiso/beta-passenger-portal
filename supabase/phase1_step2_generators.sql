-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 2: Reference + PIN generators
-- Safe: only creates new functions. No schema changes.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. generate_booking_reference() → 'BTA-XXXXXX'
--    Uses A-Z + 0-9 minus ambiguous characters (O, 0, I, 1)
--    Enforces uniqueness against booking_handoffs.booking_reference
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.generate_booking_reference()
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  -- Safe alphabet: A-Z minus I, O; 0-9 minus 0, 1
  -- 32 characters total: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_alphabet_len constant integer := 32;
  v_ref text;
  v_attempts integer := 0;
  v_max_attempts constant integer := 20;
begin
  loop
    v_attempts := v_attempts + 1;

    -- Generate 6 random characters
    v_ref := 'BTA-';
    for i in 1..6 loop
      v_ref := v_ref || substr(
        v_alphabet,
        (floor(random() * v_alphabet_len) + 1)::int,
        1
      );
    end loop;

    -- Check uniqueness
    if not exists (
      select 1 from booking_handoffs where booking_reference = v_ref
    ) then
      return v_ref;
    end if;

    if v_attempts >= v_max_attempts then
      raise exception 'Failed to generate unique booking reference after % attempts', v_max_attempts;
    end if;
  end loop;
end;
$function$;

comment on function public.generate_booking_reference() is
  'Returns a unique 8-char booking reference in the format BTA-XXXXXX. Avoids ambiguous characters O/0/I/1.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. generate_booking_pin() → '123456' (6 digits, leading zeros allowed)
--    Enforces uniqueness against active pickup_notifications PENDING PINs
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.generate_booking_pin()
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_pin text;
  v_attempts integer := 0;
  v_max_attempts constant integer := 50;
begin
  loop
    v_attempts := v_attempts + 1;

    -- 6-digit PIN: 000000 - 999999
    v_pin := lpad(floor(random() * 1000000)::int::text, 6, '0');

    -- Uniqueness only matters for active pickups (PENDING or ACKNOWLEDGED)
    if not exists (
      select 1
      from pickup_notifications
      where booking_pin = v_pin
        and status in ('PENDING', 'ACKNOWLEDGED')
    ) then
      return v_pin;
    end if;

    if v_attempts >= v_max_attempts then
      raise exception 'Failed to generate unique PIN after % attempts', v_max_attempts;
    end if;
  end loop;
end;
$function$;

comment on function public.generate_booking_pin() is
  'Returns a 6-digit PIN, unique among all active (PENDING/ACKNOWLEDGED) pickup_notifications.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. passenger_identity() helper — builds a stable identifier from user_id/anonymous_id
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.build_passenger_identity(
  p_user_id uuid,
  p_anonymous_id text
)
returns text
language sql
immutable
as $function$
  select case
    when p_user_id is not null then 'u:' || p_user_id::text
    when p_anonymous_id is not null then 'a:' || p_anonymous_id
    else null
  end;
$function$;

comment on function public.build_passenger_identity is
  'Builds a stable passenger identity string for cooldown tracking: u:<uuid> or a:<anon>.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Test the generators
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_ref text;
  v_pin text;
begin
  -- Test 5 references
  for i in 1..5 loop
    v_ref := generate_booking_reference();
    raise notice 'Reference %: %', i, v_ref;
  end loop;

  -- Test 5 PINs
  for i in 1..5 loop
    v_pin := generate_booking_pin();
    raise notice 'PIN %: %', i, v_pin;
  end loop;

  raise notice '=== Phase 1, Step 2 complete ===';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Verification
-- ═══════════════════════════════════════════════════════════════════════════

select 
  'generate_booking_reference()' as object_name,
  exists (select 1 from pg_proc where proname='generate_booking_reference') as created,
  (generate_booking_reference()) as sample_output
union all
select 
  'generate_booking_pin()',
  exists (select 1 from pg_proc where proname='generate_booking_pin'),
  (generate_booking_pin())
union all
select 
  'build_passenger_identity(uuid,text)',
  exists (select 1 from pg_proc where proname='build_passenger_identity'),
  build_passenger_identity('00000000-0000-0000-0000-000000000001'::uuid, null);