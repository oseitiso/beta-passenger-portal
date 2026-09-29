// Client for the passenger-events Edge Function.
// Fire-and-forget: logEvent never throws, never blocks, never returns a promise
// the caller has to await. If logging fails for any reason, the passenger
// experience is unaffected.
//
// Usage:
//   import { logEvent } from "@/lib/events";
//   logEvent("search_submitted", { query: "Gaborone", result_count: 3 });
//
// Identity:
//   anonymous_id — persistent across visits, already used elsewhere
//                  in the passenger portal (localStorage: b-eta-anonymous-id).
//   session_id   — new, rotates per tab. Stored in sessionStorage so
//                  closing the tab ends the session and opening a new one
//                  starts fresh.
//
// Privacy: never pass passenger name, phone, or email into the payload.
// The events table is PII-free by design; identity linking happens via
// anonymous_id when a join is needed.

const EVENTS_BASE =
  process.env.NEXT_PUBLIC_PASSENGER_EVENTS_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/passenger-events";

const ANON_ID_KEY    = "b-eta-anonymous-id";
const SESSION_ID_KEY = "b-eta-session-id";

export type PassengerEventType =
  | "search_submitted"
  | "location_selected"
  | "bus_viewed"
  | "booking_started"
  | "booking_submitted"
  | "booking_confirmed"
  | "booking_abandoned";

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

function getAnonymousId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = "anon-" + randomId(16);
      window.localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = "sess-" + randomId(16);
      window.sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function randomId(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const arr = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Device snapshot — captured once per page load and reused for every event
// in the tab. Cheap, and avoids filling the events table with redundant rows.
// ---------------------------------------------------------------------------

interface DeviceSnapshot {
  platform: string;
  viewport: [number, number];
  lang: string;
  ua: string;
}

let cachedDevice: DeviceSnapshot | null = null;

function getDevice(): DeviceSnapshot | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }
  if (cachedDevice) return cachedDevice;

  const ua = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  const platform = detectPlatform(ua);
  const vw = typeof window.innerWidth === "number" ? window.innerWidth : 0;
  const vh = typeof window.innerHeight === "number" ? window.innerHeight : 0;

  cachedDevice = {
    platform,
    viewport: [vw, vh],
    lang: typeof navigator.language === "string" ? navigator.language : "unknown",
    ua: ua.slice(0, 200),
  };
  return cachedDevice;
}

function detectPlatform(ua: string): string {
  if (!ua) return "unknown";
  if (/iPad|Tablet/i.test(ua))                     return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua))             return "mobile";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua))    return "desktop";
  return "other";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EventPayload = Record<
  string,
  string | number | boolean | null | undefined | Array<string | number | boolean>
>;

/**
 * Log a passenger event. Fire-and-forget — no await, no throw.
 */
export function logEvent(
  eventType: PassengerEventType,
  payload: EventPayload = {}
): void {
  if (typeof window === "undefined") return;

  const anonymousId = getAnonymousId();
  const sessionId   = getSessionId();
  const device      = getDevice();

  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) continue;
    const key = k.slice(0, 64);
    if (typeof v === "string") {
      cleaned[key] = v.slice(0, 512);
    } else if (Array.isArray(v)) {
      cleaned[key] = v.slice(0, 20);
    } else {
      cleaned[key] = v;
    }
  }

  const body = JSON.stringify({
    event_type:   eventType,
    anonymous_id: anonymousId,
    session_id:   sessionId,
    device,
    payload:      cleaned,
  });

  void fetch(EVENTS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* swallowed on purpose */
  });
}

// ---------------------------------------------------------------------------
// Convenience wrappers — one per event type.
// ---------------------------------------------------------------------------

export function logSearchSubmitted(query: string, resultCount: number): void {
  logEvent("search_submitted", {
    query: query.slice(0, 256),
    result_count: resultCount,
  });
}

export function logLocationSelected(
  name: string,
  source: string,
  role: "from" | "to" | string,
  positionInResults?: number
): void {
  logEvent("location_selected", {
    name: name.slice(0, 256),
    source,
    role,
    position_in_results: positionInResults ?? null,
  });
}

export function logBusViewed(tripId: string, routeId?: string | null): void {
  logEvent("bus_viewed", { trip_id: tripId, route_id: routeId ?? null });
}

export function logBookingStarted(
  tripId: string,
  fromStopId?: string | null,
  toStopId?: string | null
): void {
  logEvent("booking_started", {
    trip_id: tripId,
    from_stop_id: fromStopId ?? null,
    to_stop_id: toStopId ?? null,
  });
}

export function logBookingSubmitted(
  tripId: string,
  seats: number,
  fareBwp?: number | null
): void {
  logEvent("booking_submitted", {
    trip_id: tripId,
    seats,
    fare_bwp: fareBwp ?? null,
  });
}

export function logBookingConfirmed(
  bookingReference: string,
  tripId?: string | null
): void {
  logEvent("booking_confirmed", {
    booking_reference: bookingReference,
    trip_id: tripId ?? null,
  });
}

export function logBookingAbandoned(tripId: string, stage: string): void {
  logEvent("booking_abandoned", {
    trip_id: tripId,
    stage: stage.slice(0, 64),
  });
}