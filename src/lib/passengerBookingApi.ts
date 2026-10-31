// Client for the passenger-booking endpoints and the local "paper trail"
// of ended bookings. Uses localStorage for both the active booking slot
// and the rolling history log.

const API_BASE =
  process.env.NEXT_PUBLIC_PASSENGER_BOOKING_API_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/passenger-booking-api";

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_o2CPNKg49wAwJysjiGp08A_V0ZYeZjH";

export interface BookingResponse {
  success: boolean;
  handoff_id?: string;
  booking_reference?: string;
  pickup_id?: string;
  token?: string;
  expires_at?: string;
  status?: string;
  booking_pin?: string | null;
  error?: string;
}

export interface BookingDetail {
  handoff_id: string;
  booking_reference: string;
  handoff_status: string;
  pickup_status?: string | null;
  booking_pin?: string | null;
  created_at: string;
  expires_at: string;
  requested_seats: number;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  from_stop_name?: string | null;
  to_stop_name?: string | null;
  route_name?: string | null;
  route_origin?: string | null;
  route_destination?: string | null;
  trip_code?: string | null;
  pickup_missed_reason?: string | null;
  pickup_disruption_flag?: boolean | null;
  seat_numbers?: (number | string)[] | null;
  operator_name?: string | null;
  vehicle_registration?: string | null;
  vehicle_description?: string | null;
}

/**
 * Rolling record of a completed/ended booking. Kept in localStorage as a
 * paper trail so passengers can see evidence of past trips even after the
 * active booking slot has been cleared.
 */
export interface BookingHistoryEntry {
  handoff_id: string;
  booking_reference: string;
  handoff_status: string;
  from_stop_name: string | null;
  to_stop_name: string | null;
  route_origin: string | null;
  route_destination: string | null;
  requested_seats: number;
  passenger_name: string | null;
  ended_at: number;
}

// ───────────────────────── Anonymous ID management ─────────────────────────

const ANON_ID_KEY = "b-eta-anonymous-id";
const BOOKING_STORAGE_KEY = "b-eta-active-booking";
const HISTORY_KEY = "b-eta-booking-history";
const MAX_HISTORY = 20;

export function getOrCreateAnonymousId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id =
      "anon-" +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

export function saveActiveBooking(data: {
  handoff_id: string;
  booking_reference: string;
  pickup_id: string;
  token: string;
  expires_at: string;
}): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(data));
}

export function getActiveBooking(): {
  handoff_id: string;
  booking_reference: string;
  pickup_id: string;
  token: string;
  expires_at: string;
} | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(BOOKING_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearActiveBooking(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(BOOKING_STORAGE_KEY);
}

// ───────────────────────── Booking history (paper trail) ─────────────────────────

/**
 * Upsert an ended booking into the rolling history log.
 * Newest first, capped at MAX_HISTORY entries.
 */
export function appendBookingHistory(entry: BookingHistoryEntry): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list: BookingHistoryEntry[] = raw ? JSON.parse(raw) : [];

    // De-dupe by handoff_id (upsert — most recent wins)
    const filtered = list.filter((e) => e.handoff_id !== entry.handoff_id);
    filtered.unshift(entry);

    const trimmed = filtered.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full, private mode, or corrupted JSON — silently ignore.
    // History is a nice-to-have; never break the main flow for it.
  }
}

export function getBookingHistory(): BookingHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearBookingHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}

// ───────────────────────── Booking API calls ─────────────────────────

export class RequestTimeoutError extends Error {
  constructor() {
    super("The connection is slow and the request timed out.");
    this.name = "RequestTimeoutError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 30000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    return body as T;
  } catch (e) {
    if ((e as any)?.name === "AbortError") throw new RequestTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestBooking(input: {
  trip_id: string;
  from_stop_id: string;
  to_stop_id: string;
  requested_seats: number;
  passenger_name?: string;
  passenger_phone?: string;
  seat_ids?: string[];
}): Promise<BookingResponse> {
  return request<BookingResponse>("/booking/request", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      anonymous_id: getOrCreateAnonymousId(),
    }),
  });
}

/**
 * After a timeout or dropped connection the booking may still have reached the
 * server. Look it up by phone and return it if a live request exists.
 * Returns null when nothing is found (the request genuinely never arrived).
 */
export async function recoverActiveBooking(
  phone: string
): Promise<BookingResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await request<{ success: boolean; bookings?: any[] }>(
        "/booking/recover",
        { method: "POST", body: JSON.stringify({ passenger_phone: phone, anonymous_id: getOrCreateAnonymousId() }) },
        15000
      );
      if (!res.success || !Array.isArray(res.bookings)) return null;
      const now = Date.now();
      const live = res.bookings.find((b) => {
        const s = String(b.handoff_status).toUpperCase();
        if (s === "ACCEPTED") return true;
        return s === "PENDING" && new Date(b.expires_at).getTime() > now;
      });
      if (!live) return null;
      return {
        success: true,
        handoff_id: live.handoff_id,
        booking_reference: live.booking_reference,
        pickup_id: live.pickup_id ?? undefined,
        token: "",
        expires_at: live.expires_at,
        status: String(live.handoff_status),
        booking_pin: live.booking_pin ?? null,
      };
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

export async function getBookingStatus(
  bookingReference: string
): Promise<{ success: boolean; booking?: BookingDetail; error?: string }> {
  return request(
    `/booking/status?reference=${encodeURIComponent(bookingReference)}`
  );
}

export async function cancelBooking(
  handoffId: string
): Promise<{ success: boolean; error?: string }> {
  return request(`/booking/cancel`, {
    method: "POST",
    body: JSON.stringify({
      handoff_id: handoffId,
      anonymous_id: getOrCreateAnonymousId(),
    }),
  });
}