import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Build the CSP from the Supabase origin so it works across envs.
const supabaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try { return new URL(url).origin; } catch { return ""; }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

// Analytics/observability hosts the browser must be allowed to reach.
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const analyticsConnect = [
  posthogHost,
  "https://eu.i.posthog.com", "https://us.i.posthog.com",
  "https://eu-assets.i.posthog.com", "https://us-assets.i.posthog.com",
  "https://*.ingest.sentry.io", "https://*.ingest.de.sentry.io", "https://*.ingest.us.sentry.io",
].join(" ");
const analyticsScript = "https://eu-assets.i.posthog.com https://us-assets.i.posthog.com";
const analyticsImg = "https://eu.i.posthog.com https://us.i.posthog.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${analyticsScript}`,   // Next.js hydration requires unsafe-inline
  "style-src 'self' 'unsafe-inline'",    // Tailwind inline styles
  `img-src 'self' data: blob: ${supabaseOrigin} ${analyticsImg}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${analyticsConnect}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Clickjacking — the app must never be framed.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers MIME-sniff responses into a different type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which can contain ids) to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful features the app doesn't use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Force HTTPS for two years, incl. subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wrap with Sentry. Source-map upload is skipped when SENTRY_AUTH_TOKEN is absent
// (local / preview), so builds never fail just because Sentry isn't configured.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
