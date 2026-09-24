// src/lib/geo.ts
// Reverse geocoding via our own /api/geocode proxy.
// The OpenCage API key lives on the server (Cloudflare Worker secret) —
// it is NOT in the client bundle.

export interface PlaceName {
  short: string;
  full: string;
  components: Record<string, string>;
}

const cache = new Map<string, PlaceName | null>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Reverse-geocode a coordinate into a place name.
 * Returns null if the proxy fails or nothing is found.
 * Hard timeout of 4 seconds so the UI never hangs.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<PlaceName | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key) ?? null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const url = new URL("/api/geocode", window.location.origin);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lng));

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "force-cache",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      cache.set(key, null);
      return null;
    }

    const json = (await res.json()) as {
      short?: string | null;
      full?: string | null;
      components?: Record<string, string>;
    };

    if (!json.short && !json.full) {
      cache.set(key, null);
      return null;
    }

    const place: PlaceName = {
      short: json.short ?? json.full ?? "Unknown location",
      full: json.full ?? json.short ?? "Unknown location",
      components: json.components ?? {},
    };

    cache.set(key, place);
    return place;
  } catch {
    clearTimeout(timeout);
    cache.set(key, null);
    return null;
  }
}

/**
 * Synchronous helper — returns cached value or fallback.
 * Kicks off a background fetch for the next render.
 */
export function formatLocationSync(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fallback = "Location unavailable"
): string {
  if (lat == null || lng == null) return fallback;
  const cached = cache.get(cacheKey(lat, lng));
  if (cached) return cached.short;
  reverseGeocode(lat, lng).catch(() => {});
  return fallback;
}