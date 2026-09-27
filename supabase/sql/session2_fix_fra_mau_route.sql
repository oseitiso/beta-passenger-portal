-- ============================================================================
-- Session 2: Fix Francistown → Maun route data
--
-- The operator portal had created this route with:
--   - Wrong stop_order (Francistown, Gweta, Nata, dup, Sebina, dup, Maun)
--   - Two duplicate/coordinate-named stops near Sebina
--   - Intermediate stops marked is_public = false
--
-- Result: passengers couldn't find Sebina, Nata, or Gweta; route polyline
-- could not be generated (zigzag order would break OSRM).
-- ============================================================================

-- A. Remove duplicate coord-named stops from this route
DELETE FROM public.route_stops
WHERE route_id = 'afdb0738-cedb-414d-89f4-43ee529eb2bd'
  AND stop_id IN (
    '9b4601f8-733d-459a-9a5d-97e750fa32d6',
    '95524bfc-f0cf-43f9-af98-bfac0f178f06'
  );

-- B. Reorder remaining stops to correct geographic sequence
UPDATE public.route_stops
SET stop_order = CASE stop_id
  WHEN 'e7812cfe-6560-4889-81c8-c1e3a10dfe9d' THEN 1  -- Francistown
  WHEN 'b2cd1255-5b06-46e6-889b-fb409329afd5' THEN 2  -- Sebina
  WHEN '18be0231-7fd7-4141-9dd1-83ebfa6a08cd' THEN 3  -- Nata
  WHEN '1dcf4ab1-357f-4cd7-ba39-23ada9233d3a' THEN 4  -- Gweta
  WHEN 'f5f6706d-0a87-4ac7-afae-6bc562cac61f' THEN 5  -- Maun
END
WHERE route_id = 'afdb0738-cedb-414d-89f4-43ee529eb2bd';

-- C. Make intermediate stops public
UPDATE public.stops
SET is_public = true
WHERE id IN (
  'b2cd1255-5b06-46e6-889b-fb409329afd5',  -- Sebina
  '18be0231-7fd7-4141-9dd1-83ebfa6a08cd',  -- Nata
  '1dcf4ab1-357f-4cd7-ba39-23ada9233d3a'   -- Gweta
);

-- D. Verify
SELECT 
  rs.stop_order,
  s.name,
  s.lat,
  s.lng,
  s.is_public
FROM public.route_stops rs
JOIN public.stops s ON s.id = rs.stop_id
WHERE rs.route_id = 'afdb0738-cedb-414d-89f4-43ee529eb2bd'
ORDER BY rs.stop_order;