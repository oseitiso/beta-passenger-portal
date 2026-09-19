-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 5: Driver Seat Rotation
-- Allows drivers to declare "seat X will free at stop Y".
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. mark_seat_will_free() — driver declares a seat will free at a stop
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.mark_seat_will_free(
  p_trip_id uuid,
  p_vehicle_seat_id uuid,
  p_stop_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_trip trips%rowtype;
  v_stop_order integer;
  v_mark_id uuid;
begin
  -- Load trip
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Trip not found');
  end if;

  -- Verify this driver owns this trip
  if v_trip.driver_id <> p_driver_id then
    return jsonb_build_object('success', false, 'error', 'Not your trip');
  end if;

  -- Trip must be IN_PROGRESS
  if v_trip.status <> 'IN_PROGRESS' then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot mark seats on a trip that is not in progress'
    );
  end if;

  -- Verify the stop is on this trip's route
  select stop_order into v_stop_order
  from route_stops
  where route_id = v_trip.route_id
    and stop_id = p_stop_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Stop not on this route');
  end if;

  -- Verify seat belongs to this vehicle
  if not exists (
    select 1 from vehicle_seats
    where id = p_vehicle_seat_id and vehicle_id = v_trip.vehicle_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Seat not on this vehicle');
  end if;

  -- Clear any existing un-cleared mark for this seat on this trip
  update driver_seat_marks
  set cleared_at = now(),
      cleared_reason = 'replaced_by_new_mark'
  where trip_id = p_trip_id
    and vehicle_seat_id = p_vehicle_seat_id
    and cleared_at is null;

  -- Create the new mark
  insert into driver_seat_marks (
    trip_id,
    vehicle_seat_id,
    marked_free_at_stop_id,
    marked_by_driver_id
  ) values (
    p_trip_id,
    p_vehicle_seat_id,
    p_stop_id,
    p_driver_id
  ) returning id into v_mark_id;

  return jsonb_build_object(
    'success', true,
    'mark_id', v_mark_id,
    'seat_id', p_vehicle_seat_id,
    'free_at_stop_id', p_stop_id,
    'stop_order', v_stop_order
  );
end;
$function$;

comment on function public.mark_seat_will_free is
  'Driver declares that a seat will be available at a specific upcoming stop. Used for downstream passenger bookings.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. clear_seat_mark() — driver rescinds a seat-free declaration
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.clear_seat_mark(
  p_mark_id uuid,
  p_driver_id uuid,
  p_reason text default 'manually_cleared'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mark driver_seat_marks%rowtype;
  v_trip_driver uuid;
begin
  select * into v_mark from driver_seat_marks where id = p_mark_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Mark not found');
  end if;

  if v_mark.cleared_at is not null then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Mark already cleared'
    );
  end if;

  -- Verify driver owns the trip
  select driver_id into v_trip_driver from trips where id = v_mark.trip_id;
  if v_trip_driver <> p_driver_id then
    return jsonb_build_object('success', false, 'error', 'Not your mark');
  end if;

  update driver_seat_marks
  set cleared_at = now(),
      cleared_reason = p_reason
  where id = p_mark_id;

  return jsonb_build_object(
    'success', true,
    'mark_id', p_mark_id,
    'cleared_reason', p_reason
  );
end;
$function$;

comment on function public.clear_seat_mark is
  'Driver rescinds a previous "seat will free" declaration.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_active_seat_marks() — driver sees current marks for a trip
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_active_seat_marks(
  p_trip_id uuid
)
returns table (
  mark_id uuid,
  seat_number integer,
  vehicle_seat_id uuid,
  free_at_stop_id uuid,
  free_at_stop_name text,
  stop_order integer,
  marked_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    dsm.id as mark_id,
    vs.seat_number,
    vs.id as vehicle_seat_id,
    dsm.marked_free_at_stop_id as free_at_stop_id,
    s.name as free_at_stop_name,
    rs.stop_order,
    dsm.marked_at
  from driver_seat_marks dsm
  join vehicle_seats vs on vs.id = dsm.vehicle_seat_id
  join stops s on s.id = dsm.marked_free_at_stop_id
  join trips t on t.id = dsm.trip_id
  join route_stops rs on rs.route_id = t.route_id and rs.stop_id = s.id
  where dsm.trip_id = p_trip_id
    and dsm.cleared_at is null
  order by rs.stop_order, vs.seat_number;
$function$;

comment on function public.get_active_seat_marks is
  'Lists all active "seat will free" marks for a trip. Used by the driver app to display the current rotation plan.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Verification
-- ═══════════════════════════════════════════════════════════════════════════

select 
  'mark_seat_will_free' as function_name,
  exists (select 1 from pg_proc where proname='mark_seat_will_free') as created
union all
select 
  'clear_seat_mark',
  exists (select 1 from pg_proc where proname='clear_seat_mark')
union all
select 
  'get_active_seat_marks',
  exists (select 1 from pg_proc where proname='get_active_seat_marks');