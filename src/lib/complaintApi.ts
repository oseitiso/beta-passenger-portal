// Client for the passenger-complaint Edge Function.

import { getOrCreateAnonymousId } from "./passengerBookingApi";

const API_BASE =
  process.env.NEXT_PUBLIC_COMPLAINT_API_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co/functions/v1/passenger-complaint";

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_o2CPNKg49wAwJysjiGp08A_V0ZYeZjH";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co";

// ─── Types ──────────────────────────────────────────────────────────────

export type ComplaintCategory =
  | "bus_no_show"
  | "driver_refused"
  | "overcharged"
  | "unsafe_driving"
  | "driver_rude"
  | "bus_full"
  | "pin_failed"
  | "booking_issue"
  | "wrong_pickup"
  | "app_bug"
  | "other";

export const COMPLAINT_CATEGORIES: {
  value: ComplaintCategory;
  label: string;
  description: string;
}[] = [
  { value: "bus_no_show",    label: "Bus didn't arrive",     description: "The bus never showed up at the stop" },
  { value: "driver_refused", label: "Driver refused me",     description: "Driver didn't let me board" },
  { value: "overcharged",    label: "Overcharged / fare dispute", description: "Charged more than the agreed fare" },
  { value: "unsafe_driving", label: "Unsafe driving",        description: "Speeding, dangerous overtaking, etc." },
  { value: "driver_rude",    label: "Driver was rude",       description: "Unprofessional or disrespectful conduct" },
  { value: "bus_full",       label: "Bus was full",          description: "No seats available despite booking" },
  { value: "pin_failed",     label: "PIN didn't work",       description: "Boarding PIN rejected by driver" },
  { value: "booking_issue",  label: "Booking issue",         description: "Wrong seat, wrong time, etc." },
  { value: "wrong_pickup",   label: "Wrong pickup point",    description: "Bus arrived at a different stop" },
  { value: "app_bug",        label: "App / website problem", description: "Something in the app didn't work" },
  { value: "other",          label: "Other",                 description: "Anything else" },
];

export interface ComplaintListItem {
  id: string;
  reference: string;
  category: ComplaintCategory;
  subject: string | null;
  status: "new" | "investigating" | "resolved" | "rejected" | "duplicate";
  severity: "low" | "medium" | "high" | "critical";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  public_notes: { message: string; created_at: string }[];
}

export interface ComplaintDetail extends ComplaintListItem {
  body: string;
  attachments: unknown[];
  booking_reference: string | null;
  public_notes: { message: string; created_at: string; kind: string }[];
}

export interface CreateComplaintInput {
  category: ComplaintCategory;
  subject?: string;
  body: string;
  attachments?: unknown[];
  reporter_name?: string;
  reporter_phone?: string;
  reporter_email?: string;
  handoff_id?: string;
  trip_id?: string;
  booking_reference?: string;
}

export interface CreateComplaintResult {
  success: boolean;
  complaint_id?: string;
  reference?: string;
  error?: string;
}

// ─── Identity ───────────────────────────────────────────────────────────

export function getPassengerIdentity(): string {
  return `a:${getOrCreateAnonymousId()}`;
}

// ─── HTTP ───────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`API ${path} returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`API ${path} returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Public methods ─────────────────────────────────────────────────────

export async function createComplaint(
  input: CreateComplaintInput
): Promise<CreateComplaintResult> {
  return post<CreateComplaintResult>("", {
    ...input,
    reporter_identity: getPassengerIdentity(),
  });
}

export async function listComplaints(): Promise<{
  complaints: ComplaintListItem[];
}> {
  const identity = getPassengerIdentity();
  return get(`?identity=${encodeURIComponent(identity)}`);
}

export async function getComplaint(
  id: string
): Promise<{ complaint?: ComplaintDetail; error?: string }> {
  const identity = getPassengerIdentity();
  return get(`/${id}?identity=${encodeURIComponent(identity)}`);
}

export async function addComplaintNote(
  id: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  return post(`/${id}/note`, {
    identity: getPassengerIdentity(),
    message,
  });
}


// ─── Attachments ────────────────────────────────────────────────────────

const STORAGE_BUCKET = "complaint-attachments";

export interface UploadedAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
}

export const ATTACHMENT_LIMITS = {
  maxFiles: 3,
  maxBytes: 2 * 1024 * 1024, // 2 MB
  allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
};

/**
 * Upload one file to Supabase Storage.
 * Path format: <anonymous-id>/<complaint-id>/<uuid>.<ext>
 * Returns the storage path on success.
 */
export async function uploadComplaintAttachment(
  complaintId: string,
  file: File
): Promise<{ success: boolean; path?: string; error?: string }> {
  // Validate
  if (file.size > ATTACHMENT_LIMITS.maxBytes) {
    return {
      success: false,
      error: `File too large (max ${Math.round(ATTACHMENT_LIMITS.maxBytes / 1024 / 1024)} MB)`,
    };
  }
  if (!ATTACHMENT_LIMITS.allowedTypes.includes(file.type)) {
    return {
      success: false,
      error: `File type not allowed. Use JPG, PNG, or PDF.`,
    };
  }

  // Build a stable path prefix from anonymous identity
  const identity = getPassengerIdentity(); // "a:anon-xxxxx"
  const safePrefix = identity.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const unique = crypto.randomUUID();
  const path = `${safePrefix}/${complaintId}/${unique}.${ext}`;

  const url = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: file,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `Upload failed (${res.status}) ${text.slice(0, 120)}`,
      };
    }

    return { success: true, path };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Network error during upload",
    };
  }
}

/**
 * Get a signed URL for viewing an attachment (valid for 1 hour).
 */
export async function getAttachmentSignedUrl(
  path: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const url = `${SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${path}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    });

    if (!res.ok) {
      return { success: false, error: `Signed URL failed (${res.status})` };
    }

    const json = (await res.json()) as { signedURL?: string };
    if (!json.signedURL) {
      return { success: false, error: "No signed URL in response" };
    }

    // Signed URL path is relative — prepend origin
    const fullUrl = `${SUPABASE_URL}/storage/v1${json.signedURL}`;
    return { success: true, url: fullUrl };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Network error getting signed URL",
    };
  }
}

/**
 * Update the complaint's attachments array on the server.
 */
export async function updateComplaintAttachments(
  complaintId: string,
  attachments: UploadedAttachment[]
): Promise<{ success: boolean; error?: string }> {
  return post(`/${complaintId}/attachments`, {
    identity: getPassengerIdentity(),
    attachments,
  });
}