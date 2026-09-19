-- ============================================================================
-- B-ETA Booking Flow — Fix: Update search_path on create_handoff_reservation_workflow
-- Adds 'extensions' to the search path so pgcrypto's gen_random_bytes() is found.
-- The function body is unchanged — only the search_path setting is modified.
-- ============================================================================

-- Verify where gen_random_bytes lives
select 
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'gen_random_bytes';

-- Recreate the function with the fixed search_path
-- (the function body is identical to what already exists)
CREATE OR REPLACE FUNCTION public.create_handoff_reservation_workflow(
  p_trip_id uuid,
  p_from_stop_id uuid,
  p_to_stop_id uuid,
  p_requested_seats integer,
  p_user_id uuid DEFAULT NULL::uuid,
  p_anonymous_id text DEFAULT NULL::text,
  p_passenger_name text DEFAULT NULL::text,
  p_passenger_phone text DEFAULT NULL::text,
  p_preferred_seat integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_trip trips%rowtype;
  v_token text;
  v_handoff_id uuid;
  v_bookable integer;
  v_expires timestamptz := now() + interval '30 minutes';
begin
  if p_requested_seats is null or p_requested_seats <= 0 then
    return jsonb_build_object('success', false, 'error', 'Invalid seat count');
  end if;

  -- Lock trip to serialize reservations
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Trip not found');
  end if;
  if v_trip.status <> 'IN_PROGRESS' then
    return jsonb_build_object('success', false, 'error', 'Trip is not in progress');
  end if;

  if p_from_stop_id = p_to_stop_id then
    return jsonb_build_object('success', false, 'error', 'From and to stops must differ');
  end if;

  -- Verify both stops belong to the route
  if not exists (
    select 1 from route_stops where route_id = v_trip.route_id and stop_id = p_from_stop_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Boarding stop not on route');
  end if;
  if not exists (
    select 1 from route_stops where route_id = v_trip.route_id and stop_id = p_to_stop_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Destination stop not on route');
  end if;

  -- Recompute bookable capacity under the lock
  v_bookable := trip_bookable_seats(p_trip_id, p_from_stop_id, p_to_stop_id);

  if v_bookable < p_requested_seats then
    return jsonb_build_object(
      'success', false,
      'error', 'Not enough seats',
      'bookable', v_bookable
    );
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into booking_handoffs (
    token, user_id, anonymous_id, trip_id,
    from_stop_id, to_stop_id, vehicle_id, operator_id,
    requested_seats, reserved_seats, preferred_seat,
    status, passenger_name, passenger_phone, expires_at
  ) values (
    v_token, p_user_id, p_anonymous_id, v_trip.id,
    p_from_stop_id, p_to_stop_id, v_trip.vehicle_id, v_trip.operator_id,
    p_requested_seats, p_requested_seats, p_preferred_seat,
    'PENDING', p_passenger_name, p_passenger_phone, v_expires
  ) returning id into v_handoff_id;

  return jsonb_build_object(
    'success', true,
    'handoff_id', v_handoff_id,
    'token', v_token,
    'expires_at', v_expires,
    'seats_available_after', v_bookable - p_requested_seats
  );
end;
$function$;

-- Verify the search_path was applied
select 
  p.proname as function_name,
  p.proconfig as config
from pg_proc p
where p.proname = 'create_handoff_reservation_workflow';