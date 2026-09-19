// Client for fetching routes + stops for map rendering.

const API_BASE =
  process.env.NEXT_PUBLIC_PASSENGER_API_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/passenger-api";

export interface PublicRouteShape {
  route_id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  polyline: [number, number][] | null;
}

export interface PublicStopShape {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getRoutesWithPolylines(): Promise<PublicRouteShape[]> {
  const data = await get<{ routes: PublicRouteShape[]; count: number }>(
    "/routes-with-polylines"
  );
  return data.routes;
}

export async function getStops(): Promise<PublicStopShape[]> {
  const data = await get<{ stops: PublicStopShape[]; count: number }>("/stops");
  return data.stops;
}

/**
 * Assign a stable, DISTINCT color to each route.
 * Uses a global registry so two routes never get the same color,
 * even if their hashes collide.
 */
const ROUTE_PALETTE = [
  "#f97316", // orange (brand)
  "#2563eb", // blue
  "#16a34a", // green
  "#9333ea", // purple
  "#dc2626", // red
  "#ca8a04", // gold
  "#db2777", // pink
  "#0891b2", // cyan
  "#65a30d", // lime
  "#7c3aed", // violet
];

// Module-level registry: route_id → color
const routeColorCache = new Map<string, string>();
let nextColorIndex = 0;

export function colorForRoute(routeId: string): string {
  const cached = routeColorCache.get(routeId);
  if (cached) return cached;

  // If we've run out of palette colors, wrap around
  const color = ROUTE_PALETTE[nextColorIndex % ROUTE_PALETTE.length];
  nextColorIndex++;

  routeColorCache.set(routeId, color);
  return color;
}