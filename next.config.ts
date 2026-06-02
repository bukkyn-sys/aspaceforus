import type { NextConfig } from "next";

// Build the CSP from the Supabase origin so it works across envs.
const supabaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try { return new URL(url).origin; } catch { return ""; }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",   // Next.js hydration requires unsafe-inline
  "style-src 'self' 'unsafe-inline'",    // Tailwind inline styles
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
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

export default nextConfig;
