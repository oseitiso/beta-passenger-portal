-- ============================================================================
-- B-ETA Booking Flow — Seed route_stops for active routes
-- Adds missing terminal stops + wires up 4 active routes so they're bookable.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Ensure terminal stops exist for Molepolole, Maun, Kasane
--    (Gaborone, Francistown, Mahalapye, Palapye already exist)
-- ═══════════════════════════════════════════════════════════════════════════

insert into stops (id, name, city, lat, lng, is_public)
values
  (
    '33333333-0000-0000-0001-000000000005',
    'Molepolole Bus Rank',
    'Molepolole',
    -24.4065,
    25.4954,
    true
  ),
  (
    '33333333-0000-0000-0001-000000000006',
    'Maun Bus Rank',
    'Maun',
    -19.9833,
    23.4167,
    true
  ),
  (
    '33333333-0000-0000-0001-000000000007',
    'Kasane Bus Rank',
    'Kasane',
    -17.8167,
    25.1500,
    true
  )
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Wire up route_stops for each active route
--    Each route needs at least 2 stops in stop_order sequence.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Route 1: Francistown → Gaborone ───
-- Uses existing 4 stops, natural order
insert into route_stops (route_id, stop_id, stop_order)
values
  ('4d608272-298a-472e-8c2c-8ca11cdaf02f', '33333333-0000-0000-0001-000000000001', 1), -- Francistown
  ('4d608272-298a-472e-8c2c-8ca11cdaf02f', '33333333-0000-0000-0001-000000000002', 2), -- Palapye
  ('4d608272-298a-472e-8c2c-8ca11cdaf02f', '33333333-0000-0000-0001-000000000003', 3), -- Mahalapye
  ('4d608272-298a-472e-8c2c-8ca11cdaf02f', '33333333-0000-0000-0001-000000000004', 4)  -- Gaborone
on conflict do nothing;

-- ─── Route 2: Maun → Gaborone ───
-- Maun is origin; passes through Palapye, Mahalapye, ends Gaborone
insert into route_stops (route_id, stop_id, stop_order)
values
  ('b2ac9cf6-fc41-4c1a-8827-903019380ea9', '33333333-0000-0000-0001-000000000006', 1), -- Maun
  ('b2ac9cf6-fc41-4c1a-8827-903019380ea9', '33333333-0000-0000-0001-000000000002', 2), -- Palapye
  ('b2ac9cf6-fc41-4c1a-8827-903019380ea9', '33333333-0000-0000-0001-000000000003', 3), -- Mahalapye
  ('b2ac9cf6-fc41-4c1a-8827-903019380ea9', '33333333-0000-0000-0001-000000000004', 4)  -- Gaborone
on conflict do nothing;

-- ─── Route 3: Gaborone → Kasane ───
-- Gaborone is origin; passes through Mahalapye, Palapye, ends Kasane
insert into route_stops (route_id, stop_id, stop_order)
values
  ('4b073037-1021-4271-83b0-62deca7e5f57', '33333333-0000-0000-0001-000000000004', 1), -- Gaborone
  ('4b073037-1021-4271-83b0-62deca7e5f57', '33333333-0000-0000-0001-000000000003', 2), -- Mahalapye
  ('4b073037-1021-4271-83b0-62deca7e5f57', '33333333-0000-0000-0001-000000000002', 3), -- Palapye
  ('4b073037-1021-4271-83b0-62deca7e5f57', '33333333-0000-0000-0001-000000000007', 4)  -- Kasane
on conflict do nothing;

-- ─── Route 4: Gaborone → Molepolole ───
-- Short route, only 2 stops
insert into route_stops (route_id, stop_id, stop_order)
values
  ('f5ab1066-61a3-4326-ae2f-4a21a61f392d', '33333333-0000-0000-0001-000000000004', 1), -- Gaborone
  ('f5ab1066-61a3-4326-ae2f-4a21a61f392d', '33333333-0000-0000-0001-000000000005', 2)  -- Molepolole
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Verify — every active route now has ≥2 stops
-- ═══════════════════════════════════════════════════════════════════════════

select 
  r.id as route_id,
  r.name as route_name,
  r.origin,
  r.destination,
  (select count(*) from route_stops where route_id = r.id) as stop_count
from routes r
order by r.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Full route_stops listing for active trips
-- ═══════════════════════════════════════════════════════════════════════════

select 
  t.trip_code,
  t.id as trip_id,
  rs.stop_order,
  s.id as stop_id,
  s.name as stop_name,
  s.city
from trips t
join route_stops rs on rs.route_id = t.route_id
join stops s on s.id = rs.stop_id
where t.status = 'IN_PROGRESS'
order by t.trip_code, rs.stop_order;