import { useEffect } from "react";

// The app scrolls the window/body (the (app) layout's <main> only has
// min-height, so it grows with content rather than scrolling internally).
// Locking <main> therefore did nothing — we must lock the body.
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}
