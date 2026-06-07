"use client";

import { useRef, useEffect, useCallback, type ReactNode } from "react";

/**
 * Horizontal, finger-tracked pager built on native CSS scroll-snap — so the
 * content follows the finger in real time, you can drag halfway, hold, change
 * your mind, and it momentum-snaps or springs back, all natively (Instagram feel).
 *
 * - Always renders `count` full-width columns (so scroll geometry maps cleanly to
 *   the index), but only mounts content within `index ± mountWindow` plus any pane
 *   already visited — neighbours are live for the peek; far/unseen panes stay empty.
 * - Each pane scrolls VERTICALLY on its own (fixed-height viewport), and any pane
 *   you swipe to is reset to the top — so you always land at the top of the next
 *   screen, never mid-scroll.
 * - `onIndexChange` fires once the swipe settles; tapping an indicator (parent
 *   changes `index`) smooth-scrolls to it.
 */
export function SwipePager({
  index,
  count,
  onIndexChange,
  renderPane,
  mountWindow = 1,
  className,
  containEdges = true,
  onProgress,
}: {
  index: number;
  count: number;
  onIndexChange: (i: number) => void;
  renderPane: (i: number, active: boolean) => ReactNode;
  mountWindow?: number;
  className?: string;
  // When false, edge overscroll chains to a parent pager.
  containEdges?: boolean;
  // Live fractional scroll position (0..count-1) — for indicators that track the
  // finger. Fires on every scroll frame (use imperatively to avoid re-renders).
  onProgress?: (p: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paneRefs = useRef(new Map<number, HTMLDivElement>());
  const lock = useRef(false);      // suppress index-sync during programmatic scroll
  const touching = useRef(false);  // a finger is down — never settle/commit until release
  const settleTimer = useRef<number | undefined>(undefined);
  const idxRef = useRef(index);
  idxRef.current = index;

  // Place the horizontal scroll at the active index without animation on mount.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move to the active index when it's changed externally (tab tap / nav / deep
  // link), and reset every other pane to the top so you arrive at its top.
  // Adjacent moves animate; far jumps (e.g. home → ledger) snap instantly so the
  // panes in between don't flash past.
  useEffect(() => {
    paneRefs.current.forEach((el, i) => { if (i !== index) el.scrollTop = 0; });
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    if (!w) return;
    const target = index * w;
    if (Math.abs(el.scrollLeft - target) < 2) return;
    lock.current = true;
    const far = Math.abs(el.scrollLeft / w - index) > 1.2;
    if (far) {
      // Cross-fade the jump so the panes in between don't flash past: fade out,
      // snap instantly, fade back in.
      el.style.transition = "opacity 140ms ease";
      el.style.opacity = "0";
      const j = window.setTimeout(() => {
        el.scrollTo({ left: target, behavior: "auto" });
        el.style.opacity = "1";
      }, 140);
      const t = window.setTimeout(() => { lock.current = false; el.style.transition = ""; }, 320);
      return () => { window.clearTimeout(j); window.clearTimeout(t); };
    }
    el.scrollTo({ left: target, behavior: "smooth" });
    const t = window.setTimeout(() => { lock.current = false; }, 380);
    return () => window.clearTimeout(t);
  }, [index]);

  // Commit the index only once the scroll has SETTLED and no finger is down — so
  // holding a half-swipe never auto-completes; you decide by letting go.
  const scheduleSettle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (touching.current) return;
      const w = el.clientWidth;
      if (!w) return;
      const i = Math.round(el.scrollLeft / w);
      if (i !== idxRef.current && i >= 0 && i < count) onIndexChange(i);
    }, 80);
  }, [onIndexChange, count]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w && onProgress) onProgress(el.scrollLeft / w); // live position (even mid-gesture)
    if (lock.current || touching.current) return;       // don't settle while holding
    scheduleSettle();
  }, [onProgress, scheduleSettle]);

  const onTouchStart = useCallback(() => { touching.current = true; window.clearTimeout(settleTimer.current); }, []);
  const onTouchEnd = useCallback(() => { touching.current = false; scheduleSettle(); }, [scheduleSettle]);

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={className}
      style={{
        display: "flex",
        overflowX: "auto",
        overflowY: "hidden",
        scrollSnapType: "x mandatory",
        scrollBehavior: "auto",
        overscrollBehaviorX: containEdges ? "contain" : "auto",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        // Only the active tab + its immediate neighbours stay mounted; far tabs
        // unmount so their data fetches + realtime channels tear down (scaling).
        const mounted = Math.abs(i - index) <= mountWindow;
        return (
          <div
            key={i}
            ref={(el) => { if (el) paneRefs.current.set(i, el); else paneRefs.current.delete(i); }}
            style={{
              flex: "0 0 100%",
              minWidth: "100%",
              height: "100%",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              scrollSnapAlign: "start",
              scrollSnapStop: "always", // a fling can only advance one pane, never skip
            }}
          >
            {mounted ? renderPane(i, i === index) : null}
          </div>
        );
      })}
    </div>
  );
}
