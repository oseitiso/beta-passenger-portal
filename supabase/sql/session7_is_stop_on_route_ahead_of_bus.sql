create or replace function public.is_stop_on_route_ahead_of_bus(
  p_trip_id uuid,
  p_lat numeric,
  p_lng numeric
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
  v_point_distance_km numeric;
  v_distance_from_route_km numeric;
  v_eta_minutes numeric;
  v_max_off_route_km numeric := 15;  -- how far off the polyline a point may be
begin
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
    return jsonb_build_object('passable', false, 'reason', 'no_route_or_polyline');
  end if;

  if v_bus_lat is null or v_bus_lng is null then
    return jsonb_build_object('passable', false, 'reason', 'no_bus_position');
  end if;

  -- How far is the passenger's point from the route?
  v_distance_from_route_km := ROUND((
    ST_Distance(
      v_polyline_geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000
  )::numeric, 2);

  if v_distance_from_route_km > v_max_off_route_km then
    return jsonb_build_object(
      'passable', false,
      'reason', 'off_route',
      'km_from_route', v_distance_from_route_km
    );
  end if;

  -- Project bus and passenger's point onto the route
  v_bus_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(v_bus_lng, v_bus_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  v_point_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  -- Bus must be behind the passenger's point
  if v_bus_distance_km >= v_point_distance_km then
    return jsonb_build_object(
      'passable', false,
      'reason', 'bus_passed',
      'bus_km', v_bus_distance_km,
      'point_km', v_point_distance_km
    );
  end if;

  -- ETA buffer: 5 min minimum
  if v_bus_speed is null or v_bus_speed < 5 then
    v_bus_speed := 60;
  end if;

  v_eta_minutes := ROUND((
    (v_point_distance_km - v_bus_distance_km) / v_bus_speed * 60
  )::numeric, 1);

  if v_eta_minutes < 5 then
    return jsonb_build_object(
      'passable', false,
      'reason', 'too_close',
      'eta_minutes', v_eta_minutes,
      'bus_km', v_bus_distance_km,
      'point_km', v_point_distance_km
    );
  end if;

  return jsonb_build_object(
    'passable', true,
    'bus_km', v_bus_distance_km,
    'point_km', v_point_distance_km,
    'km_ahead', ROUND((v_point_distance_km - v_bus_distance_km)::numeric, 2),
    'eta_minutes', v_eta_minutes,
    'km_from_route', v_distance_from_route_km,
    'route_length_km', ROUND(v_total_km::numeric, 2)
  );
end;
$$;

comment on function public.is_stop_on_route_ahead_of_bus is
  'FROM-only check: is this location on the route ahead of the bus? Used when the passenger picks only a departure point.';