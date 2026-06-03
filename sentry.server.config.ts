import * as Sentry from "@sentry/nextjs";

// Server-side Sentry. DSN from SENTRY_DSN; init is skipped (safe) when unset.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
