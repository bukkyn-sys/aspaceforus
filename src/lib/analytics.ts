import posthog from "posthog-js";

// Named product events tracked across the app's write sites.
export type AnalyticsEvent =
  | "mood_set"
  | "note_updated"
  | "event_created"
  | "countdown_created"
  | "vault_item_created"
  | "expense_added"
  | "pot_contributed"
  | "couple_created"
  | "couple_joined"
  | "settle_up"
  | "daily_answered"
  | "daily_revealed"
  | "daily_history_opened"
  | "todo_list_created"
  | "todo_added"
  | "todo_completed"
  | "photo_added"
  | "album_created";

type EventProps = Record<string, string | number | boolean | null | undefined>;

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let ready = false;

// ── Consent (GDPR/PECR) ──────────────────────────────────────────────────────
// Analytics is off until the user explicitly accepts. `null` = undecided (no
// tracking, banner shown); "granted"/"denied" = chosen.
const CONSENT_KEY = "us_analytics_consent";
export type Consent = "granted" | "denied";

export function getAnalyticsConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch { return null; }
}

export function setAnalyticsConsent(v: Consent): void {
  try { localStorage.setItem(CONSENT_KEY, v); } catch { /* storage unavailable */ }
}

/** Apply a consent change from settings: start tracking on grant, stop on revoke. */
export function applyConsentChange(
  v: Consent,
  who?: { id: string; couple_id: string; accent_color: string | null },
): void {
  setAnalyticsConsent(v);
  if (v === "granted") {
    initAnalytics();
    if (who) identifyUser(who.id, { couple_id: who.couple_id, accent_color: who.accent_color });
  } else if (ready) {
    try { posthog.opt_out_capturing(); } catch { /* not initialised */ }
  }
}

/** Initialise PostHog once on the client. No-op unless the key is set AND the
 *  user has granted consent — so the app never tracks (or sets cookies) without
 *  permission, and never throws if analytics isn't configured. */
export function initAnalytics(): void {
  if (ready || typeof window === "undefined" || !POSTHOG_KEY) return;
  if (getAnalyticsConsent() !== "granted") return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only", // no anonymous person profiles
    autocapture: false,                 // named events only (privacy: no DOM scraping)
    capture_pageview: false,            // captured manually on route change
    capture_pageleave: true,
    disable_session_recording: true,    // never record a couple's private screens
  });
  ready = true;
}

export function isAnalyticsReady(): boolean {
  return ready;
}

/** Identify the signed-in user. Deliberately excludes display_name / email / avatar_url. */
export function identifyUser(userId: string, props: { couple_id: string; accent_color: string | null }): void {
  if (!ready) return;
  posthog.identify(userId, { couple_id: props.couple_id, accent_color: props.accent_color });
}

export function track(event: AnalyticsEvent, props?: EventProps): void {
  if (!ready) return;
  posthog.capture(event, props);
}

export function capturePageview(pathname: string): void {
  if (!ready || typeof window === "undefined") return;
  posthog.capture("$pageview", { $current_url: window.location.href, pathname });
}
