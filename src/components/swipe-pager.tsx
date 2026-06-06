"use client";

import { useRef, useEffect, useState, useCallback, type ReactNode } from "react";

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
  const lock = useRef(false); // suppress index-sync during programmatic scroll
  const settleTimer = useRef<number | undefined>(undefined);
  const idxRef = useRef(index);
  idxRef.current = index;

  const [seen, setSeen] = useState<Set<number>>(() => new Set([index]));

  // Keep visited panes (∪ current window) mounted to preserve their state.
  useEffect(() => {
    setSeen((prev) => {
      const next = new Set(prev);
      for (let i = index - mountWindow; i <= index + mountWindow; i++) {
        if (i >= 0 && i < count) next.add(i);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [index, count, mountWindow]);

  // Place the horizontal scroll at the active index without animation on mount.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth-scroll when the index is changed externally (e.g. tapping a tab),
  // and reset every other pane to the top so you arrive at the top of it.
  useEffect(() => {
    paneRefs.current.forEach((el, i) => { if (i !== index) el.scrollTop = 0; });
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    if (!w) return;
    const target = index * w;
    if (Math.abs(el.scrollLeft - target) < 2) return;
    lock.current = true;
    el.scrollTo({ left: target, behavior: "smooth" });
    const t = window.setTimeout(() => { lock.current = false; }, 380);
    return () => window.clearTimeout(t);
  }, [index]);

  // Derive the index from the settled scroll position.
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w && onProgress) onProgress(el.scrollLeft / w); // always report (even during programmatic scroll)
    if (lock.current) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (!w) return;
      const i = Math.round(el.scrollLeft / w);
      if (i !== idxRef.current && i >= 0 && i < count) onIndexChange(i);
    }, 80);
  }, [onIndexChange, onProgress, count]);

  return (
    <div
      ref={ref}
      onScroll={onScroll}
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
        const mounted = seen.has(i) || Math.abs(i - index) <= mountWindow;
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
            }}
          >
            {mounted ? renderPane(i, i === index) : null}
          </div>
        );
      })}
    </div>
  );
}
