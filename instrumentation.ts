import * as Sentry from "@sentry/nextjs";

// Loads the server / edge Sentry configs for the matching runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in server components / route handlers.
export const onRequestError = Sentry.captureRequestError;
