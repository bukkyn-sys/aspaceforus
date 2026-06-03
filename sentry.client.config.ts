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
  });
}
