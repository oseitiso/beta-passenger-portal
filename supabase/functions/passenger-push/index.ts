// passenger-push: stores a passenger's push subscription (POST .../subscribe)
// and sends queued alerts (POST with the x-push-secret header, from pg_net).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function subscribe(body: any): Promise<Response> {
  const reference = String(body?.reference ?? "").trim();
  const anonId = String(body?.anonymous_id ?? "");
  const sub = body?.subscription ?? {};
  const endpoint = String(sub?.endpoint ?? "");
  const p256dh = String(sub?.keys?.p256dh ?? "");
  const auth = String(sub?.keys?.auth ?? "");

  if (!reference || reference.length > 40 || !anonId || anonId.length > 100) {
    return json({ success: false, error: "Missing booking details." }, 400);
  }
  if (!endpoint.startsWith("https://") || endpoint.length > 1500 || !p256dh || !auth) {
    return json({ success: false, error: "Invalid subscription." }, 400);
  }

  const { data, error } = await supabase.rpc("register_push_subscription", {
    p_reference: reference,
    p_anonymous_id: anonId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  });
  if (error) return json({ success: false, error: "Could not save the subscription." }, 500);
  if (!data?.success) return json({ success: false, error: data?.error ?? "Not saved." }, 400);
  return json({ success: true });
}

async function dispatch(req: Request, body: any): Promise<Response> {
  const expected = Deno.env.get("PUSH_FUNCTION_SECRET");
  if (!expected) return json({ success: false, error: "Not configured." }, 500);
  if (req.headers.get("x-push-secret") !== expected) {
    return json({ success: false, error: "Forbidden." }, 403);
  }

  const outboxId = Number(body?.outbox_id);
  if (!Number.isFinite(outboxId)) return json({ success: false, error: "Bad request." }, 400);

  const { data: row } = await supabase
    .from("push_outbox")
    .select("id, handoff_id, kind, title, body, sent_at")
    .eq("id", outboxId)
    .maybeSingle();
  if (!row || row.sent_at) return json({ success: true, skipped: true });

  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!pub || !priv || !subject) return json({ success: false, error: "VAPID keys missing." }, 500);
  webpush.setVapidDetails(subject, pub, priv);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("handoff_id", row.handoff_id);

  const payload = JSON.stringify({
    title: row.title,
    body: row.body,
    tag: row.kind,
    kind: row.kind,
    url: "/map",
  });
  const ttl = row.kind === "arrived" ? 120 : row.kind === "approaching" ? 300 : 3600;

  let sent = 0;
  let failed = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: ttl, urgency: "high" }
      );
      sent++;
    } catch (e: any) {
      failed++;
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }

  await supabase
    .from("push_outbox")
    .update({
      sent_at: new Date().toISOString(),
      error: failed > 0 ? failed + " of " + (sent + failed) + " failed" : null,
    })
    .eq("id", row.id);

  return json({ success: true, sent, failed });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Bad JSON." }, 400);
  }

  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path.endsWith("/subscribe")) return subscribe(body);
  return dispatch(req, body);
});
