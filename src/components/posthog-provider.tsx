"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCouple } from "@/contexts/couple-context";
import { initAnalytics, identifyUser, track, capturePageview, isAnalyticsReady, type AnalyticsEvent } from "@/lib/analytics";

/**
 * Initialises + scopes PostHog to the authenticated app. It wraps the (app)
 * route group only, so /auth/* and /onboarding are never tracked under an
 * identified user. Because onboarding sits outside this provider, the
 * couple_created / couple_joined events are relayed via a sessionStorage flag
 * set during onboarding and flushed here on first authenticated load.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { me } = useCouple();
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
    identifyUser(me.id, { couple_id: me.couple_id, accent_color: me.accent_color });

    try {
      const pending = sessionStorage.getItem("ph_pending_event");
      if (pending === "couple_created" || pending === "couple_joined") {
        track(pending as AnalyticsEvent);
        sessionStorage.removeItem("ph_pending_event");
      }
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, [me.id, me.couple_id, me.accent_color]);

  // SPA pageviews (App Router doesn't fire posthog's auto-pageview on client nav).
  useEffect(() => {
    if (isAnalyticsReady() && pathname) capturePageview(pathname);
  }, [pathname]);

  return <>{children}</>;
}
