import { NextRequest, NextResponse } from "next/server";

// Server-only OSRM proxy for full route geometry.
// GET /api/route-geometry?stops=lat1,lng1;lat2,lng2;lat3,lng3
// Returns: { coordinates: [[lat,lng], ...], distance_km, duration_min, source }

export const dynamic = "force-dynamic";

const OSRM_URL = "http://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS = 8000;
const MEM_TTL_MS = 60 * 60 * 1000;

const memCache = new Map<string, { data: unknown; ts: number }>();

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: Array<[number, number]> };
  }>;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stopsRaw = searchParams.get("stops") ?? "";
  const pairs = stopsRaw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(",").map((x) => parseFloat(x.trim())));

  if (pairs.length < 2) {
    return NextResponse.json({ error: "At least 2 stops required" }, { status: 400 });
  }
  for (const [lat, lng] of pairs) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Invalid lat/lng in stops" }, { status: 400 });
    }
  }

  const key = pairs.map(([a, b]) => a.toFixed(4) + "," + b.toFixed(4)).join("|");
  const cached = memCache.get(key);
  if (cached && Date.now() - cached.ts < MEM_TTL_MS) {
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  const coords = pairs.map(([lat, lng]) => lng + "," + lat).join(";");
  const url = OSRM_URL + "/" + coords + "?overview=full&geometries=geojson&alternatives=false";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "b-eta-passenger/1.0" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = (await res.json()) as OsrmResponse;
      const r = json.routes?.[0];
      const line = r?.geometry?.coordinates;
      if (json.code === "Ok" && line && line.length > 0 && r?.distance != null && r?.duration != null) {
        const coordinates = line.map(([lng, lat]) => [lat, lng] as [number, number]);
        const payload = {
          coordinates,
          distance_km: Math.round((r.distance / 1000) * 10) / 10,
          duration_min: Math.round(r.duration / 60),
          source: "osrm" as const,
        };
        memCache.set(key, { data: payload, ts: Date.now() });
        return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
      }
    }

    const coordinates = pairs.map(([lat, lng]) => [lat, lng] as [number, number]);
    let totalKm = 0;
    for (let i = 1; i < pairs.length; i++) {
      totalKm += haversineKm(pairs[i - 1][0], pairs[i - 1][1], pairs[i][0], pairs[i][1]);
    }
    return NextResponse.json({
      coordinates,
      distance_km: Math.round(totalKm * 10) / 10,
      duration_min: Math.round(totalKm),
      source: "haversine" as const,
    });
  } catch {
    clearTimeout(timeout);
    const coordinates = pairs.map(([lat, lng]) => [lat, lng] as [number, number]);
    let totalKm = 0;
    for (let i = 1; i < pairs.length; i++) {
      totalKm += haversineKm(pairs[i - 1][0], pairs[i - 1][1], pairs[i][0], pairs[i][1]);
    }
    return NextResponse.json({
      coordinates,
      distance_km: Math.round(totalKm * 10) / 10,
      duration_min: Math.round(totalKm),
      source: "haversine" as const,
    });
  }
}