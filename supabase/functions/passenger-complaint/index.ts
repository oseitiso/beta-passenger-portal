// B-ETA Passenger Complaint API — v1.0
// Public-facing complaint endpoints for the passenger portal.
//
// Endpoints:
//   GET  /health                      — health check
//   POST /                            — create a complaint
//   GET  /?identity=u:... | a:...     — list complaints for an identity
//   GET  /:id?identity=...            — get one complaint (identity-checked)
//   POST /:id/note                    — add a public follow-up note
//   POST /:id/attachments             — update attachments array

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://esm.sh/postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: unknown) {
  return new Response(
    JSON.stringify({ success: false, error: message, ...(extra as object) }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function parseJsonBody(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// ─── Allowed categories (severity is auto-set by the DB) ────────────────
const VALID_CATEGORIES = new Set([
  "bus_no_show",
  "driver_refused",
  "overcharged",
  "unsafe_driving",
  "driver_rude",
  "bus_full",
  "pin_failed",
  "booking_issue",
  "wrong_pickup",
  "app_bug",
  "other",
]);

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_HOURS = 24;

// ─── Handlers ───────────────────────────────────────────────────────────

async function handleHealth(): Promise<Response> {
  return ok({
    status: "B-ETA Passenger Complaint API active",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}

async function handleCreate(body: any): Promise<Response> {
  if (!body.category || !VALID_CATEGORIES.has(body.category)) {
    return err(
      `Invalid category. Must be one of: ${Array.from(VALID_CATEGORIES).join(", ")}`
    );
  }
  if (!body.body || String(body.body).trim().length < 10) {
    return err("Complaint body must be at least 10 characters");
  }
  if (!body.reporter_identity) {
    return err("Missing reporter_identity");
  }
  if (
    !body.reporter_identity.startsWith("u:") &&
    !body.reporter_identity.startsWith("a:")
  ) {
    return err("reporter_identity must start with 'u:' or 'a:'");
  }

  try {
    // Rate limit: max 5 complaints per 24h per identity
    const recent = await sql<{ count: number }[]>`
      select count(*)::int as count
      from passenger_complaints
      where reporter_identity = ${body.reporter_identity}
        and created_at > now() - ${`${RATE_LIMIT_WINDOW_HOURS} hours`}::interval
    `;
    const count = recent[0]?.count ?? 0;
    if (count >= RATE_LIMIT_MAX) {
      return err(
        `You've reached the limit of ${RATE_LIMIT_MAX} complaints per ${RATE_LIMIT_WINDOW_HOURS} hours. Please wait before submitting another.`,
        429
      );
    }

            // Call the existing DB function — never insert directly.
    // Note: attachments are saved via a follow-up PATCH call, not here.
    const result = await sql`
      select public.ct_create_complaint(
        ${body.category}::text,
        ${body.subject ?? null}::text,
        ${body.body}::text,
        'passenger'::text,
        ${body.reporter_identity}::text,
        ${body.reporter_name ?? null}::text,
        ${body.reporter_phone ?? null}::text,
        ${body.handoff_id ?? null}::uuid,
        ${body.trip_id ?? null}::uuid,
        null::uuid,
        null::uuid,
        null::uuid,
        ${body.booking_reference ?? null}::text,
        null::text,
        null::text
      ) as result
    `;

    const r = (result[0] as any)?.result;
    if (!r) return err("No result from ct_create_complaint", 500);

    if (!r.success) {
      return err(r.error ?? "Complaint creation failed", 400, r);
    }

    return ok(
      {
        success: true,
        complaint_id: r.complaint_id,
        reference: r.reference,
      },
      201
    );
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleList(url: URL): Promise<Response> {
  const identity = url.searchParams.get("identity");
  if (!identity) return err("Missing query parameter: identity");

  try {
    const rows = await sql`
      select
        c.id,
        c.reference,
        c.category,
        c.subject,
        c.status,
        c.severity,
        c.created_at,
        c.updated_at,
        c.resolved_at,
        c.resolution_note,
        coalesce(
          (
            select json_agg(json_build_object(
              'message', a.message,
              'created_at', a.created_at
            ) order by a.created_at asc)
            from complaint_activity a
            where a.complaint_id = c.id
              and a.public_note = true
          ),
          '[]'::json
        ) as public_notes
      from passenger_complaints c
      where c.reporter_identity = ${identity}
      order by c.created_at desc
      limit 100
    `;

    return ok({ complaints: rows });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleDetail(id: string, url: URL): Promise<Response> {
  const identity = url.searchParams.get("identity");
  if (!identity) return err("Missing query parameter: identity");

  try {
    const rows = await sql`
      select
        c.id,
        c.reference,
        c.category,
        c.subject,
        c.body,
        c.status,
        c.severity,
        c.attachments,
        c.created_at,
        c.updated_at,
        c.resolved_at,
        c.resolution_note,
        c.booking_reference,
        coalesce(
          (
            select json_agg(json_build_object(
              'message', a.message,
              'created_at', a.created_at,
              'kind', a.kind
            ) order by a.created_at asc)
            from complaint_activity a
            where a.complaint_id = c.id
              and a.public_note = true
          ),
          '[]'::json
        ) as public_notes
      from passenger_complaints c
      where c.id = ${id}::uuid
        and c.reporter_identity = ${identity}
      limit 1
    `;

    if (rows.length === 0) return err("Complaint not found", 404);

    return ok({ complaint: rows[0] });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleNote(id: string, body: any): Promise<Response> {
  if (!body.identity) return err("Missing identity");
  if (!body.message || String(body.message).trim().length < 2) {
    return err("Note must be at least 2 characters");
  }

  try {
    // Verify ownership
    const rows = await sql`
      select id from passenger_complaints
      where id = ${id}::uuid and reporter_identity = ${body.identity}
      limit 1
    `;
    if (rows.length === 0) return err("Complaint not found", 404);

    // Insert activity as a public passenger note
    await sql`
      insert into complaint_activity (
        complaint_id, actor_type, kind, message, public_note
      ) values (
        ${id}::uuid, 'passenger', 'note', ${body.message}::text, true
      )
    `;

    // Touch updated_at
    await sql`
      update passenger_complaints
      set updated_at = now()
      where id = ${id}::uuid
    `;

    return ok({ success: true });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

async function handleAttachments(id: string, body: any): Promise<Response> {
  if (!body.identity) return err("Missing identity");
  if (!Array.isArray(body.attachments)) return err("attachments must be an array");

  try {
    const rows = await sql`
      update passenger_complaints
      set attachments = ${sql.json(body.attachments)}::jsonb,
          updated_at = now()
      where id = ${id}::uuid
        and reporter_identity = ${body.identity}
      returning id, attachments
    `;
    if (rows.length === 0) return err("Complaint not found", 404);

    return ok({ success: true, attachments: rows[0].attachments });
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
}

// ─── Server ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let pathname = url.pathname
    .replace(/^\/functions\/v1\/passenger-complaint/, "")
    .replace(/^\/passenger-complaint/, "");
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  try {
    if (pathname === "/health" || pathname === "/") {
      if (req.method === "GET" && url.searchParams.has("identity")) {
        return await handleList(url);
      }
      if (req.method === "POST") {
        const body = await parseJsonBody(req);
        if (!body) return err("Invalid JSON body");
        return await handleCreate(body);
      }
      return await handleHealth();
    }

    // Routes with :id
    const match = pathname.match(/^\/([0-9a-fA-F-]{36})(\/[a-z]+)?$/);
    if (match) {
      const id = match[1];
      const action = match[2]?.slice(1); // "note" or "attachments" or undefined

      if (req.method === "GET" && !action) {
        return await handleDetail(id, url);
      }
      if (req.method === "POST" && action === "note") {
        const body = await parseJsonBody(req);
        if (!body) return err("Invalid JSON body");
        return await handleNote(id, body);
      }
      if (req.method === "POST" && action === "attachments") {
        const body = await parseJsonBody(req);
        if (!body) return err("Invalid JSON body");
        return await handleAttachments(id, body);
      }
    }

    return err("Not found", 404);
  } catch (e: any) {
    return err(e?.message ?? "Internal error", 500);
  }
});