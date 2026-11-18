// Shared 10-second cache for the public bus list.
// Many passengers watching the same map now cost the database one read per
// cache period instead of one read each.
export const dynamic = "force-dynamic";

const UPSTREAM =
  process.env.NEXT_PUBLIC_PASSENGER_API_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/passenger-api";
const TTL_SECONDS = 10;
const MAX_PARAM_LENGTH = 80;

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams;
  const from = src.get("from") ?? "";
  const to = src.get("to") ?? "";
  if (from.length > MAX_PARAM_LENGTH || to.length > MAX_PARAM_LENGTH) {
    return new Response(JSON.stringify({ error: "invalid query" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const q = qs.toString();

  const cache: Cache | undefined = (globalThis as any).caches?.default;
  const cacheKey = new Request(
    `https://cache.b-eta.internal/active-buses${q ? `?${q}` : ""}`
  );
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const upstream = await fetch(`${UPSTREAM}/active-buses${q ? `?${q}` : ""}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body = await upstream.text();
  const res = new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${TTL_SECONDS}`,
    },
  });
  if (upstream.ok && cache) {
    try {
      await cache.put(cacheKey, res.clone());
    } catch {
      /* serving without the cache is fine */
    }
  }
  return res;
}