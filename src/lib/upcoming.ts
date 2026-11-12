// Upcoming trips: search the operators' scheduled trips by day and stops.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const TZ = "Africa/Gaborone";

export interface UpcomingStop {
  id: string;
  name: string;
  city?: string | null;
  can_board: boolean;
  can_alight: boolean;
}

export interface UpcomingTrip {
  trip_id: string;
  operator: string | null;
  route: string | null;
  origin: string | null;
  destination: string | null;
  departs_at: string;
  at_from: string;
  at_to: string;
  state: "LIVE" | "ASSIGNED" | "TENTATIVE";
  alert_ok: boolean;
  can_pretrip?: boolean;
  pretrip_seats_free?: number | null;
  from_time_known: boolean;
  to_time_known: boolean;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Not configured");
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: "Bearer " + ANON_KEY,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error("Request failed");
  return (await res.json()) as T;
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearUpcomingCache(): void {
  cache.clear();
}

export function fetchUpcomingStops(): Promise<UpcomingStop[]> {
  return cached("stops", () => rpc<UpcomingStop[]>("get_upcoming_stops", {}));
}

export async function searchUpcomingTrips(
  fromStop: string,
  toStop: string,
  date: string
): Promise<{ trips: UpcomingTrip[]; error?: string }> {
  const key = ["trips", fromStop, toStop, date].join("|");
  const data = await cached(key, () =>
    rpc<{ success: boolean; error?: string; trips?: UpcomingTrip[] }>("get_upcoming_trips", {
      p_from_stop: fromStop,
      p_to_stop: toStop,
      p_date: date,
    })
  );
  if (!data.success) return { trips: [], error: data.error ?? "Search failed." };
  return { trips: data.trips ?? [] };
}

// ---- days (Botswana calendar) ----
export function todayInGaborone(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function nextFiveDays(): { date: string; label: string }[] {
  const [y, m, d] = todayInGaborone().split("-").map(Number);
  const out: { date: string; label: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12));
    const date = dt.toISOString().slice(0, 10);
    const label =
      i === 0
        ? "Today"
        : i === 1
        ? "Tomorrow"
        : dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    out.push({ date, label });
  }
  return out;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

// ---- remembered on this device ----
const ALERTS_KEY = "beta_trip_alerts";
const LAST_KEY = "beta_upcoming_last";

export function getAlertedTrips(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ALERTS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function setAlertedTrips(ids: string[]): void {
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* ignore */
  }
}
export function getLastSearch(): { from: string; to: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
    return v && typeof v.from === "string" && typeof v.to === "string" ? v : null;
  } catch {
    return null;
  }
}
export function setLastSearch(from: string, to: string): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ from, to }));
  } catch {
    /* ignore */
  }
}
