// B-ETA Driver Booking API — v1.1.0
// Uses djwt library for JWT — replaces custom HMAC to fix verification bug.
//
// Endpoints:
//   POST /auth/login              — phone + PIN → JWT
//   GET  /auth/me                 — verify JWT, return driver info
//   GET  /pickups                 — list pending pickups for this driver
//   GET  /pickups/:id             — pickup detail
//   POST /pickups/:id/accept      — accept → generates PIN
//   POST /pickups/:id/decline     — decline
//   POST /pickups/:id/verify-pin  — verify PIN, complete boarding
//   POST /seat-marks              — mark seat will free at stop
//   GET  /seat-marks/:tripId      — list active seat marks
//   DELETE /seat-marks/:id        — clear a seat mark
//   GET  /health                  — health check

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://esm.sh/postgres@3.4.4";
import { create, verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// ─── Config ─────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";

const sql = postgres(SUPABASE_DB_URL, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
});

// ─── JWT (djwt) ─────────────────────────────────────────────────────────────

let cachedJwtKey: CryptoKey | null = null;
let cachedSecretAt = 0;
const SECRET_TTL_MS = 5 * 60 * 1000;

async function getJwtKey(): Promise<CryptoKey> {
  const now = Date.now();
  if (cachedJwtKey && now - cachedSecretAt < SECRET_TTL_MS) {
    return cachedJwtKey;
  }

  const rows = await sql<{ value: string }[]>`
    select value from public.system_config where key = 'driver_jwt_secret' limit 1
  `;
  if (!rows[0]?.value) {
    throw new Error("driver_jwt_secret not found in system_config");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rows[0].value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  cachedJwtKey = key;
  cachedSecretAt = now;
  return key;
}

async function signJwt(
  payload: Record<string, unknown>,
  ttlSeconds = 86400
): Promise<string> {
  const key = await getJwtKey();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  return await create({ alg: "HS256", typ: "JWT" }, fullPayload, key);
}

async function verifyJwt(
  token: string
): Promise<Record<string, unknown> | null> {
  try {
    const key = await getJwtKey();
    const payload = await verify(token, key);
    return payload as Record<string, unknown>;
  } catch (e) {
    console.log("[verifyJwt] failed:", String(e));
    return null;
  }
}

// ─── Auth helper ────────────────────────────────────────────────────────────

async function authenticate(req: Request): Promise<{
  driver_id: string;
  driver_name: string;
  operator_id: string;
} | null> {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const payload = await verifyJwt(match[1]);
  if (!payload || typeof payload.driver_id !== "string") return null;

  return {
    driver_id: payload.driver_id as string,
    driver_name: (payload.driver_name as string) ?? "",
    operator_id: (payload.operator_id as string) ?? "",
  };
}

// ─── Response helpers ───────────────────────────────────────────────────────

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {}
) {
  return new Response(
    JSON.stringify({ success: false, error: message, ...extra }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function parseJsonBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function normalizePhone(raw: string): string {
  const digits = raw
    .replace(/^\+?267/, "")
    .replace(/\D/g, "")
    .replace(/^0/, "");
  return `+267${digits}`;
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function handleHealth(): Promise<Response> {
  return ok({
    status: "B-ETA Driver Booking API active",
    version: "1.1.0",
    timestamp: new Date().toISOString(),
  });
}

async function handleLogin(req: Request): Promise<Response> {
  const body = await parseJsonBody(req);
  if (!body) return err("Invalid JSON body");
  if (!body.phone) return err("Missing required field: phone");
  if (!body.pin) return err("Missing required field: pin");

  const phone = normalizePhone(body.phone);
  const pin = String(body.pin).trim();

  try {
    const rows = await sql<
      {
        id: string;
        full_name: string;
        phone: string;
        pin_hash: string;
        operator_id: string | null;
        status: string;
      }[]
    >`
      select id, full_name, phone, pin_hash, operator_id, status
      from public.drivers
      where phone = ${phone}
      limit 1
    `;

    if (rows.length === 0) return err("Phone number not registered", 401);

    const driver = rows[0];
    if (driver.status !== "active")
      return err("Driver account is not active", 403);

    if (driver.pin_hash !== pin) return err("Incorrect PIN", 401);

    const token = await signJwt(
      {
        driver_id: driver.id,
        driver_name: driver.full_name,
        operator_id: driver.operator_id ?? "",
      },
      86400
    );

    return ok({
      success: true,
      token,
      expires_in: 86400,
      driver: {
        id: driver.id,
        full_name: driver.full_name,
        phone: driver.phone,
      },
    });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleMe(
  req: Request,
  auth: { driver_id: string }
): Promise<Response> {
  try {
    const rows = await sql`
      select id, full_name, phone, status, assigned_vehicle_id
      from public.drivers
      where id = ${auth.driver_id}::uuid
      limit 1
    `;
    if (rows.length === 0) return err("Driver not found", 404);
    return ok({ success: true, driver: rows[0] });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handlePickupsList(auth: {
  driver_id: string;
}): Promise<Response> {
  try {
    const rows = await sql`
      select
        p.id as pickup_id,
        p.status,
        p.passenger_count,
        p.booking_reference,
        p.passenger_name,
        p.passenger_phone,
        p.seat_number,
        p.booking_pin,
        p.pin_attempts,
        p.expires_at,
        p.created_at,
        p.from_stop_id,
        p.to_stop_id,
        fs.name as from_stop_name,
        ts.name as to_stop_name,
        p.trip_id,
        t.trip_code,
        t.status as trip_status,
        t.current_stop_id,
        v.registration_plate,
        r.name as route_name,
        r.origin as route_origin,
        r.destination as route_destination
      from pickup_notifications p
      left join trips t on t.id = p.trip_id
      left join vehicles v on v.id = p.vehicle_id
      left join routes r on r.id = t.route_id
      left join stops fs on fs.id = p.from_stop_id
      left join stops ts on ts.id = p.to_stop_id
      where p.driver_id = ${auth.driver_id}::uuid
        and p.status in ('PENDING', 'ACKNOWLEDGED')
        and p.expires_at > now() - interval '5 minutes'
      order by p.expires_at asc, p.created_at asc
      limit 50
    `;
    return ok({ success: true, pickups: rows, count: rows.length });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handlePickupDetail(
  pickupId: string,
  auth: { driver_id: string }
): Promise<Response> {
  try {
    const rows = await sql`
      select
        p.*,
        fs.name as from_stop_name,
        ts.name as to_stop_name,
        t.trip_code,
        v.registration_plate
      from pickup_notifications p
      left join stops fs on fs.id = p.from_stop_id
      left join stops ts on ts.id = p.to_stop_id
      left join trips t on t.id = p.trip_id
      left join vehicles v on v.id = p.vehicle_id
      where p.id = ${pickupId}::uuid
        and p.driver_id = ${auth.driver_id}::uuid
      limit 1
    `;
    if (rows.length === 0) return err("Pickup not found", 404);
    return ok({ success: true, pickup: rows[0] });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handlePickupAccept(
  pickupId: string,
  auth: { driver_id: string }
): Promise<Response> {
  try {
    const rows = await sql`
      select public.driver_accept_pickup(
        ${pickupId}::uuid,
        ${auth.driver_id}::uuid
      ) as result
    `;
    const result = rows[0]?.result;
    if (!result) return err("No result from driver_accept_pickup", 500);
    if (!result.success)
      return err(result.error ?? "Accept failed", 400, result);
    return ok(result);
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handlePickupDecline(
  pickupId: string,
  body: any,
  auth: { driver_id: string }
): Promise<Response> {
  try {
    const reason = body?.reason ?? null;
    const rows = await sql`
      select public.driver_decline_pickup(
        ${pickupId}::uuid,
        ${auth.driver_id}::uuid,
        ${reason}::text
      ) as result
    `;
    const result = rows[0]?.result;
    if (!result) return err("No result from driver_decline_pickup", 500);
    if (!result.success)
      return err(result.error ?? "Decline failed", 400, result);
    return ok(result);
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handlePickupVerifyPin(
  pickupId: string,
  body: any,
  auth: { driver_id: string }
): Promise<Response> {
  if (!body?.pin) return err("Missing required field: pin");

  try {
    const rows = await sql`
      select public.driver_verify_pin(
        ${pickupId}::uuid,
        ${auth.driver_id}::uuid,
        ${String(body.pin)}::text,
        ${body?.seat_number ?? null}::integer
      ) as result
    `;
    const result = rows[0]?.result;
    if (!result) return err("No result from driver_verify_pin", 500);
    if (!result.success)
      return err(result.error ?? "PIN verification failed", 400, result);
    return ok(result);
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleSeatMarksCreate(
  body: any,
  auth: { driver_id: string }
): Promise<Response> {
  const required = ["trip_id", "vehicle_seat_id", "stop_id"];
  for (const f of required) {
    if (!body?.[f]) return err(`Missing required field: ${f}`);
  }

  try {
    const rows = await sql`
      select public.mark_seat_will_free(
        ${body.trip_id}::uuid,
        ${body.vehicle_seat_id}::uuid,
        ${body.stop_id}::uuid,
        ${auth.driver_id}::uuid
      ) as result
    `;
    const result = rows[0]?.result;
    if (!result) return err("No result from mark_seat_will_free", 500);
    if (!result.success)
      return err(result.error ?? "Mark failed", 400, result);
    return ok(result, 201);
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleSeatMarksList(tripId: string): Promise<Response> {
  try {
    const rows = await sql`
      select * from public.get_active_seat_marks(${tripId}::uuid)
    `;
    return ok({ success: true, marks: rows, count: rows.length });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleSeatMarksDelete(
  markId: string,
  auth: { driver_id: string }
): Promise<Response> {
  try {
    const rows = await sql`
      select public.clear_seat_mark(
        ${markId}::uuid,
        ${auth.driver_id}::uuid,
        'driver_cleared'
      ) as result
    `;
    const result = rows[0]?.result;
    if (!result) return err("No result from clear_seat_mark", 500);
    if (!result.success)
      return err(result.error ?? "Clear failed", 400, result);
    return ok(result);
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
    .replace(/^\/functions\/v1\/driver-booking-api/, "")
    .replace(/^\/driver-booking-api/, "");
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  try {
    if (pathname === "/health" || pathname === "/") {
      return await handleHealth();
    }

    if (pathname === "/auth/login" && req.method === "POST") {
      return await handleLogin(req);
    }

    const auth = await authenticate(req);
    if (!auth) {
      return err("Unauthorized — missing or invalid token", 401);
    }

    if (pathname === "/auth/me" && req.method === "GET") {
      return await handleMe(req, auth);
    }

    if (pathname === "/pickups" && req.method === "GET") {
      return await handlePickupsList(auth);
    }

    const pickupMatch = pathname.match(/^\/pickups\/([^/]+)$/);
    if (pickupMatch && req.method === "GET") {
      return await handlePickupDetail(pickupMatch[1], auth);
    }

    const acceptMatch = pathname.match(/^\/pickups\/([^/]+)\/accept$/);
    if (acceptMatch && req.method === "POST") {
      return await handlePickupAccept(acceptMatch[1], auth);
    }

    const declineMatch = pathname.match(/^\/pickups\/([^/]+)\/decline$/);
    if (declineMatch && req.method === "POST") {
      const body = await parseJsonBody(req);
      return await handlePickupDecline(declineMatch[1], body, auth);
    }

    const verifyMatch = pathname.match(/^\/pickups\/([^/]+)\/verify-pin$/);
    if (verifyMatch && req.method === "POST") {
      const body = await parseJsonBody(req);
      return await handlePickupVerifyPin(verifyMatch[1], body, auth);
    }

    if (pathname === "/seat-marks" && req.method === "POST") {
      const body = await parseJsonBody(req);
      return await handleSeatMarksCreate(body, auth);
    }

    const marksListMatch = pathname.match(/^\/seat-marks\/([^/]+)$/);
    if (marksListMatch && req.method === "GET") {
      return await handleSeatMarksList(marksListMatch[1]);
    }

    if (marksListMatch && req.method === "DELETE") {
      return await handleSeatMarksDelete(marksListMatch[1], auth);
    }

    return err("Not found", 404);
  } catch (e: any) {
    return err(e?.message ?? "Internal Server Error", 500);
  }
});