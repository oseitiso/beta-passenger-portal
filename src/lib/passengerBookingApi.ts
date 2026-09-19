// Client for the passenger-booking-api Edge Function.

const API_BASE =
  process.env.NEXT_PUBLIC_PASSENGER_BOOKING_API_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/passenger-booking-api";

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bXBuY2R5Z2tlcXZvc3p1bmZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Nzg3NzAsImV4cCI6MjEwNTE1NDc3MH0.XAFIVcB5iZjHg6uczZRdjvYAKZbq5sMWb0l-eVCrBjs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BookingRequest {
  trip_id: string;
  from_stop_id: string;
  to_stop_id: string;
  requested_seats?: number;
  anonymous_id: string;
  passenger_name?: string;
  passenger_phone?: string;
  preferred_seat?: number;
}

export interface BookingResponse {
  success: boolean;
  handoff_id?: string;
  pickup_id?: string;
  token?: string;
  booking_reference?: string;
  expires_at?: string;
  status?: string;
  error?: string;
}

export interface BookingDetail {
  handoff_id: string;
  booking_reference: string;
  handoff_status: string;
  booking_pin: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  requested_seats: number;
  from_stop_id: string;
  to_stop_id: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  pickup_id: string | null;
  pickup_status: string | null;
  driver_id: string | null;
  trip_code: string;
  trip_status: string;
  route_name: string;
  route_origin: string | null;
  route_destination: string | null;
}

// ─── Anonymous ID management ────────────────────────────────────────────────

const ANON_ID_KEY = "b-eta-anonymous-id";
const BOOKING_STORAGE_KEY = "b-eta-active-booking";

export function getOrCreateAnonymousId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = `anon-${crypto.randomUUID()}`;
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

// ─── HTTP ───────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as any;
  if (!res.ok && !data.error) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      apikey: ANON_KEY,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const data = (await res.json()) as any;
  if (!res.ok && !data.error) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return data as T;
}

// ─── Public methods ─────────────────────────────────────────────────────────

export async function requestBooking(
  req: Omit<BookingRequest, "anonymous_id">
): Promise<BookingResponse> {
  const anonymous_id = getOrCreateAnonymousId();
  return post<BookingResponse>("/booking/request", {
    ...req,
    anonymous_id,
    requested_seats: req.requested_seats ?? 1,
  });
}

export async function cancelBooking(
  handoffId: string
): Promise<{ success: boolean; status?: string; cooldown_until?: string | null; error?: string }> {
  const anonymous_id = getOrCreateAnonymousId();
  return post("/booking/cancel", {
    handoff_id: handoffId,
    anonymous_id,
  });
}

export async function getBookingStatus(
  reference: string
): Promise<{ success: boolean; booking?: BookingDetail; error?: string }> {
  return get(`/booking/status?reference=${encodeURIComponent(reference)}`);
}

export async function recoverBookings(
  phone: string
): Promise<{ success: boolean; bookings: BookingDetail[]; count: number }> {
  return post("/booking/recover", { passenger_phone: phone });
}