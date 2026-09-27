-- ============================================================================
-- Session 5: Compute distance_from_origin_km for every stop on every route
--
-- Uses ST_LineLocatePoint to project each stop's lat/lng onto the route
-- polyline, then multiplies the resulting fraction by the polyline's total
-- length to get the km-distance from origin.
--
-- This is the numeric backbone for the geo-spatial booking filter (Session 6).
-- ============================================================================

-- A. Add column if missing
ALTER TABLE public.route_stops
  ADD COLUMN IF NOT EXISTS distance_from_origin_km numeric;

COMMENT ON COLUMN public.route_stops.distance_from_origin_km IS
  'Distance from the route origin along the polyline, in km. Populated from ST_LineLocatePoint against routes.polyline_geom.';

-- B. Backfill: project each stop onto its route polyline
WITH projected AS (
  SELECT 
    rs.id,
    rs.route_id,
    rs.stop_id,
    r.polyline_geom,
    ST_LineLocatePoint(
      r.polyline_geom,
      ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)
    ) AS fraction,
    ST_Length(r.polyline_geom::geography) / 1000 AS total_km
  FROM public.route_stops rs
  JOIN public.routes r ON r.id = rs.route_id
  JOIN public.stops s ON s.id = rs.stop_id
  WHERE r.polyline_geom IS NOT NULL
    AND s.lat IS NOT NULL
    AND s.lng IS NOT NULL
)
UPDATE public.route_stops rs
SET distance_from_origin_km = ROUND((p.fraction * p.total_km)::numeric, 2)
FROM projected p
WHERE rs.id = p.id;

-- C. Verify FRA→MAU (expected: 0, ~49, ~186, ~287, ~496)
SELECT 
  r.name AS route_name,
  s.name AS stop_name,
  rs.stop_order,
  rs.distance_from_origin_km
FROM public.route_stops rs
JOIN public.routes r ON r.id = rs.route_id
JOIN public.stops s ON s.id = rs.stop_id
WHERE r.id = 'afdb0738-cedb-414d-89f4-43ee529eb2bd'
ORDER BY rs.stop_order;