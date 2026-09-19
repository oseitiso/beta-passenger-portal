-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 1: Schema Foundation
-- Safe: only creates new tables and functions. Does not modify existing schema.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. driver_seat_marks — driver declares "seat X will free at stop Y"
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.driver_seat_marks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  vehicle_seat_id uuid not null references public.vehicle_seats(id) on delete cascade,
  marked_free_at_stop_id uuid not null references public.stops(id),
  marked_by_driver_id uuid not null references public.drivers(id),
  marked_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_reason text,
  created_at timestamptz not null default now()
);

comment on table public.driver_seat_marks is
  'Driver declares that a specific seat will become available at a specific upcoming stop. Used to allow downstream passengers to book that seat for segments after the mark stop.';

create index if not exists idx_driver_seat_marks_trip_active
  on public.driver_seat_marks(trip_id, marked_free_at_stop_id)
  where cleared_at is null;

alter table public.driver_seat_marks enable row level security;

-- No policies yet — only service_role (Edge Functions) can access this table

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. passenger_cancellation_log — for 3-tier cooldown tracking
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.passenger_cancellation_log (
  id uuid primary key default gen_random_uuid(),
  passenger_identity text not null,   -- 'u:' || user_id OR 'a:' || anonymous_id
  handoff_id uuid references public.booking_handoffs(id) on delete set null,
  cancelled_at timestamptz not null default now(),
  was_after_acceptance boolean not null default false,
  cooldown_until timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.passenger_cancellation_log is
  'Logs every passenger cancellation. Used to enforce 3-tier cooldown: <60s no cooldown, after acceptance = 5 min, 3+ in 1 hour = 30 min.';

create index if not exists idx_passenger_cancellation_identity_recent
  on public.passenger_cancellation_log(passenger_identity, cancelled_at desc);

alter table public.passenger_cancellation_log enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Alter booking_handoffs — add segment hold expiry override (default 10 min)
-- ═══════════════════════════════════════════════════════════════════════════

-- Note: we do NOT alter the existing column default (it's 30 min). We override
-- in the wrapper function (Phase 1, Step 3) so the original function is untouched.

-- Just add a helper column to track expiry override reason (optional, safe)
alter table public.booking_handoffs
  add column if not exists expires_reason text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Alter pickup_notifications — add PIN + attempts tracking
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pickup_notifications
  add column if not exists booking_pin text;

alter table public.pickup_notifications
  add column if not exists pin_attempts integer not null default 0;

comment on column public.pickup_notifications.booking_pin is
  '6-digit PIN generated on driver acceptance. Used for mutual verification at boarding.';

comment on column public.pickup_notifications.pin_attempts is
  'Number of failed PIN verification attempts. After 3, pickup becomes NO_SHOW.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Cooldown check helper — for the passenger request flow
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.check_passenger_cooldown(
  p_passenger_identity text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_last_cancel timestamptz;
  v_recent_count integer;
  v_cooldown_until timestamptz;
begin
  -- Any active cooldown in progress?
  select max(cooldown_until)
    into v_cooldown_until
    from passenger_cancellation_log
    where passenger_identity = p_passenger_identity
      and cooldown_until > now();

  if v_cooldown_until is not null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'cooldown_active',
      'cooldown_until', v_cooldown_until,
      'seconds_remaining', extract(epoch from (v_cooldown_until - now()))::int
    );
  end if;

  -- Count cancellations in last hour
  select count(*)
    into v_recent_count
    from passenger_cancellation_log
    where passenger_identity = p_passenger_identity
      and cancelled_at > now() - interval '1 hour';

  return jsonb_build_object(
    'allowed', true,
    'recent_cancellations', v_recent_count
  );
end;
$function$;

comment on function public.check_passenger_cooldown is
  'Returns whether a passenger is currently in cooldown. Used by the request wrapper.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Registration log — for verification
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  raise notice '=== Phase 1, Step 1 — Schema Foundation ===';
  raise notice 'Created: driver_seat_marks';
  raise notice 'Created: passenger_cancellation_log';
  raise notice 'Altered: booking_handoffs (added expires_reason)';
  raise notice 'Altered: pickup_notifications (added booking_pin, pin_attempts)';
  raise notice 'Created: check_passenger_cooldown()';
  raise notice '=== Step 1 complete ===';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Verification
-- ═══════════════════════════════════════════════════════════════════════════

select 
  'driver_seat_marks' as table_name, 
  exists (select 1 from information_schema.tables where table_schema='public' and table_name='driver_seat_marks') as created
union all
select 
  'passenger_cancellation_log', 
  exists (select 1 from information_schema.tables where table_schema='public' and table_name='passenger_cancellation_log')
union all
select 
  'booking_handoffs.expires_reason', 
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='booking_handoffs' and column_name='expires_reason')
union all
select 
  'pickup_notifications.booking_pin', 
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='pickup_notifications' and column_name='booking_pin')
union all
select 
  'pickup_notifications.pin_attempts', 
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='pickup_notifications' and column_name='pin_attempts')
union all
select 
  'check_passenger_cooldown()', 
  exists (select 1 from pg_proc where proname='check_passenger_cooldown');