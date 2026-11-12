// Pre-trip seat requests: hold a seat up to 5 days ahead at the first stop, then claim it at the stop.
import { getOrCreateAnonymousId } from "@/lib/passengerBookingApi";
import { pushSupported } from "@/lib/push";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const TZ = "Africa/Gaborone";

export interface PretripSeat {
  id: string;
  seat_number: number;
  row_number: number;
  column_number: number;
  seat_type: "FRONT" | "WINDOW" | "AISLE" | "BACK" | "STANDARD";
  taken: boolean;
}

export interface PretripSeatPlan {
  seats: PretripSeat[];
  seatConfig: unknown;
  driverSide: "LEFT" | "RIGHT";
  error?: string;
}

export interface PretripView {
  reference: string;
  state: "HELD" | "CLAIMED" | "BOARDED" | "RELEASED" | "CANCELLED";
  release_reason: string | null;
  seat_numbers: number[];
  pin: string;
  name: string | null;
  operator: string | null;
  route: string | null;
  trip_status: string;
  from_name: string | null;
  to_name: string | null;
  from_lat: number | null;
  from_lng: number | null;
  departs_at: string;
  claim_opens_at: string;
  claim_deadline_at: string;
  claimed_at: string | null;
  claim_radius_m: number;
  server_now: string;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Not configured");
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error("Request failed");
  return (await res.json()) as T;
}

const NET_ERROR = "Check your connection and try again.";

export async function fetchPretripSeats(tripId: string, toStopId: string): Promise<PretripSeatPlan> {
  try {
    const r = await rpc<{
      success: boolean;
      error?: string;
      seats?: PretripSeat[];
      seat_config?: unknown;
      driver_side?: string;
    }>("get_pretrip_seats", { p_trip_id: tripId, p_to_stop_id: toStopId });
    if (!r.success) return { seats: [], seatConfig: null, driverSide: "RIGHT", error: r.error ?? "Seats are not available." };
    return {
      seats: r.seats ?? [],
      seatConfig: r.seat_config ?? null,
      driverSide: r.driver_side === "LEFT" ? "LEFT" : "RIGHT",
    };
  } catch {
    return { seats: [], seatConfig: null, driverSide: "RIGHT", error: NET_ERROR };
  }
}

async function currentSubscription(askPermission: boolean): Promise<PushSubscriptionJSON | null> {
  try {
    if (!pushSupported() || !VAPID_PUBLIC_KEY) return null;
    if (Notification.permission === "denied") return null;
    if (Notification.permission !== "granted") {
      if (!askPermission) return null;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return null;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const padding = "=".repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
      const b64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(b64);
      const key = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as unknown as BufferSource,
      });
    }
    return sub.toJSON();
  } catch {
    return null;
  }
}

export async function bookPretrip(args: {
  tripId: string;
  toStopId: string;
  seatIds: string[];
  name: string;
  phone: string;
  remind: boolean;
}): Promise<{ ok: boolean; reference?: string; error?: string; reminders?: boolean }> {
  const sub = args.remind ? await currentSubscription(true) : null;
  try {
    const r = await rpc<{ success: boolean; error?: string; booking_reference?: string }>("book_pretrip_seats", {
      p_trip_id: args.tripId,
      p_to_stop_id: args.toStopId,
      p_seat_ids: args.seatIds,
      p_anonymous_id: getOrCreateAnonymousId(),
      p_name: args.name,
      p_phone: args.phone,
      p_endpoint: sub?.endpoint ?? null,
      p_p256dh: sub?.keys?.p256dh ?? null,
      p_auth: sub?.keys?.auth ?? null,
    });
    if (!r.success || !r.booking_reference) return { ok: false, error: r.error ?? "Could not save the request." };
    return { ok: true, reference: r.booking_reference, reminders: !!sub };
  } catch {
    return { ok: false, error: NET_ERROR };
  }
}

export interface MyPretripTrip {
  trip_id: string;
  state: "HELD" | "CLAIMED" | "BOARDED";
  seat_numbers: number[];
}

/** Trips on which this device already holds seats. */
export async function fetchMyPretripTrips(): Promise<Record<string, MyPretripTrip>> {
  try {
    const r = await rpc<MyPretripTrip[]>("get_my_pretrip_trips", { p_anonymous_id: getOrCreateAnonymousId() });
    const out: Record<string, MyPretripTrip> = {};
    (Array.isArray(r) ? r : []).forEach((x) => {
      out[x.trip_id] = x;
    });
    return out;
  } catch {
    return {};
  }
}

export async function fetchPretrip(reference: string): Promise<{ view?: PretripView; error?: string }> {
  try {
    const r = await rpc<{ success: boolean; error?: string } & Partial<PretripView>>("get_pretrip", {
      p_reference: reference,
      p_anonymous_id: getOrCreateAnonymousId(),
    });
    if (!r.success) return { error: r.error ?? "Booking not found." };
    return { view: r as unknown as PretripView };
  } catch {
    return { error: NET_ERROR };
  }
}

export async function claimPretrip(
  reference: string,
  lat: number,
  lng: number,
  accuracy: number | null,
  method: "GEOFENCE_AUTO" | "GEOFENCE_TAP"
): Promise<{ ok: boolean; error?: string; reason?: string }> {
  try {
    const r = await rpc<{ success: boolean; error?: string; reason?: string }>("claim_pretrip", {
      p_reference: reference,
      p_anonymous_id: getOrCreateAnonymousId(),
      p_lat: lat,
      p_lng: lng,
      p_accuracy_m: accuracy,
      p_method: method,
    });
    return r.success ? { ok: true } : { ok: false, error: r.error, reason: r.reason };
  } catch {
    return { ok: false, error: NET_ERROR };
  }
}

export async function cancelPretripRequest(reference: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await rpc<{ success: boolean; error?: string }>("cancel_pretrip", {
      p_reference: reference,
      p_anonymous_id: getOrCreateAnonymousId(),
    });
    return r.success ? { ok: true } : { ok: false, error: r.error };
  } catch {
    return { ok: false, error: NET_ERROR };
  }
}

// ---- helpers ----
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 24) return Math.floor(h / 24) + " d " + (h % 24) + " h";
  if (h > 0) return h + " h " + String(m).padStart(2, "0") + " min";
  return m + ":" + String(sec).padStart(2, "0");
}

// ---- remembered on this device ----
const REFS_KEY = "beta_pretrip_refs";
const CONTACT_KEY = "beta_pretrip_contact";

export function getPretripRefs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(REFS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function addPretripRef(ref: string): void {
  try {
    const next = [ref, ...getPretripRefs().filter((x) => x !== ref)].slice(0, 10);
    localStorage.setItem(REFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
export function removePretripRef(ref: string): void {
  try {
    localStorage.setItem(REFS_KEY, JSON.stringify(getPretripRefs().filter((x) => x !== ref)));
  } catch {
    /* ignore */
  }
}
export function getPretripContact(): { name: string; phone: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? "null");
    if (v && typeof v.name === "string" && typeof v.phone === "string") return v;
  } catch {
    /* ignore */
  }
  return { name: "", phone: "" };
}
export function setPretripContact(name: string, phone: string): void {
  try {
    localStorage.setItem(CONTACT_KEY, JSON.stringify({ name, phone }));
  } catch {
    /* ignore */
  }
}