import * as Sentry from "@sentry/nextjs";

// Edge runtime Sentry (middleware, edge routes). DSN from SENTRY_DSN.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
