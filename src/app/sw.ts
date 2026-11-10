/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { Serwist, NetworkFirst, NetworkOnly } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Supabase REST + RPC: network-first, fall back to cache if offline.
    // Shows the user their last-loaded data instead of a fetch error.
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") &&
        (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/rpc/")),
      handler: new NetworkFirst({
        cacheName: "supabase-api",
        networkTimeoutSeconds: 5,
      }),
    },
    // Supabase Realtime uses WebSockets — no caching.
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") &&
        url.pathname.startsWith("/realtime/"),
      handler: new NetworkOnly(),
    },
    // Everything else: Serwist's defaults.
    ...defaultCache,
  ],
});

// ---- Web Push: alerts that arrive even when the app is closed ----
self.addEventListener("push", (event) => {
  let data: any = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "B-ETA", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const apple = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent || "");
      // The on-screen toast already covers an open app. Apple requires every push to be shown.
      const isTripAlert = String(data.kind || "").startsWith("trip_");
      if (!isTripAlert && !apple && wins.some((c) => c.visibilityState === "visible")) return;
      const opts: any = {
        body: data.body || "",
        tag: data.tag || "beta",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        renotify: true,
        requireInteraction: data.kind === "arrived" || data.kind === "trip_started",
        data: { url: data.url || "/map" },
      };
      await self.registration.showNotification(data.title || "B-ETA", opts);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/map";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if ("focus" in c) {
          await c.focus();
          if (url && "navigate" in c) {
            try {
              await (c as any).navigate(url);
            } catch {}
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
serwist.addEventListeners();