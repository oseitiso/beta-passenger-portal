import { getOrCreateAnonymousId } from "@/lib/passengerBookingApi";
import { pushSupported } from "@/lib/push";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(SUPABASE_URL + "/functions/v1/passenger-push/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error ?? "Something went wrong." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Check your connection and try again." };
  }
}

/** Ask this device to be alerted when the trip starts. Shows the permission pop-up if needed. */
export async function enableTripAlert(
  tripId: string,
  fromStopId: string,
  toStopId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "Alerts are not supported on this device." };
  if (Notification.permission === "denied") {
    return { ok: false, error: "Alerts are blocked in your browser settings." };
  }
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: "Alerts were not allowed." };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }
    return await post("alert-subscribe", {
      trip_id: tripId,
      from_stop_id: fromStopId,
      to_stop_id: toStopId,
      anonymous_id: getOrCreateAnonymousId(),
      subscription: sub.toJSON(),
    });
  } catch {
    return { ok: false, error: "Could not turn on the alert. Try again." };
  }
}

export function cancelTripAlert(tripId: string): Promise<{ ok: boolean; error?: string }> {
  return post("alert-cancel", { trip_id: tripId, anonymous_id: getOrCreateAnonymousId() });
}
