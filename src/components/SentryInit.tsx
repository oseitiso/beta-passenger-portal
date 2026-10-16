"use client";

// ------------------------------------------------------------------------------
// Sentry init for the passenger portal.
//
// The standard @sentry/nextjs auto-instrumentation path is unreliable on
// Next.js 16 + OpenNext + Cloudflare Workers: it loads the SDK but skips
// the GlobalHandlers integration, so window.onerror is never hooked and
// uncaught errors are silently dropped.
//
// This module init runs the moment the client bundle evaluates - before
// React hydrates - which is early enough for Sentry to install its full
// integration set including GlobalHandlers.
// ------------------------------------------------------------------------------

import * as Sentry from "@sentry/nextjs";

if (typeof window !== "undefined") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,

    tracesSampleRate: 0.1,

    // Explicitly name the integrations we depend on. This guarantees
    // GlobalHandlers is attached even if the default list is trimmed.
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.breadcrumbsIntegration(),
      Sentry.globalHandlersIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.httpContextIntegration(),
      Sentry.browserApiErrorsIntegration(),
    ],

    beforeSend(event) {
      const PHONE = /\+\d[\d\s\-()]{7,}\d/g;
      const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const scrub = (s: string) =>
        s.replace(PHONE, "[redacted-phone]").replace(EMAIL, "[redacted-email]");

      if (event.message) event.message = scrub(event.message);
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = scrub(ex.value);
        }
      }
      if (event.breadcrumbs) {
        for (const b of event.breadcrumbs) {
          if (typeof b.message === "string") b.message = scrub(b.message);
        }
      }
      return event;
    },
  });

  console.log("[sentry-boot] initialized, client present:", !!Sentry.getClient());
}

export function SentryInit() {
  return null;
}