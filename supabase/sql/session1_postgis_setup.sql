-- ============================================================================
-- Session 1: PostGIS setup for passenger portal spatial features
-- Enables PostGIS, adds a geometry column on routes, migrates text polylines.
-- ============================================================================

-- 1. Enable PostGIS (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add geometry column to routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS polyline_geom geometry(LineString, 4326);

COMMENT ON COLUMN public.routes.polyline_geom IS
  'PostGIS linestring for spatial operations. Mirror of routes.polyline (text JSON), populated from it.';

-- 3. Spatial index
CREATE INDEX IF NOT EXISTS idx_routes_polyline_geom
  ON public.routes
  USING GIST (polyline_geom);

-- 4. Backfill from text polyline
-- Handles both:
--   - GeoJSON LineString: {"type":"LineString","coordinates":[[lng,lat],...]}
--   - Plain JSON array:    [[lng,lat],[lng,lat],...]
UPDATE public.routes
SET polyline_geom = (
  CASE
    WHEN polyline IS NULL OR polyline = '' THEN NULL

    WHEN polyline LIKE '{"type":%' THEN
      ST_SetSRID(ST_GeomFromGeoJSON(polyline), 4326)

    WHEN polyline LIKE '[%' THEN
      ST_SetSRID(
        ST_MakeLine(
          ARRAY(
            SELECT ST_MakePoint(
              (pt->>0)::numeric,
              (pt->>1)::numeric
            )
            FROM jsonb_array_elements(polyline::jsonb) AS pt
          )
        ),
        4326
      )

    ELSE NULL
  END
)
WHERE polyline IS NOT NULL
  AND polyline_geom IS NULL;

-- 5. Verify
SELECT
  id,
  name,
  polyline IS NOT NULL AS has_text,
  polyline_geom IS NOT NULL AS has_geom,
  ST_NPoints(polyline_geom) AS geom_points,
  ST_Length(polyline_geom::geography) / 1000 AS length_km
FROM public.routes
WHERE is_active = true
ORDER BY name;