-- ============================================================================
-- is_stop_boardable(trip_id, stop_id)
-- Returns JSONB: { bookable: bool, reason?: string, distance_km?: number, eta_minutes?: number }
--
-- Determines whether a passenger can board at a given stop on a trip.
-- Rules:
--   1. Stop must exist on the trip's route
--   2. Bus must not have already passed the stop
--   3. ETA from bus to stop must be > 5 minutes (buffer for driver to respond)
--
-- Distance is straight-line * 1.15 (road factor approximation).
-- Speed fallback: 60 km/h when bus is stationary or speed is unknown.
-- ============================================================================

create or replace function public.is_stop_boardable(
  p_trip_id uuid,
  p_stop_id uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_route_id uuid;
  v_bus_lat numeric;
  v_bus_lng numeric;
  v_bus_speed numeric;
  v_stop_lat numeric;
  v_stop_lng numeric;
  v_stop_order integer;
  v_nearest_stop_order integer;
  v_distance_km numeric;
  v_eta_minutes numeric;
begin
  -- 1. Get trip info
  select t.route_id, vcs.latitude, vcs.longitude, vcs.speed_kph
  into v_route_id, v_bus_lat, v_bus_lng, v_bus_speed
  from public.trips t
  left join public.vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
  where t.id = p_trip_id;

  if v_route_id is null or v_bus_lat is null then
    return jsonb_build_object('bookable', false, 'reason', 'no_location');
  end if;

  -- 2. Get the boarding stop's order and coords
  select rs.stop_order, s.lat, s.lng
  into v_stop_order, v_stop_lat, v_stop_lng
  from public.route_stops rs
  join public.stops s on s.id = rs.stop_id
  where rs.route_id = v_route_id and rs.stop_id = p_stop_id;

  if v_stop_order is null then
    return jsonb_build_object('bookable', false, 'reason', 'stop_not_on_route');
  end if;

  -- 3. Find the nearest stop to the bus's current position
  select rs.stop_order
  into v_nearest_stop_order
  from public.route_stops rs
  join public.stops s on s.id = rs.stop_id
  where rs.route_id = v_route_id
  order by (
    power(v_bus_lat - s.lat, 2) + power(v_bus_lng - s.lng, 2)
  ) asc
  limit 1;

  -- 4. RULE 1: Bus must not have passed the stop
  if v_nearest_stop_order > v_stop_order then
    return jsonb_build_object('bookable', false, 'reason', 'stop_already_passed');
  end if;

  -- 5. RULE 2: ETA buffer (5 minutes)
  -- Straight-line distance
  v_distance_km := 111 * sqrt(
    power(v_bus_lat - v_stop_lat, 2) +
    power((v_bus_lng - v_stop_lng) * cos(radians(v_bus_lat)), 2)
  );

  -- Road factor: real roads are ~15% longer than straight-line
  v_distance_km := v_distance_km * 1.15;

  -- If speed is unknown or zero, use a conservative 60 km/h estimate
  if v_bus_speed is null or v_bus_speed < 5 then
    v_bus_speed := 60;
  end if;

  v_eta_minutes := (v_distance_km / v_bus_speed) * 60;

  if v_eta_minutes < 5 then
    return jsonb_build_object(
      'bookable', false,
      'reason', 'too_close',
      'eta_minutes', round(v_eta_minutes::numeric, 1)
    );
  end if;

  return jsonb_build_object(
    'bookable', true,
    'distance_km', round(v_distance_km::numeric, 1),
    'eta_minutes', round(v_eta_minutes::numeric, 1)
  );
end;
$$;