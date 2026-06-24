import * as Sentry from "@sentry/nextjs";

// Client-side Sentry. The browser can only read NEXT_PUBLIC_* vars, so the DSN
// must be exposed as NEXT_PUBLIC_SENTRY_DSN (set it to the same value as
// SENTRY_DSN). Init is skipped (safe) when unset.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Privacy: never record a couple's private screens.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't attach IP / cookies / headers by default.
    sendDefaultPii: false,
    // Strip anything that could carry couple content before it leaves the device.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) delete event.request.headers["authorization"];
      }
      delete event.user;
      return event;
    },
  });
}
