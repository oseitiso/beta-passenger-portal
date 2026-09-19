-- ============================================================================
-- B-ETA Fleet Seed v3 — add 3 more live buses on different Botswana routes
-- Reuses existing operator. Idempotent via pre-checks. Uses constraint-correct values:
--   trips.trip_type  → 'SCHEDULED' (not 'scheduled')
--   trips.status     → 'IN_PROGRESS'
--   vehicle_current_state.status → 'IN_TRANSIT'
-- ============================================================================

do $$
declare
  v_operator_id uuid;
  v_route_id    uuid;
  v_vehicle_id  uuid;
  v_driver_id   uuid;
  v_trip_id     uuid;
begin
  -- Reuse the operator from any existing route
  select operator_id into v_operator_id
  from public.routes
  where operator_id is not null
  limit 1;

  if v_operator_id is null then
    raise exception 'No operator_id found on any existing route. Seed aborted.';
  end if;

  -- ═══════════════════════════════════════════════════════════════
  -- BUS 2: Francistown → Gaborone
  -- ═══════════════════════════════════════════════════════════════

  select id into v_route_id from public.routes where name = 'Francistown → Gaborone' limit 1;
  if v_route_id is null then
    insert into public.routes (operator_id, name, origin, destination,
                               origin_lat, origin_lng, destination_lat, destination_lng,
                               distance_km, estimated_duration_min, is_active)
    values (v_operator_id, 'Francistown → Gaborone', 'Francistown', 'Gaborone',
            -21.1702, 27.5089, -24.6531, 25.9113,
            440, 360, true)
    returning id into v_route_id;
  end if;

  select id into v_vehicle_id from public.vehicles where registration_plate = 'B 200 FTS' limit 1;
  if v_vehicle_id is null then
    insert into public.vehicles (operator_id, registration_plate, capacity, status)
    values (v_operator_id, 'B 200 FTS', 65, 'active')
    returning id into v_vehicle_id;
  end if;

  select id into v_driver_id from public.drivers where full_name = 'Test Driver FTS' limit 1;
  if v_driver_id is null then
    insert into public.drivers (operator_id, full_name, phone, pin_hash, status)
    values (v_operator_id, 'Test Driver FTS', '+26771000002', 'test-pin-hash-2', 'active')
    returning id into v_driver_id;
  end if;

  select id into v_trip_id from public.trips 
  where vehicle_id = v_vehicle_id and status = 'IN_PROGRESS' limit 1;
  if v_trip_id is null then
    insert into public.trips (operator_id, route_id, vehicle_id, driver_id, status, trip_code,
                              scheduled_departure, trip_type)
    values (v_operator_id, v_route_id, v_vehicle_id, v_driver_id, 'IN_PROGRESS', 'FTS-GBE-001',
            now(), 'SCHEDULED')
    returning id into v_trip_id;
  end if;

  insert into public.vehicle_current_state
    (vehicle_id, trip_id, latitude, longitude, speed_kph, heading, status, passenger_count, last_position_at)
  values (v_vehicle_id, v_trip_id, -22.5000, 26.5000, 75, 200, 'IN_TRANSIT', 38, now())
  on conflict (vehicle_id) do update set
    trip_id = excluded.trip_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    speed_kph = excluded.speed_kph,
    heading = excluded.heading,
    status = excluded.status,
    passenger_count = excluded.passenger_count,
    last_position_at = excluded.last_position_at,
    updated_at = now();

  -- ═══════════════════════════════════════════════════════════════
  -- BUS 3: Maun → Gaborone
  -- ═══════════════════════════════════════════════════════════════

  select id into v_route_id from public.routes where name = 'Maun → Gaborone' limit 1;
  if v_route_id is null then
    insert into public.routes (operator_id, name, origin, destination,
                               origin_lat, origin_lng, destination_lat, destination_lng,
                               distance_km, estimated_duration_min, is_active)
    values (v_operator_id, 'Maun → Gaborone', 'Maun', 'Gaborone',
            -19.9833, 23.4167, -24.6531, 25.9113,
            890, 720, true)
    returning id into v_route_id;
  end if;

  select id into v_vehicle_id from public.vehicles where registration_plate = 'B 300 MAU' limit 1;
  if v_vehicle_id is null then
    insert into public.vehicles (operator_id, registration_plate, capacity, status)
    values (v_operator_id, 'B 300 MAU', 50, 'active')
    returning id into v_vehicle_id;
  end if;

  select id into v_driver_id from public.drivers where full_name = 'Test Driver MAU' limit 1;
  if v_driver_id is null then
    insert into public.drivers (operator_id, full_name, phone, pin_hash, status)
    values (v_operator_id, 'Test Driver MAU', '+26771000003', 'test-pin-hash-3', 'active')
    returning id into v_driver_id;
  end if;

  select id into v_trip_id from public.trips 
  where vehicle_id = v_vehicle_id and status = 'IN_PROGRESS' limit 1;
  if v_trip_id is null then
    insert into public.trips (operator_id, route_id, vehicle_id, driver_id, status, trip_code,
                              scheduled_departure, trip_type)
    values (v_operator_id, v_route_id, v_vehicle_id, v_driver_id, 'IN_PROGRESS', 'MAU-GBE-001',
            now(), 'SCHEDULED')
    returning id into v_trip_id;
  end if;

  insert into public.vehicle_current_state
    (vehicle_id, trip_id, latitude, longitude, speed_kph, heading, status, passenger_count, last_position_at)
  values (v_vehicle_id, v_trip_id, -21.5000, 24.5000, 80, 160, 'IN_TRANSIT', 22, now())
  on conflict (vehicle_id) do update set
    trip_id = excluded.trip_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    speed_kph = excluded.speed_kph,
    heading = excluded.heading,
    status = excluded.status,
    passenger_count = excluded.passenger_count,
    last_position_at = excluded.last_position_at,
    updated_at = now();

  -- ═══════════════════════════════════════════════════════════════
  -- BUS 4: Gaborone → Kasane
  -- ═══════════════════════════════════════════════════════════════

  select id into v_route_id from public.routes where name = 'Gaborone → Kasane' limit 1;
  if v_route_id is null then
    insert into public.routes (operator_id, name, origin, destination,
                               origin_lat, origin_lng, destination_lat, destination_lng,
                               distance_km, estimated_duration_min, is_active)
    values (v_operator_id, 'Gaborone → Kasane', 'Gaborone', 'Kasane',
            -24.6531, 25.9113, -17.8167, 25.1500,
            1010, 840, true)
    returning id into v_route_id;
  end if;

  select id into v_vehicle_id from public.vehicles where registration_plate = 'B 400 KAS' limit 1;
  if v_vehicle_id is null then
    insert into public.vehicles (operator_id, registration_plate, capacity, status)
    values (v_operator_id, 'B 400 KAS', 55, 'active')
    returning id into v_vehicle_id;
  end if;

  select id into v_driver_id from public.drivers where full_name = 'Test Driver KAS' limit 1;
  if v_driver_id is null then
    insert into public.drivers (operator_id, full_name, phone, pin_hash, status)
    values (v_operator_id, 'Test Driver KAS', '+26771000004', 'test-pin-hash-4', 'active')
    returning id into v_driver_id;
  end if;

  select id into v_trip_id from public.trips 
  where vehicle_id = v_vehicle_id and status = 'IN_PROGRESS' limit 1;
  if v_trip_id is null then
    insert into public.trips (operator_id, route_id, vehicle_id, driver_id, status, trip_code,
                              scheduled_departure, trip_type)
    values (v_operator_id, v_route_id, v_vehicle_id, v_driver_id, 'IN_PROGRESS', 'GBE-KAS-001',
            now(), 'SCHEDULED')
    returning id into v_trip_id;
  end if;

  insert into public.vehicle_current_state
    (vehicle_id, trip_id, latitude, longitude, speed_kph, heading, status, passenger_count, last_position_at)
  values (v_vehicle_id, v_trip_id, -22.0000, 26.5000, 85, 20, 'IN_TRANSIT', 30, now())
  on conflict (vehicle_id) do update set
    trip_id = excluded.trip_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    speed_kph = excluded.speed_kph,
    heading = excluded.heading,
    status = excluded.status,
    passenger_count = excluded.passenger_count,
    last_position_at = excluded.last_position_at,
    updated_at = now();

  raise notice 'Fleet seed v3 complete';
end $$;

-- Verify — should show 4 buses
select 
  v.registration_plate,
  r.name as route_name,
  r.origin,
  r.destination,
  round(vcs.latitude::numeric, 4) as lat,
  round(vcs.longitude::numeric, 4) as lng,
  vcs.speed_kph,
  vcs.status as vehicle_status
from public.trips t
join public.routes r on r.id = t.route_id
join public.vehicles v on v.id = t.vehicle_id
join public.vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
where t.status = 'IN_PROGRESS'
order by v.registration_plate;