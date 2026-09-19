-- ============================================================================
-- B-ETA Test Seed — activate ONE bus in Gaborone for the passenger map
-- Safe to re-run. Uses existing vehicles/routes/drivers — no FK risk.
-- NOTE: vehicle_current_state.status must be one of: IDLE, IN_TRANSIT, STOPPED, OFFLINE
-- ============================================================================

-- Step 1: Pick ONE existing trip and flip it to IN_PROGRESS.
-- The Edge Function only returns trips where status = 'IN_PROGRESS'.
with chosen_trip as (
  select id
  from public.trips
  order by 
    coalesce(scheduled_departure, '1900-01-01'::timestamptz) desc,
    id
  limit 1
)
update public.trips
set 
  status = 'IN_PROGRESS',
  started_at = coalesce(started_at, now()),
  updated_at = now()
where id in (select id from chosen_trip)
returning id, vehicle_id, route_id, trip_code, status;


-- Step 2: Upsert a live position for that trip's vehicle.
-- Coordinates: Gaborone CBD (-24.6531, 25.9113), heading east, ~35 km/h.
-- status = 'IN_TRANSIT' (must match the CHECK constraint)
with chosen_trip as (
  select id, vehicle_id
  from public.trips
  where status = 'IN_PROGRESS'
  order by updated_at desc
  limit 1
)
insert into public.vehicle_current_state (
  vehicle_id,
  trip_id,
  latitude,
  longitude,
  speed_kph,
  heading,
  status,
  passenger_count,
  last_position_at,
  updated_at
)
select
  ct.vehicle_id,
  ct.id,
  -24.6531,
  25.9113,
  35,
  90,
  'IN_TRANSIT',
  12,
  now(),
  now()
from chosen_trip ct
on conflict (vehicle_id) do update set
  trip_id = excluded.trip_id,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  speed_kph = excluded.speed_kph,
  heading = excluded.heading,
  status = excluded.status,
  passenger_count = excluded.passenger_count,
  last_position_at = excluded.last_position_at,
  updated_at = excluded.updated_at
returning vehicle_id, latitude, longitude, status;


-- Step 3: Verify — this should return 1 row.
select 
  t.id as trip_id,
  t.trip_code,
  t.status as trip_status,
  r.name as route_name,
  r.origin,
  r.destination,
  v.registration_plate,
  vcs.latitude,
  vcs.longitude,
  vcs.speed_kph,
  vcs.status as vehicle_status
from public.trips t
left join public.routes r on r.id = t.route_id
left join public.vehicles v on v.id = t.vehicle_id
left join public.vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
where t.status = 'IN_PROGRESS';