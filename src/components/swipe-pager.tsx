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
 * - Container height follows the ACTIVE pane (panes have different heights), so a
 *   short pane doesn't leave a tall gap and the page scrolls vertically as normal.
 * - `onIndexChange` fires once the swipe settles on a new column; tapping an
 *   indicator (parent changes `index`) smooth-scrolls to it.
 */
export function SwipePager({
  index,
  count,
  onIndexChange,
  renderPane,
  mountWindow = 1,
  className,
  containEdges = true,
}: {
  index: number;
  count: number;
  onIndexChange: (i: number) => void;
  renderPane: (i: number, active: boolean) => ReactNode;
  mountWindow?: number;
  className?: string;
  // When false, edge overscroll chains to a parent pager (so e.g. swiping past
  // the first/last vault sub-tab moves to the neighbouring app tab).
  containEdges?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paneRefs = useRef(new Map<number, HTMLDivElement>());
  const lock = useRef(false); // suppress index-sync during programmatic scroll
  const settleTimer = useRef<number | undefined>(undefined);
  const idxRef = useRef(index);
  idxRef.current = index;

  const [height, setHeight] = useState<number | undefined>(undefined);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([index]));

  // Keep visited panes (∪ current window) mounted to preserve their state/scroll.
  useEffect(() => {
    setSeen((prev) => {
      const next = new Set(prev);
      for (let i = index - mountWindow; i <= index + mountWindow; i++) {
        if (i >= 0 && i < count) next.add(i);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [index, count, mountWindow]);

  // Place the scroll at the active index without animation on first paint.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth-scroll when the index is changed externally (e.g. tapping a tab).
  useEffect(() => {
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
    if (!el || lock.current) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const w = el.clientWidth;
      if (!w) return;
      const i = Math.round(el.scrollLeft / w);
      if (i !== idxRef.current && i >= 0 && i < count) onIndexChange(i);
    }, 80);
  }, [onIndexChange, count]);

  // Match the container height to the active pane (and track its changes).
  useEffect(() => {
    const pane = paneRefs.current.get(index);
    if (!pane) return;
    const ro = new ResizeObserver(() => setHeight(pane.offsetHeight));
    ro.observe(pane);
    setHeight(pane.offsetHeight);
    return () => ro.disconnect();
  }, [index, seen]);

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
        height: height ? `${height}px` : undefined,
        transition: "height .25s ease",
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const mounted = seen.has(i) || Math.abs(i - index) <= mountWindow;
        return (
          <div
            key={i}
            ref={(el) => { if (el) paneRefs.current.set(i, el); else paneRefs.current.delete(i); }}
            style={{ flex: "0 0 100%", minWidth: "100%", minHeight: "75vh", scrollSnapAlign: "start", alignSelf: "flex-start" }}
          >
            {mounted ? renderPane(i, i === index) : null}
          </div>
        );
      })}
    </div>
  );
}
