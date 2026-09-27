-- ============================================================================
-- Session 6: is_segment_bookable — geo-spatial segment check
--
-- Given a trip and a passenger's FROM/TO coordinates, determines whether the
-- trip can serve that segment.
--
-- Projects bus, FROM, and TO onto the route polyline (routes.polyline_geom),
-- gets their km-distance from origin, and applies three rules:
--   1. FROM must come before TO on the route (direction check)
--   2. Bus must not have passed FROM (bus_km < from_km)
--   3. ETA from bus to FROM must be > 5 minutes (buffer for driver to respond)
--
-- Returns jsonb: { bookable: bool, reason?: string, bus_km, from_km, to_km,
--                  km_ahead?, eta_minutes?, route_length_km? }
--
-- Verified on FRA→MAU trip 958931ee:
--   Nata→Maun:          bookable=true,  km_ahead=185.61
--   Francistown→Maun:   bus_passed_boarding_stop
--   Nata→Francistown:   wrong_direction
--   Sebina→Maun:        bookable=true,  eta_minutes=48.5
-- ============================================================================

create or replace function public.is_segment_bookable(
  p_trip_id uuid,
  p_from_lat numeric,
  p_from_lng numeric,
  p_to_lat numeric,
  p_to_lng numeric
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_route_id uuid;
  v_polyline_geom geometry;
  v_total_km numeric;
  v_bus_lat numeric;
  v_bus_lng numeric;
  v_bus_speed numeric;
  v_bus_distance_km numeric;
  v_from_distance_km numeric;
  v_to_distance_km numeric;
  v_km_ahead numeric;
  v_eta_minutes numeric;
begin
  -- 1. Load trip, route, polyline, bus position
  select 
    t.route_id,
    r.polyline_geom,
    ST_Length(r.polyline_geom::geography) / 1000,
    vcs.latitude,
    vcs.longitude,
    vcs.speed_kph
  into 
    v_route_id,
    v_polyline_geom,
    v_total_km,
    v_bus_lat,
    v_bus_lng,
    v_bus_speed
  from public.trips t
  join public.routes r on r.id = t.route_id
  left join public.vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
  where t.id = p_trip_id;

  if v_route_id is null or v_polyline_geom is null then
    return jsonb_build_object('bookable', false, 'reason', 'no_route_or_polyline');
  end if;

  if v_bus_lat is null or v_bus_lng is null then
    return jsonb_build_object('bookable', false, 'reason', 'no_bus_position');
  end if;

  -- 2. Project bus, passenger FROM, passenger TO onto the polyline
  v_bus_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(v_bus_lng, v_bus_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  v_from_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(p_from_lng, p_from_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  v_to_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(p_to_lng, p_to_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  -- 3. Direction check: FROM must be before TO along the route
  if v_from_distance_km >= v_to_distance_km then
    return jsonb_build_object(
      'bookable', false,
      'reason', 'wrong_direction',
      'bus_km', v_bus_distance_km,
      'from_km', v_from_distance_km,
      'to_km', v_to_distance_km
    );
  end if;

  -- 4. Bus must be BEHIND the passenger's boarding stop
  if v_bus_distance_km >= v_from_distance_km then
    return jsonb_build_object(
      'bookable', false,
      'reason', 'bus_passed_boarding_stop',
      'bus_km', v_bus_distance_km,
      'from_km', v_from_distance_km
    );
  end if;

  -- 5. ETA buffer: bus must be more than 5 min away from boarding stop
  v_km_ahead := v_from_distance_km - v_bus_distance_km;

  -- Use speed if available, else assume 60 km/h (rural average)
  if v_bus_speed is null or v_bus_speed < 5 then
    v_bus_speed := 60;
  end if;

  v_eta_minutes := ROUND((v_km_ahead / v_bus_speed * 60)::numeric, 1);

  if v_eta_minutes < 5 then
    return jsonb_build_object(
      'bookable', false,
      'reason', 'too_close',
      'eta_minutes', v_eta_minutes,
      'bus_km', v_bus_distance_km,
      'from_km', v_from_distance_km
    );
  end if;

  -- 6. All checks passed
  return jsonb_build_object(
    'bookable', true,
    'bus_km', v_bus_distance_km,
    'from_km', v_from_distance_km,
    'to_km', v_to_distance_km,
    'km_ahead', ROUND(v_km_ahead::numeric, 2),
    'eta_minutes', v_eta_minutes,
    'route_length_km', ROUND(v_total_km::numeric, 2)
  );
end;
$$;

comment on function public.is_segment_bookable is
  'Geo-spatial segment check: does this trip serve this passenger segment? Projects bus + passenger FROM/TO onto route polyline via ST_LineLocatePoint. Returns jsonb: { bookable, reason?, bus_km, from_km, to_km, eta_minutes?, km_ahead?, route_length_km? }.';