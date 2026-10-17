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

serwist.addEventListeners();