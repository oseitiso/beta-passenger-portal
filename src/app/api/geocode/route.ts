import { NextRequest, NextResponse } from "next/server";

// Server-only. Never expose OPENCAGE_API_KEY to the client.
// Route: GET /api/geocode?lat=...&lng=...

export const dynamic = "force-dynamic";

const OPENCAGE_URL = "https://api.opencagedata.com/geocode/v1/json";
const TIMEOUT_MS = 3000;

const memCache = new Map<string, { data: unknown; ts: number }>();
const MEM_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "Missing or invalid lat/lng" },
      { status: 400 }
    );
  }

  const key = cacheKey(lat, lng);

  const cached = memCache.get(key);
  if (cached && Date.now() - cached.ts < MEM_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "X-Cache": "HIT-MEM",
      },
    });
  }

  const apiKey = process.env.OPENCAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Geocoding not configured", short: null, full: null },
      { status: 500 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(OPENCAGE_URL);
    url.searchParams.set("q", `${lat},${lng}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", "en");
    url.searchParams.set("no_annotations", "1");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenCage ${res.status}`, short: null, full: null },
        { status: 502 }
      );
    }

    const json = (await res.json()) as {
      results?: Array<{
        formatted?: string;
        components?: Record<string, string>;
      }>;
    };

    const first = json.results?.[0];
    if (!first) {
      const empty = { short: null, full: null, components: {} };
      memCache.set(key, { data: empty, ts: Date.now() });
      return NextResponse.json(empty, {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
          "X-Cache": "MISS-EMPTY",
        },
      });
    }

    const c = first.components ?? {};
    const short =
      c.city ??
      c.town ??
      c.village ??
      c.suburb ??
      c.county ??
      c.state ??
      first.formatted?.split(",")[0]?.trim() ??
      "";

    const district = c.county ?? c.state_district ?? c.state ?? "";
    const country = c.country ?? "";

    const shortWithDistrict =
      short && district && district !== short
        ? `${short}, ${district}`
        : short || district;

    const fullParts = [short, district, country].filter(Boolean);
    const full = Array.from(new Set(fullParts)).join(", ");

    const payload = {
      short: shortWithDistrict || full || null,
      full: full || shortWithDistrict || null,
      components: c,
    };

    memCache.set(key, { data: payload, ts: Date.now() });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "X-Cache": "MISS",
      },
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Geocode failed: ${msg}`, short: null, full: null },
      { status: 504 }
    );
  }
}