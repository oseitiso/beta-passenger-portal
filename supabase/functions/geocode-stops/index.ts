// B-ETA Geocode Stops — one-off backfill
// Reads OPENCAGE_API_KEY from Supabase secrets.
// Populates stops.reverse_geocoded_name using OpenCage reverse geocoding.
//
// Deploy:   npx supabase functions deploy geocode-stops --no-verify-jwt --project-ref hzmpncdygkeqvoszunfm
// Run:      POST https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/geocode-stops
//
// Idempotent — only touches rows where reverse_geocoded_name IS NULL OR
// equals the stop's operator name (i.e. still placeholder).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://esm.sh/postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  reverse_geocoded_name: string | null;
}

interface OpenCageResult {
  formatted?: string;
  components?: Record<string, string>;
}

async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string
): Promise<{ name: string | null; raw: OpenCageResult | null; error?: string }> {
  const url = new URL("https://api.opencagedata.com/geocode/v1/json");
  url.searchParams.set("q", `${lat},${lng}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");
  url.searchParams.set("no_annotations", "1");
  url.searchParams.set("limit", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { name: null, raw: null, error: `HTTP ${res.status}: ${body.slice(0, 100)}` };
    }

    const json = (await res.json()) as {
      results?: OpenCageResult[];
      status?: { code: number; message: string };
    };

    if (!json.results || json.results.length === 0) {
      return {
        name: null,
        raw: null,
        error: `No results (status: ${json.status?.code} ${json.status?.message})`,
      };
    }

    const first = json.results[0];
    const c = first.components ?? {};

    // Build "Name, District" — prefer city/town/village, then district
    const primary =
      c.city ?? c.town ?? c.village ?? c.suburb ?? c.county ?? c.state ?? "";

    const district = c.county ?? c.state_district ?? c.state ?? "";

    const result =
      primary && district && primary !== district
        ? `${primary}, ${district}`
        : primary || district || first.formatted?.split(",")[0]?.trim() || null;

    return { name: result, raw: first };
  } catch (e: unknown) {
    clearTimeout(timeout);
    return {
      name: null,
      raw: null,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return err("Method not allowed", 405);
  }

  const apiKey = Deno.env.get("OPENCAGE_API_KEY");
  if (!apiKey) {
    return err("OPENCAGE_API_KEY not set in Supabase secrets", 500);
  }

  try {
    // Fetch stops that need geocoding:
    //   - have coordinates
    //   - reverse_geocoded_name IS NULL, OR matches their name (placeholder)
    const stops = await sql<Stop[]>`
      select id, name, lat, lng, reverse_geocoded_name
      from public.stops
      where lat is not null
        and lng is not null
        and (
          reverse_geocoded_name is null
          or reverse_geocoded_name = name
        )
      order by name asc
    `;

    console.log(`[geocode-stops] Found ${stops.length} stops to process`);

    let updated = 0;
    let failed = 0;
    const failures: { id: string; name: string; error: string }[] = [];

    for (const stop of stops) {
      const result = await reverseGeocode(stop.lat, stop.lng, apiKey);

      if (!result.name) {
        failed++;
        failures.push({
          id: stop.id,
          name: stop.name,
          error: result.error ?? "unknown",
        });
        console.warn(`[geocode-stops] FAILED: ${stop.name} → ${result.error}`);
        continue;
      }

      await sql`
        update public.stops
        set reverse_geocoded_name = ${result.name}
        where id = ${stop.id}::uuid
      `;

      updated++;
      console.log(`[geocode-stops] OK: ${stop.name} → ${result.name}`);

      // OpenCage free tier: 1 req/sec. Be polite.
      await new Promise((r) => setTimeout(r, 1100));
    }

    return ok({
      success: true,
      total: stops.length,
      updated,
      failed,
      failures: failures.slice(0, 20),
    });
  } catch (e: any) {
    console.error("[geocode-stops] error:", e);
    return err(e?.message ?? "Internal error", 500);
  }
});