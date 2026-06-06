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

/** Initialise PostHog once on the client. Safe no-op when the key is unset, so
 *  the app never throws if analytics isn't configured. */
export function initAnalytics(): void {
  if (ready || typeof window === "undefined" || !POSTHOG_KEY) return;
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
