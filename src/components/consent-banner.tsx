"use client";

import { useEffect, useState } from "react";
import { useCouple } from "@/contexts/couple-context";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  initAnalytics,
  identifyUser,
  capturePageview,
} from "@/lib/analytics";

// One-time consent prompt for privacy-first product analytics (PostHog). Nothing
// is tracked and no analytics cookies are set until the user accepts. Shown only
// while the choice is undecided; the decision persists in localStorage.
export default function ConsentBanner() {
  const { me } = useCouple();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(getAnalyticsConsent() === null);
  }, []);

  if (!show) return null;

  function accept() {
    setAnalyticsConsent("granted");
    initAnalytics();
    identifyUser(me.id, { couple_id: me.couple_id, accent_color: me.accent_color });
    if (typeof window !== "undefined") capturePageview(window.location.pathname);
    setShow(false);
  }

  function decline() {
    setAnalyticsConsent("denied");
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[90] px-4 pointer-events-none">
      <div className="max-w-lg mx-auto card p-4 shadow-soft pointer-events-auto">
        <p className="text-sm text-foreground font-medium mb-1">help improve us.</p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          we use privacy-first analytics to see which features help — no ads, no
          screen recording, and never your name, email or content. you can change
          this any time. ok to enable?
        </p>
        <div className="flex gap-2">
          <button
            onClick={accept}
            className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-medium active:scale-[0.99] transition-transform"
          >
            yes, enable
          </button>
          <button
            onClick={decline}
            className="flex-1 h-10 rounded-xl bg-secondary text-sm font-medium text-muted-foreground active:scale-[0.99] transition-transform"
          >
            no thanks
          </button>
        </div>
      </div>
    </div>
  );
}
