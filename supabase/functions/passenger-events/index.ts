// ============================================================================
// passenger-events — Supabase Edge Function (v1.0.1: server errors are reported to Sentry when the secret SENTRY_DSN is set)
//
// Receives discrete passenger events from the passenger portal, validates
// them, and inserts into public.passenger_events via the ct_log_passenger_event
// RPC (which runs with service-role privileges).
//
// Publicly callable — no anon key required, matching the pattern used by
// passenger-api. Rate limited implicitly by Supabase's Edge Function
// concurrency, and further protected by strict input validation and by
// capping string lengths on the SQL side.
//
// POST body:
//   {
//     "event_type":   "search_submitted",
//     "anonymous_id": "anon-abc123",   // optional
//     "session_id":   "sess-xyz789",   // optional
//     "device":       { ... },         // optional
//     "payload":      { ... }          // optional, event-specific
//   }
//
// Response:
//   { "success": true, "id": "uuid" }
//   { "success": false, "error": "..." }
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_EVENT_TYPES = new Set([
  "search_submitted",
  "location_selected",
  "bus_viewed",
  "booking_started",
  "booking_submitted",
  "booking_confirmed",
  "booking_abandoned",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age":       "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ============================================================
// Error reporting to Sentry (no SDK; one small HTTPS call per server error).
// Set the secret SENTRY_DSN to switch it on. Phone numbers and e-mail
// addresses are removed from the text before it leaves the function.
// ============================================================
const SENTRY_DSN = Deno.env.get("SENTRY_DSN") ?? "";
const SENTRY_ENV = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";
const FN_NAME = "passenger-events";
const FN_VERSION = "1.0.1";
let sentryWindowStart = 0;
let sentrySent = 0;

function scrubForSentry(s: string): string {
  return s
    .replace(/\+\d[\d\s\-()]{7,}\d/g, "[redacted-phone]")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[redacted-email]");
}

function reportToSentry(
  message: string,
  error?: unknown,
  tags: Record<string, string> = {}
): void {
  if (!SENTRY_DSN) return;
  try {
    // at most 20 reports per minute per running copy, so an outage cannot flood Sentry
    const now = Date.now();
    if (now - sentryWindowStart > 60_000) {
      sentryWindowStart = now;
      sentrySent = 0;
    }
    if (sentrySent >= 20) return;
    sentrySent++;

    const dsn = new URL(SENTRY_DSN);
    const project = dsn.pathname.replace(/^\//, "");
    const endpoint =
      `${dsn.protocol}//${dsn.host}/api/${project}/store/?sentry_key=${dsn.username}&sentry_version=7`;
    const e = error as any;
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString(),
      platform: "javascript",
      level: "error",
      logger: FN_NAME,
      server_name: FN_NAME,
      environment: SENTRY_ENV,
      release: `${FN_NAME}@${FN_VERSION}`,
      message: scrubForSentry(String(message ?? "Server error")).slice(0, 1000),
      tags: { function: FN_NAME, ...tags },
      extra: e?.stack ? { stack: scrubForSentry(String(e.stack)).slice(0, 4000) } : undefined,
    };
    const p = fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => {});
    (globalThis as any).EdgeRuntime?.waitUntil?.(p);
  } catch {
    // reporting must never break a request
  }
}

/** Cap strings so a malicious client can't insert huge payloads. */
function trimString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

/** Keep payloads reasonable. Reject non-objects and cap total keys. */
function sanitizePayload(v: unknown): Record<string, unknown> {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return {};
  const entries = Object.entries(v as Record<string, unknown>).slice(0, 30);
  const out: Record<string, unknown> = {};
  for (const [k, val] of entries) {
    const key = String(k).slice(0, 64);
    // Only allow primitive values and small arrays of primitives.
    if (val == null || typeof val === "number" || typeof val === "boolean") {
      out[key] = val;
    } else if (typeof val === "string") {
      out[key] = val.slice(0, 512);
    } else if (Array.isArray(val)) {
      out[key] = val
        .slice(0, 20)
        .filter((x) => x == null || typeof x === "number" || typeof x === "boolean" || typeof x === "string")
        .map((x) => (typeof x === "string" ? x.slice(0, 256) : x));
    }
    // Drop nested objects — keeps the payload flat and queryable.
  }
  return out;
}

/** Device object — same principle, flat and small. */
function sanitizeDevice(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>).slice(0, 12);
  const out: Record<string, unknown> = {};
  for (const [k, val] of entries) {
    const key = String(k).slice(0, 32);
    if (val == null || typeof val === "number" || typeof val === "boolean") {
      out[key] = val;
    } else if (typeof val === "string") {
      out[key] = val.slice(0, 256);
    } else if (Array.isArray(val)) {
      out[key] = val
        .slice(0, 4)
        .filter((x) => typeof x === "number" || typeof x === "string")
        .map((x) => (typeof x === "string" ? x.slice(0, 64) : x));
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const eventType = trimString((body as Record<string, unknown>).event_type, 64);
    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
      return jsonResponse(
        { success: false, error: `Unknown or missing event_type: ${eventType ?? "null"}` },
        400
      );
    }

    const anonymousId = trimString((body as Record<string, unknown>).anonymous_id, 128);
    const sessionId   = trimString((body as Record<string, unknown>).session_id, 128);
    const device      = sanitizeDevice((body as Record<string, unknown>).device);
    const payload     = sanitizePayload((body as Record<string, unknown>).payload);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.rpc("ct_log_passenger_event", {
      p_event_type:   eventType,
      p_anonymous_id: anonymousId,
      p_session_id:   sessionId,
      p_device:       device,
      p_payload:      payload,
    });

    if (error) {
      reportToSentry(error.message, undefined, { rpc: "ct_log_passenger_event" });
      return jsonResponse({ success: false, error: error.message }, 500);
    }

    return jsonResponse(data ?? { success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    reportToSentry(msg, e);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});