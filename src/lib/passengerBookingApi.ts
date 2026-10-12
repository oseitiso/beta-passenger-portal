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

// ───────────────────────── Booking history (paper trail) ───────────────────

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

// ───────────────────────── Booking API calls ───────────────────────────────

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return body as T;
}

export async function requestBooking(input: {
  trip_id: string;
  from_stop_id: string;
  to_stop_id: string;
  requested_seats: number;
  passenger_name?: string;
  passenger_phone?: string;
}): Promise<BookingResponse> {
  return request<BookingResponse>("/booking/request", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      anonymous_id: getOrCreateAnonymousId(),
    }),
  });
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
    body: JSON.stringify({ handoff_id: handoffId }),
  });
}