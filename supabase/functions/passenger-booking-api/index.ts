// B-ETA Passenger Booking API — v1.0
// Public-facing passenger booking endpoints. No auth required.
//
// Endpoints:
//   POST /booking/request   — request a seat
//   POST /booking/cancel    — cancel a booking
//   GET  /booking/status    — get booking details by reference
//   POST /booking/recover   — find bookings by phone + reference
//   GET  /health            — health check

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://esm.sh/postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";

const sql = postgres(SUPABASE_DB_URL, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ success: false, error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseJsonBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleHealth(): Promise<Response> {
  return ok({
    status: "B-ETA Passenger Booking API active",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}

async function handleRequest(body: any): Promise<Response> {
  const required = ["trip_id", "from_stop_id", "to_stop_id"];
  for (const field of required) {
    if (!body[field]) return err(`Missing required field: ${field}`);
  }

  if (!body.anonymous_id && !body.user_id) {
    return err("Either anonymous_id or user_id is required");
  }

  const seats = Number(body.requested_seats ?? 1);
  if (!Number.isInteger(seats) || seats < 1 || seats > 10) {
    return err("requested_seats must be an integer between 1 and 10");
  }

  try {
    const rows = await sql`
      select public.request_booking(
        ${body.trip_id}::uuid,
        ${body.from_stop_id}::uuid,
        ${body.to_stop_id}::uuid,
        ${seats}::integer,
        ${body.user_id ?? null}::uuid,
        ${body.anonymous_id ?? null}::text,
        ${body.passenger_name ?? null}::text,
        ${body.passenger_phone ?? null}::text,
        ${body.preferred_seat ?? null}::integer
      ) as result
    `;

    const result = rows[0]?.result;
    if (!result) return err("No result from request_booking", 500);

    if (!result.success) {
      return err(result.error ?? "Booking request failed", 400, result);
    }

    return ok(result, 201);
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleCancel(body: any): Promise<Response> {
  if (!body.handoff_id) return err("Missing required field: handoff_id");

  if (!body.anonymous_id && !body.user_id) {
    return err("Either anonymous_id or user_id is required");
  }

  try {
    const rows = await sql`
      select public.cancel_booking(
        ${body.handoff_id}::uuid,
        ${body.user_id ?? null}::uuid,
        ${body.anonymous_id ?? null}::text
      ) as result
    `;

    const result = rows[0]?.result;
    if (!result) return err("No result from cancel_booking", 500);

    if (!result.success) {
      return err(result.error ?? "Cancel failed", 400, result);
    }

    return ok(result, 200);
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleStatus(url: URL): Promise<Response> {
  const reference = url.searchParams.get("reference");
  if (!reference) return err("Missing query parameter: reference");

  try {
    const rows = await sql`
      select
        h.id as handoff_id,
        h.booking_reference,
        h.status as handoff_status,
        h.booking_pin,
        h.passenger_name,
        h.passenger_phone,
        h.requested_seats,
        h.from_stop_id,
        h.to_stop_id,
        h.created_at,
        h.expires_at,
        h.accepted_at,
        h.picked_up_at,
        p.id as pickup_id,
        p.status as pickup_status,
        p.driver_id,
        t.trip_code,
        t.status as trip_status,
        r.name as route_name,
        r.origin as route_origin,
        r.destination as route_destination
      from booking_handoffs h
      left join pickup_notifications p on p.handoff_id = h.id
      left join trips t on t.id = h.trip_id
      left join routes r on r.id = t.route_id
      where h.booking_reference = ${reference}
      limit 1
    `;

    if (rows.length === 0) return err("Booking not found", 404);

    return ok({ success: true, booking: rows[0] });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleRecover(body: any): Promise<Response> {
  if (!body.passenger_phone) {
    return err("Missing required field: passenger_phone");
  }

  try {
    const rows = await sql`
      select
        h.id as handoff_id,
        h.booking_reference,
        h.status as handoff_status,
        h.booking_pin,
        h.passenger_name,
        h.passenger_phone,
        h.requested_seats,
        h.from_stop_id,
        h.to_stop_id,
        h.created_at,
        h.expires_at,
        t.trip_code,
        r.origin as route_origin,
        r.destination as route_destination
      from booking_handoffs h
      left join trips t on t.id = h.trip_id
      left join routes r on r.id = t.route_id
      where h.passenger_phone = ${body.passenger_phone}
      order by h.created_at desc
      limit 10
    `;

    return ok({ success: true, bookings: rows, count: rows.length });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

// ─── Server ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let pathname = url.pathname
    .replace(/^\/functions\/v1\/passenger-booking-api/, "")
    .replace(/^\/passenger-booking-api/, "");
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  try {
    // Health check
    if (pathname === "/health" || pathname === "/") {
      return await handleHealth();
    }

    // POST /booking/request
    if (pathname === "/booking/request" && req.method === "POST") {
      const body = await parseJsonBody(req);
      if (!body) return err("Invalid JSON body");
      return await handleRequest(body);
    }

    // POST /booking/cancel
    if (pathname === "/booking/cancel" && req.method === "POST") {
      const body = await parseJsonBody(req);
      if (!body) return err("Invalid JSON body");
      return await handleCancel(body);
    }

    // GET /booking/status?reference=...
    if (pathname === "/booking/status" && req.method === "GET") {
      return await handleStatus(url);
    }

    // POST /booking/recover
    if (pathname === "/booking/recover" && req.method === "POST") {
      const body = await parseJsonBody(req);
      if (!body) return err("Invalid JSON body");
      return await handleRecover(body);
    }

    // Fallback
    return err("Not found", 404);
  } catch (e: any) {
    return err(e?.message ?? "Internal Server Error", 500);
  }
});