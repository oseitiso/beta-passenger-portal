// B-ETA Passenger API Edge Function — v2.2
// Deploy to: hzmpncdygkeqvoszunfm
// Public-facing API for the passenger portal. Returns ONLY public bus data.
//
// v1.1 — distance_remaining_km + eta_minutes per bus
// v1.2 — GET /routes-with-polylines
// v1.3 — stale cutoff 2 min → 5 min
// v1.4 — boarding-stop filter
// v1.5 — stops expose reverse_geocoded_name
// v1.6 — GET /geocode?q= (forward geocoding proxy)
// v2.0 — geo-spatial segment filter (is_segment_bookable)
// v2.1 — FROM-only support (is_stop_on_route_ahead_of_bus)
// v2.2 — GET /locations/search?q= (mixed local stops + OpenCage)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://esm.sh/postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";

const sql = postgres(SUPABASE_DB_URL, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
});

// In-memory cache for /locations/search — 24h TTL per normalized query
const locationSearchCache = new Map<
  string,
  { data: unknown | null; ts: number }
>();

// ─── Types ──────────────────────────────────────────────────────────────

interface StopShape {
  stop_id: string;
  name: string;
  reverse_geocoded_name: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  order: number;
  distance_from_origin_km: number | null;
}

interface PublicTrip {
  trip_id: string;
  trip_code: string | null;
  route: {
    route_id: string;
    name: string;
    origin: string | null;
    destination: string | null;
    stops: StopShape[];
  } | null;
  live: {
    latitude: number | null;
    longitude: number | null;
    speed_kph: number | null;
    heading: number | null;
    last_position_at: string | null;
    distance_remaining_km: number | null;
    eta_minutes: number | null;
  };
  vehicle: {
    registration_plate: string;
    capacity: number | null;
    passenger_count: number;
  };
  status: string;
  segment_availability?: {
    seats_available: number;
    from_stop_id: string;
    to_stop_id: string;
  };
}

interface PublicRoute {
  route_id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  polyline: [number, number][] | null;
}

interface PublicStopFull {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadStopsForRoute(routeId: string): Promise<StopShape[]> {
  const rows = await sql<
    {
      stop_id: string;
      name: string;
      reverse_geocoded_name: string | null;
      city: string | null;
      lat: number | null;
      lng: number | null;
      stop_order: number;
      distance_from_origin_km: number | null;
    }[]
  >`
    select
      s.id as stop_id,
      s.name,
      s.reverse_geocoded_name,
      s.city,
      s.lat,
      s.lng,
      rs.stop_order,
      rs.distance_from_origin_km
    from route_stops rs
    join stops s on s.id = rs.stop_id
    where rs.route_id = ${routeId}::uuid
    order by rs.stop_order asc
  `;
  return rows.map((r) => ({
    stop_id: r.stop_id,
    name: r.name,
    reverse_geocoded_name: r.reverse_geocoded_name,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    order: r.stop_order,
    distance_from_origin_km: r.distance_from_origin_km,
  }));
}

async function resolveLocation(
  input: string
): Promise<{ lat: number; lng: number; display: string; source: string } | null> {
  const norm = input.trim().toLowerCase();
  if (norm.length < 2) return null;

  const stops = await sql<
    { id: string; name: string; lat: number | null; lng: number | null }[]
  >`
    select id, name, lat, lng
    from public.stops
    where lat is not null
      and lng is not null
      and (
        lower(name) = ${norm}
        or lower(reverse_geocoded_name) = ${norm}
        or lower(name) like ${"%" + norm + "%"}
        or lower(reverse_geocoded_name) like ${"%" + norm + "%"}
      )
    order by
      case when lower(name) = ${norm} then 0
           when lower(reverse_geocoded_name) = ${norm} then 1
           else 2 end
    limit 1
  `;

  if (stops.length > 0 && stops[0].lat != null && stops[0].lng != null) {
    return {
      lat: Number(stops[0].lat),
      lng: Number(stops[0].lng),
      display: stops[0].name,
      source: "stop_lookup",
    };
  }

  const apiKey = Deno.env.get("OPENCAGE_API_KEY");
  if (!apiKey) return null;

  try {
    const url = new URL("https://api.opencagedata.com/geocode/v1/json");
    url.searchParams.set("q", `${input}, Botswana`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", "en");
    url.searchParams.set("no_annotations", "1");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycode", "bw");

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(t);

    if (!res.ok) return null;

    const json = (await res.json()) as {
      results?: Array<{
        geometry?: { lat: number; lng: number };
        formatted?: string;
      }>;
    };

    const first = json.results?.[0];
    if (!first?.geometry) return null;

    return {
      lat: first.geometry.lat,
      lng: first.geometry.lng,
      display: first.formatted ?? input,
      source: "forward_geocode",
    };
  } catch {
    return null;
  }
}

async function fetchActiveTrips(opts: {
  from?: string;
  to?: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
}): Promise<PublicTrip[]> {
  let fromCoord: { lat: number; lng: number; display: string } | null = null;
  let toCoord: { lat: number; lng: number; display: string } | null = null;

  if (opts.fromLat != null && opts.fromLng != null) {
    fromCoord = { lat: opts.fromLat, lng: opts.fromLng, display: "provided" };
  } else if (opts.from) {
    fromCoord = await resolveLocation(opts.from);
  }

  if (opts.toLat != null && opts.toLng != null) {
    toCoord = { lat: opts.toLat, lng: opts.toLng, display: "provided" };
  } else if (opts.to) {
    toCoord = await resolveLocation(opts.to);
  }

  const hasFromFilter = fromCoord != null;
  const hasSegmentFilter = fromCoord != null && toCoord != null;

  const trips = await sql<
    {
      trip_id: string;
      trip_code: string | null;
      status: string;
      route_id: string | null;
      vehicle_id: string | null;
      route_name: string | null;
      route_origin: string | null;
      route_destination: string | null;
      vehicle_plate: string | null;
      vehicle_capacity: number | null;
      passenger_count: number | null;
      current_passenger_count: number | null;
      lat: number | null;
      lng: number | null;
      speed_kph: number | null;
      heading: number | null;
      last_position_at: string | null;
      distance_remaining_km: number | null;
      eta_minutes: number | null;
    }[]
  >`
    select
      t.id as trip_id,
      t.trip_code,
      t.status,
      t.route_id,
      t.vehicle_id,
      r.name as route_name,
      r.origin as route_origin,
      r.destination as route_destination,
      v.registration_plate as vehicle_plate,
      v.capacity as vehicle_capacity,
      t.passenger_count,
      t.current_passenger_count,
      vcs.latitude as lat,
      vcs.longitude as lng,
      vcs.speed_kph,
      vcs.heading,
      vcs.last_position_at,
      case
        when t.route_id is not null
             and vcs.latitude is not null
             and vcs.longitude is not null then
          public.remaining_distance_km(t.route_id, vcs.latitude, vcs.longitude)
        else null
      end as distance_remaining_km,
      case
        when t.route_id is not null
             and vcs.latitude is not null
             and vcs.longitude is not null
             and vcs.speed_kph is not null
             and vcs.speed_kph > 5 then
          round(
            (public.remaining_distance_km(t.route_id, vcs.latitude, vcs.longitude)
             / vcs.speed_kph * 60)::numeric,
            0
          )
        else null
      end as eta_minutes
    from trips t
    left join routes r on r.id = t.route_id
    left join vehicles v on v.id = t.vehicle_id
    left join vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
    where t.status = 'IN_PROGRESS'
      AND vcs.latitude is not null
      AND vcs.longitude is not null
      AND vcs.last_position_at is not null
      AND vcs.last_position_at > now() - interval '5 minutes'
    order by t.scheduled_departure desc
  `;

  const out: PublicTrip[] = [];
  const stopsCache = new Map<string, StopShape[]>();

  for (const t of trips) {
    if (hasSegmentFilter && t.route_id) {
      try {
        const check = await sql<
          { result: unknown }[]
        >`select public.is_segment_bookable(
          ${t.trip_id}::uuid,
          ${fromCoord!.lat}::numeric,
          ${fromCoord!.lng}::numeric,
          ${toCoord!.lat}::numeric,
          ${toCoord!.lng}::numeric
        ) as result`;

        const raw = check[0]?.result;
        const parsed =
          typeof raw === "string"
            ? JSON.parse(raw)
            : (raw as { bookable?: boolean; reason?: string } | null);

        if (!parsed || parsed.bookable !== true) {
          continue;
        }
      } catch (e) {
        console.error("[fetchActiveTrips] segment check error:", e);
        continue;
      }
    } else if (hasFromFilter && t.route_id) {
      try {
        const check = await sql<
          { result: unknown }[]
        >`select public.is_stop_on_route_ahead_of_bus(
          ${t.trip_id}::uuid,
          ${fromCoord!.lat}::numeric,
          ${fromCoord!.lng}::numeric
        ) as result`;

        const raw = check[0]?.result;
        const parsed =
          typeof raw === "string"
            ? JSON.parse(raw)
            : (raw as { passable?: boolean; reason?: string } | null);

        if (!parsed || parsed.passable !== true) {
          continue;
        }
      } catch (e) {
        console.error("[fetchActiveTrips] from-only check error:", e);
        continue;
      }
    }

    let stops: StopShape[] = [];
    if (t.route_id) {
      if (stopsCache.has(t.route_id)) {
        stops = stopsCache.get(t.route_id)!;
      } else {
        stops = await loadStopsForRoute(t.route_id);
        stopsCache.set(t.route_id, stops);
      }
    }

    const trip: PublicTrip = {
      trip_id: t.trip_id,
      trip_code: t.trip_code,
      route: t.route_id
        ? {
            route_id: t.route_id,
            name: t.route_name ?? "Unnamed route",
            origin: t.route_origin,
            destination: t.route_destination,
            stops,
          }
        : null,
      live: {
        latitude: t.lat,
        longitude: t.lng,
        speed_kph: t.speed_kph,
        heading: t.heading,
        last_position_at: t.last_position_at,
        distance_remaining_km:
          t.distance_remaining_km != null
            ? Number(t.distance_remaining_km)
            : null,
        eta_minutes: t.eta_minutes != null ? Number(t.eta_minutes) : null,
      },
      vehicle: {
        registration_plate: t.vehicle_plate ?? "—",
        capacity: t.vehicle_capacity,
        passenger_count: t.current_passenger_count ?? t.passenger_count ?? 0,
      },
      status: t.status,
    };

    if (hasSegmentFilter && t.route_id && stops.length > 0) {
      try {
        const fromStop = stops.reduce<StopShape | null>((best, s) => {
          if (s.lat == null || s.lng == null) return best;
          const d =
            Math.pow(s.lat - fromCoord!.lat, 2) +
            Math.pow(s.lng - fromCoord!.lng, 2);
          if (!best || best.lat == null) return s;
          const bd =
            Math.pow(best.lat - fromCoord!.lat, 2) +
            Math.pow((best.lng ?? 0) - fromCoord!.lng, 2);
          return d < bd ? s : best;
        }, null);

        const toStop = stops.reduce<StopShape | null>((best, s) => {
          if (s.lat == null || s.lng == null) return best;
          const d =
            Math.pow(s.lat - toCoord!.lat, 2) +
            Math.pow(s.lng - toCoord!.lng, 2);
          if (!best || best.lat == null) return s;
          const bd =
            Math.pow(best.lat - toCoord!.lat, 2) +
            Math.pow((best.lng ?? 0) - toCoord!.lng, 2);
          return d < bd ? s : best;
        }, null);

        if (fromStop && toStop && fromStop.stop_id !== toStop.stop_id) {
          const rows = await sql<
            { seats: number }[]
          >`select public.segment_available_seats(${t.trip_id}::uuid, ${fromStop.stop_id}::uuid, ${toStop.stop_id}::uuid) as seats`;
          const seats = rows[0]?.seats ?? 0;
          trip.segment_availability = {
            seats_available: seats,
            from_stop_id: fromStop.stop_id,
            to_stop_id: toStop.stop_id,
          };
        }
      } catch (e) {
        console.error("[fetchActiveTrips] segment seats error:", e);
      }
    }

    out.push(trip);
  }

  return out;
}

// ─── Server ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return err("Method not allowed", 405);
  }

  const url = new URL(req.url);
  let pathname = url.pathname
    .replace(/^\/functions\/v1\/passenger-api/, "")
    .replace(/^\/passenger-api/, "");
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  try {
    // ── GET /health ───────────────────────────────────────────────────
    if (pathname === "/health" || pathname === "/") {
      return ok({
        status: "B-ETA Passenger API active",
        version: "2.2.0",
      });
    }

    // ── GET /active-buses ─────────────────────────────────────────────
    if (pathname === "/active-buses") {
      const fromStr = url.searchParams.get("from") ?? undefined;
      const toStr = url.searchParams.get("to") ?? undefined;
      const fromLat = url.searchParams.get("fromLat");
      const fromLng = url.searchParams.get("fromLng");
      const toLat = url.searchParams.get("toLat");
      const toLng = url.searchParams.get("toLng");

      const buses = await fetchActiveTrips({
        from: fromStr,
        to: toStr,
        fromLat: fromLat != null ? Number(fromLat) : undefined,
        fromLng: fromLng != null ? Number(fromLng) : undefined,
        toLat: toLat != null ? Number(toLat) : undefined,
        toLng: toLng != null ? Number(toLng) : undefined,
      });
      return ok({ buses, count: buses.length });
    }

    // ── GET /buses/:trip_id ───────────────────────────────────────────
    const busMatch = pathname.match(/^\/buses\/([^/]+)$/);
    if (busMatch) {
      const tripId = busMatch[1];

      const rows = await sql<
        {
          trip_id: string;
          trip_code: string | null;
          status: string;
          route_id: string | null;
          vehicle_id: string | null;
          route_name: string | null;
          route_origin: string | null;
          route_destination: string | null;
          vehicle_plate: string | null;
          vehicle_capacity: number | null;
          passenger_count: number | null;
          current_passenger_count: number | null;
          lat: number | null;
          lng: number | null;
          speed_kph: number | null;
          heading: number | null;
          last_position_at: string | null;
          distance_remaining_km: number | null;
          eta_minutes: number | null;
        }[]
      >`
        select
          t.id as trip_id,
          t.trip_code,
          t.status,
          t.route_id,
          t.vehicle_id,
          r.name as route_name,
          r.origin as route_origin,
          r.destination as route_destination,
          v.registration_plate as vehicle_plate,
          v.capacity as vehicle_capacity,
          t.passenger_count,
          t.current_passenger_count,
          vcs.latitude as lat,
          vcs.longitude as lng,
          vcs.speed_kph,
          vcs.heading,
          vcs.last_position_at,
          case
            when t.route_id is not null
                 and vcs.latitude is not null
                 and vcs.longitude is not null then
              public.remaining_distance_km(t.route_id, vcs.latitude, vcs.longitude)
            else null
          end as distance_remaining_km,
          case
            when t.route_id is not null
                 and vcs.latitude is not null
                 and vcs.longitude is not null
                 and vcs.speed_kph is not null
                 and vcs.speed_kph > 5 then
              round(
                (public.remaining_distance_km(t.route_id, vcs.latitude, vcs.longitude)
                 / vcs.speed_kph * 60)::numeric,
                0
              )
            else null
          end as eta_minutes
        from trips t
        left join routes r on r.id = t.route_id
        left join vehicles v on v.id = t.vehicle_id
        left join vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
        where t.id = ${tripId}::uuid
          and t.status = 'IN_PROGRESS'
        limit 1
      `;

      if (rows.length === 0) {
        return err("Bus not found or not active", 404);
      }

      const t = rows[0];
      const stops = t.route_id ? await loadStopsForRoute(t.route_id) : [];

      const trip: PublicTrip = {
        trip_id: t.trip_id,
        trip_code: t.trip_code,
        route: t.route_id
          ? {
              route_id: t.route_id,
              name: t.route_name ?? "Unnamed route",
              origin: t.route_origin,
              destination: t.route_destination,
              stops,
            }
          : null,
        live: {
          latitude: t.lat,
          longitude: t.lng,
          speed_kph: t.speed_kph,
          heading: t.heading,
          last_position_at: t.last_position_at,
          distance_remaining_km:
            t.distance_remaining_km != null
              ? Number(t.distance_remaining_km)
              : null,
          eta_minutes: t.eta_minutes != null ? Number(t.eta_minutes) : null,
        },
        vehicle: {
          registration_plate: t.vehicle_plate ?? "—",
          capacity: t.vehicle_capacity,
          passenger_count: t.current_passenger_count ?? t.passenger_count ?? 0,
        },
        status: t.status,
      };

      return ok(trip);
    }

    // ── GET /routes-with-polylines ────────────────────────────────────
    if (pathname === "/routes-with-polylines") {
      const rows = await sql<
        {
          route_id: string;
          name: string;
          origin: string | null;
          destination: string | null;
          polyline: string | null;
        }[]
      >`
        select
          id as route_id,
          name,
          origin,
          destination,
          polyline
        from routes
        where is_active = true
          and polyline is not null
        order by name asc
      `;

      const result: PublicRoute[] = rows.map((r) => {
        let parsed: [number, number][] | null = null;
        try {
          if (r.polyline) {
            parsed = JSON.parse(r.polyline) as [number, number][];
          }
        } catch {
          parsed = null;
        }
        return {
          route_id: r.route_id,
          name: r.name,
          origin: r.origin,
          destination: r.destination,
          polyline: parsed,
        };
      });

      return ok({ routes: result, count: result.length });
    }

    // ── GET /routes ───────────────────────────────────────────────────
    if (pathname === "/routes") {
      const rows = await sql<
        {
          id: string;
          name: string;
          origin: string | null;
          destination: string | null;
          distance_km: number | null;
          estimated_duration_min: number | null;
        }[]
      >`
        select id, name, origin, destination, distance_km, estimated_duration_min
        from routes
        where is_active = true
        order by name asc
      `;
      return ok(rows);
    }

    // ── GET /geocode?q=Nata,Botswana ──────────────────────────────────
    if (pathname === "/geocode") {
      const q = url.searchParams.get("q");
      if (!q || q.trim().length < 2) {
        return err("Missing or too-short query parameter: q");
      }

      const apiKey = Deno.env.get("OPENCAGE_API_KEY");
      if (!apiKey) {
        return err("Geocoding not configured", 500);
      }

      try {
        const geocodeUrl = new URL(
          "https://api.opencagedata.com/geocode/v1/json"
        );
        geocodeUrl.searchParams.set("q", q.trim());
        geocodeUrl.searchParams.set("key", apiKey);
        geocodeUrl.searchParams.set("language", "en");
        geocodeUrl.searchParams.set("no_annotations", "1");
        geocodeUrl.searchParams.set("limit", "1");
        geocodeUrl.searchParams.set("countrycode", "bw");

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(geocodeUrl.toString(), {
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(t);

        if (!res.ok) {
          return err(`OpenCage ${res.status}`, 502);
        }

        const json = (await res.json()) as {
          results?: Array<{
            geometry?: { lat: number; lng: number };
            formatted?: string;
            components?: Record<string, string>;
          }>;
        };

        const first = json.results?.[0];
        if (!first?.geometry) {
          return ok({ found: false, query: q });
        }

        const c = first.components ?? {};
        const displayName =
          [c.city ?? c.town ?? c.village ?? c.county ?? c.state, c.country]
            .filter(Boolean)
            .join(", ") ||
          first.formatted ||
          q;

        return ok({
          found: true,
          query: q,
          lat: first.geometry.lat,
          lng: first.geometry.lng,
          display_name: displayName,
          components: c,
        });
      } catch (e: any) {
        return err(e?.message ?? "Geocode failed", 500);
      }
    }

    // ── GET /locations/search?q=Mosetse ───────────────────────────────
    // Mixed search: local stops first, then OpenCage forward geocode.
    // Cached in-memory for 24h per normalized query.
    if (pathname === "/locations/search") {
      const q = url.searchParams.get("q");
      if (!q || q.trim().length < 2) {
        return err("Missing or too-short query parameter: q");
      }

      const norm = q.trim().toLowerCase();

      const cached = locationSearchCache.get(norm);
      const now = Date.now();
      if (cached && cached.data && now - cached.ts < 24 * 60 * 60 * 1000) {
        return ok(cached.data);
      }

      try {
        // 1. Local stop lookup
        const stopRows = await sql<
          {
            id: string;
            name: string;
            reverse_geocoded_name: string | null;
            city: string | null;
            lat: number | null;
            lng: number | null;
          }[]
        >`
          select id, name, reverse_geocoded_name, city, lat, lng
          from public.stops
          where lat is not null
            and lng is not null
            and (
              lower(name) like ${"%" + norm + "%"}
              or lower(reverse_geocoded_name) like ${"%" + norm + "%"}
              or lower(city) like ${"%" + norm + "%"}
            )
          order by
            case when lower(name) = ${norm} then 0
                 when lower(name) like ${norm + "%"} then 1
                 else 2 end,
            name asc
          limit 8
        `;

        const stopResults = stopRows.map((r) => ({
          name: r.name,
          region: r.city ?? null,
          lat: r.lat,
          lng: r.lng,
          source: "stop_lookup" as const,
        }));

        // 2. OpenCage fallback
        let geocodeResults: Array<{
          name: string;
          region: string | null;
          lat: number;
          lng: number;
          source: "forward_geocode";
        }> = [];

        if (stopResults.length < 3) {
          const apiKey = Deno.env.get("OPENCAGE_API_KEY");
          if (apiKey) {
            try {
              const gurl = new URL(
                "https://api.opencagedata.com/geocode/v1/json"
              );
              gurl.searchParams.set("q", `${q}, Botswana`);
              gurl.searchParams.set("key", apiKey);
              gurl.searchParams.set("language", "en");
              gurl.searchParams.set("no_annotations", "1");
              gurl.searchParams.set("limit", "5");
              gurl.searchParams.set("countrycode", "bw");

              const controller = new AbortController();
              const t = setTimeout(() => controller.abort(), 4000);

              const res = await fetch(gurl.toString(), {
                signal: controller.signal,
                cache: "no-store",
              });
              clearTimeout(t);

              if (res.ok) {
                const json = (await res.json()) as {
                  results?: Array<{
                    geometry?: { lat: number; lng: number };
                    formatted?: string;
                    components?: Record<string, string>;
                  }>;
                };

                geocodeResults = (json.results ?? [])
                  .filter((r) => r.geometry)
                  .map((r) => {
                    const c = r.components ?? {};
                    const primary =
                      c.village ??
                      c.town ??
                      c.city ??
                      c.suburb ??
                      c.county ??
                      r.formatted?.split(",")[0]?.trim() ??
                      q;
                    const region = c.county ?? c.state ?? null;
                    return {
                      name: primary,
                      region,
                      lat: r.geometry!.lat,
                      lng: r.geometry!.lng,
                      source: "forward_geocode" as const,
                    };
                  })
                  .filter(
                    (r, i, arr) =>
                      arr.findIndex(
                        (x) => x.name.toLowerCase() === r.name.toLowerCase()
                      ) === i
                  );
              }
            } catch {
              // non-fatal
            }
          }
        }

        // Merge + dedupe by lowercase name, prefer local stops
        const seen = new Set<string>();
        const merged = [...stopResults, ...geocodeResults].filter((loc) => {
          const key = loc.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const payload = { locations: merged, count: merged.length };
        locationSearchCache.set(norm, { data: payload, ts: now });

        return ok(payload);
      } catch (e: any) {
        return err(e?.message ?? "Search failed", 500);
      }
    }

    // ── GET /stops ────────────────────────────────────────────────────
    if (pathname === "/stops") {
      const rows = await sql<
        {
          id: string;
          name: string;
          city: string | null;
          lat: number | null;
          lng: number | null;
        }[]
      >`
        select id, name, city, lat, lng
        from stops
        where is_public = true
          and lat is not null
          and lng is not null
        order by name asc
      `;
      const result: PublicStopFull[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        lat: r.lat as number,
        lng: r.lng as number,
      }));
      return ok({ stops: result, count: result.length });
    }

    return err("Not found", 404);
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error: e?.message ?? "Internal Server Error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});