// Client for the passenger-api Edge Function.
// Public — no auth header needed.

const API_BASE =
  process.env.NEXT_PUBLIC_PASSENGER_API_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/passenger-api";

export interface PublicStop {
  stop_id: string;
  name: string;
  reverse_geocoded_name?: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  order: number;
  distance_from_origin_km: number | null;
  /** True if a passenger can currently board here */
  boardable: boolean;
  /** Why this stop is not boardable, if applicable */
  unboardable_reason:
    | "bus_passed"
    | "too_close"
    | "destination"
    | "off_route"
    | null;
}

export interface PublicBus {
  trip_id: string;
  trip_code: string | null;
  route: {
    route_id: string;
    name: string;
    origin: string | null;
    destination: string | null;
    stops: PublicStop[];
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

export interface SearchedLocation {
  name: string;
  region: string | null;
  lat: number;
  lng: number;
  source: "stop_lookup" | "forward_geocode";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} failed: ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

export async function getActiveBuses(opts?: {
  from?: string;
  to?: string;
}): Promise<PublicBus[]> {
  const params = new URLSearchParams();
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  const q = params.toString();
  const path = `/active-buses${q ? `?${q}` : ""}`;
  const data = await get<{ buses: PublicBus[]; count: number }>(path);
  return data.buses;
}

export async function getBus(tripId: string): Promise<PublicBus> {
  return get<PublicBus>(`/buses/${tripId}`);
}

export async function getRoutes(): Promise<
  {
    id: string;
    name: string;
    origin: string | null;
    destination: string | null;
    distance_km: number | null;
    estimated_duration_min: number | null;
  }[]
> {
  return get(`/routes`);
}

export async function searchLocations(
  query: string
): Promise<SearchedLocation[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = await get<{
    locations: SearchedLocation[];
    count: number;
  }>(`/locations/search?q=${encodeURIComponent(q)}`);
  return data.locations ?? [];
}

export async function getStops(): Promise<
  {
    id: string;
    name: string;
    city: string | null;
    lat: number | null;
    lng: number | null;
  }[]
> {
  return get(`/stops`);
}