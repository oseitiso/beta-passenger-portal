// B-ETA Passenger API Edge Function — v1.0
// Deploy to: hzmpncdygkeqvoszunfm
// Public-facing API for the passenger portal. Returns ONLY public bus data.
// No auth required — passengers see live bus positions.
//
// NEVER return: driver_id, driver_name, driver_phone, operator_id,
// individual passenger identities, booking history, operator notes,
// internal GPS metadata.

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

// ─── Types ─────────────────────────────────────────────────────────────────

interface StopShape {
  stop_id: string;
  name: string;
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

// ─── Helpers ───────────────────────────────────────────────────────────────

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
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    order: r.stop_order,
    distance_from_origin_km: r.distance_from_origin_km,
  }));
}

// Build the "active buses" query result with optional segment filtering.
async function fetchActiveTrips(opts: {
  fromStopId?: string;
  toStopId?: string;
}): Promise<PublicTrip[]> {
  // Base: all IN_PROGRESS trips with their vehicle state + vehicle + route
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
      vcs.last_position_at
    from trips t
    left join routes r on r.id = t.route_id
    left join vehicles v on v.id = t.vehicle_id
    left join vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
    where t.status = 'IN_PROGRESS'
    order by t.scheduled_departure desc
  `;

  // Build the projection
  const out: PublicTrip[] = [];

  // Cache stops per route to avoid N+1 lookups
  const stopsCache = new Map<string, StopShape[]>();

  for (const t of trips) {
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
      },
      vehicle: {
        registration_plate: t.vehicle_plate ?? "—",
        capacity: t.vehicle_capacity,
        passenger_count:
          t.current_passenger_count ?? t.passenger_count ?? 0,
      },
      status: t.status,
    };

    // Optional: segment availability if from/to provided
    if (opts.fromStopId && opts.toStopId) {
      try {
        const rows = await sql<
          { seats: number }[]
        >`select segment_available_seats(${t.trip_id}::uuid, ${opts.fromStopId}::uuid, ${opts.toStopId}::uuid) as seats`;
        const seats = rows[0]?.seats ?? 0;
        trip.segment_availability = {
          seats_available: seats,
          from_stop_id: opts.fromStopId,
          to_stop_id: opts.toStopId,
        };
      } catch {
        // If RPC fails, leave segment_availability undefined
      }
    }

    out.push(trip);
  }

  // If segment filter provided, drop trips without availability
  if (opts.fromStopId && opts.toStopId) {
    return out.filter(
      (t) => (t.segment_availability?.seats_available ?? 0) > 0
    );
  }

  return out;
}

// ─── Server ────────────────────────────────────────────────────────────────

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
    // ── GET /health ──────────────────────────────────────────────────────
    if (pathname === "/health" || pathname === "/") {
      return ok({
        status: "B-ETA Passenger API active",
        version: "1.0.0",
      });
    }

    // ── GET /active-buses ────────────────────────────────────────────────
    if (pathname === "/active-buses") {
      const fromStopId = url.searchParams.get("from") ?? undefined;
      const toStopId = url.searchParams.get("to") ?? undefined;

      const buses = await fetchActiveTrips({ fromStopId, toStopId });
      return ok({ buses, count: buses.length });
    }

    // ── GET /buses/:trip_id ──────────────────────────────────────────────
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
          vcs.last_position_at
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
        },
        vehicle: {
          registration_plate: t.vehicle_plate ?? "—",
          capacity: t.vehicle_capacity,
          passenger_count:
            t.current_passenger_count ?? t.passenger_count ?? 0,
        },
        status: t.status,
      };

      return ok(trip);
    }

    // ── GET /routes ──────────────────────────────────────────────────────
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

    // ── GET /stops ───────────────────────────────────────────────────────
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
        order by name asc
      `;
      return ok(rows);
    }

    // ── Fallback ─────────────────────────────────────────────────────────
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