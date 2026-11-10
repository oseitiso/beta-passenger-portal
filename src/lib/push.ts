import { getOrCreateAnonymousId } from "@/lib/passengerBookingApi";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://hzmpncdygkeqvoszunfm.supabase.co";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// iPhones only allow web push once the site is added to the Home Screen.
export function isIosNeedingInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone =
    (navigator as any).standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  return ios && !standalone;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registers this device for alerts about one booking. With prompt=false it
 * only re-registers when permission was already granted (no pop-up).
 */
export async function enablePush(
  reference: string,
  prompt: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "Alerts are not supported on this device." };

  if (Notification.permission === "denied") {
    return { ok: false, error: "Alerts are blocked in your browser settings." };
  }
  if (Notification.permission !== "granted") {
    if (!prompt) return { ok: false };
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
    const res = await fetch(SUPABASE_URL + "/functions/v1/passenger-push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        anonymous_id: getOrCreateAnonymousId(),
        subscription: sub.toJSON(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error ?? "Could not turn on alerts." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not turn on alerts. Check your connection and try again." };
  }
}
