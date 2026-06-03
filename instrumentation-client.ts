import * as Sentry from "@sentry/nextjs";

// Sentry v10 + Next 16 load the client SDK from this entry point. The actual
// init lives in sentry.client.config.ts (per the wizard naming).
import "./sentry.client.config";

// Instruments client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
