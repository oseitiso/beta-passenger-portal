-- ============================================================================
-- Session 8: Lenient search functions
--
-- These functions decide which buses appear on the passenger map when a
-- search filter is applied. They are intentionally more permissive than the
-- booking functions (is_segment_bookable, is_stop_boardable) so that:
--
--   1. A bus still at the origin shows up in search results
--   2. A passenger can see a bus before it's technically bookable
--   3. Actual booking attempts are still rejected server-side
--
-- Booking (strict)  → is_segment_bookable, is_stop_boardable
-- Search  (lenient) → is_segment_searchable, is_stop_on_route_searchable
--
-- v2 — lowered off-route threshold from 15 km to 5 km.
--      Rationale: every real stop in the database is within 4.78 km of its
--      route polyline. A 15 km radius allowed false positives (e.g. searching
--      "Maun" while a bus is on a Francistown → Madikwe Ward route).
-- ============================================================================


-- ─── Two-point search (FROM + TO) ───────────────────────────────────────────

create or replace function public.is_segment_searchable(
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
  v_bus_distance_km numeric;
  v_from_distance_km numeric;
  v_to_distance_km numeric;
  v_from_off_route_km numeric;
  v_to_off_route_km numeric;
  v_max_off_route_km numeric := 5;     -- was 15 — tightened 2026-09-27
  v_grace_km numeric := 1;             -- bus can be up to 1 km past FROM
begin
  select
    t.route_id,
    r.polyline_geom,
    ST_Length(r.polyline_geom::geography) / 1000,
    vcs.latitude,
    vcs.longitude
  into
    v_route_id,
    v_polyline_geom,
    v_total_km,
    v_bus_lat,
    v_bus_lng
  from public.trips t
  join public.routes r on r.id = t.route_id
  left join public.vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
  where t.id = p_trip_id;

  if v_route_id is null or v_polyline_geom is null then
    return jsonb_build_object('searchable', false, 'reason', 'no_route_or_polyline');
  end if;

  if v_bus_lat is null or v_bus_lng is null then
    return jsonb_build_object('searchable', false, 'reason', 'no_bus_position');
  end if;

  v_from_off_route_km := ROUND((
    ST_Distance(
      v_polyline_geom::geography,
      ST_SetSRID(ST_MakePoint(p_from_lng, p_from_lat), 4326)::geography
    ) / 1000
  )::numeric, 2);

  v_to_off_route_km := ROUND((
    ST_Distance(
      v_polyline_geom::geography,
      ST_SetSRID(ST_MakePoint(p_to_lng, p_to_lat), 4326)::geography
    ) / 1000
  )::numeric, 2);

  if v_from_off_route_km > v_max_off_route_km then
    return jsonb_build_object(
      'searchable', false,
      'reason', 'from_off_route',
      'from_km_from_route', v_from_off_route_km
    );
  end if;

  if v_to_off_route_km > v_max_off_route_km then
    return jsonb_build_object(
      'searchable', false,
      'reason', 'to_off_route',
      'to_km_from_route', v_to_off_route_km
    );
  end if;

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

  if v_from_distance_km >= v_to_distance_km then
    return jsonb_build_object(
      'searchable', false,
      'reason', 'wrong_direction',
      'from_km', v_from_distance_km,
      'to_km', v_to_distance_km
    );
  end if;

  if v_bus_distance_km > v_from_distance_km + v_grace_km then
    return jsonb_build_object(
      'searchable', false,
      'reason', 'bus_passed',
      'bus_km', v_bus_distance_km,
      'from_km', v_from_distance_km
    );
  end if;

  return jsonb_build_object(
    'searchable', true,
    'bus_km', v_bus_distance_km,
    'from_km', v_from_distance_km,
    'to_km', v_to_distance_km,
    'km_ahead', ROUND((v_from_distance_km - v_bus_distance_km)::numeric, 2),
    'from_km_from_route', v_from_off_route_km,
    'to_km_from_route', v_to_off_route_km,
    'route_length_km', ROUND(v_total_km::numeric, 2)
  );
end;
$$;

comment on function public.is_segment_searchable is
  'Lenient map-search check: bus route passes near BOTH the passenger FROM and TO locations (within 5 km), direction is correct, and the bus has not passed FROM by more than 1 km. No ETA buffer — used for showing buses on the map.';


-- ─── FROM-only search ───────────────────────────────────────────────────────

create or replace function public.is_stop_on_route_searchable(
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
  v_bus_distance_km numeric;
  v_point_distance_km numeric;
  v_off_route_km numeric;
  v_max_off_route_km numeric := 5;     -- was 15 — tightened 2026-09-27
  v_grace_km numeric := 1;
begin
  select
    t.route_id,
    r.polyline_geom,
    ST_Length(r.polyline_geom::geography) / 1000,
    vcs.latitude,
    vcs.longitude
  into
    v_route_id,
    v_polyline_geom,
    v_total_km,
    v_bus_lat,
    v_bus_lng
  from public.trips t
  join public.routes r on r.id = t.route_id
  left join public.vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
  where t.id = p_trip_id;

  if v_route_id is null or v_polyline_geom is null then
    return jsonb_build_object('searchable', false, 'reason', 'no_route_or_polyline');
  end if;

  if v_bus_lat is null or v_bus_lng is null then
    return jsonb_build_object('searchable', false, 'reason', 'no_bus_position');
  end if;

  v_off_route_km := ROUND((
    ST_Distance(
      v_polyline_geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000
  )::numeric, 2);

  if v_off_route_km > v_max_off_route_km then
    return jsonb_build_object(
      'searchable', false,
      'reason', 'off_route',
      'km_from_route', v_off_route_km
    );
  end if;

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

  if v_bus_distance_km > v_point_distance_km + v_grace_km then
    return jsonb_build_object(
      'searchable', false,
      'reason', 'bus_passed',
      'bus_km', v_bus_distance_km,
      'point_km', v_point_distance_km
    );
  end if;

  return jsonb_build_object(
    'searchable', true,
    'bus_km', v_bus_distance_km,
    'point_km', v_point_distance_km,
    'km_ahead', ROUND((v_point_distance_km - v_bus_distance_km)::numeric, 2),
    'km_from_route', v_off_route_km,
    'route_length_km', ROUND(v_total_km::numeric, 2)
  );
end;
$$;

comment on function public.is_stop_on_route_searchable is
  'Lenient FROM-only map-search check. Location must be within 5 km of the route; bus must not have passed it by more than 1 km. No ETA buffer.';