"use client";

import { useRef, useEffect, useCallback, type ReactNode } from "react";

/**
 * Finger-tracked horizontal pager driven by JS transforms (not native scroll).
 * One rail of `count` full-width panes is translated in real time, so:
 *  - the content follows the finger; hold a half-drag and it never auto-completes
 *    (commit happens only on release, by distance OR flick velocity);
 *  - `onProgress` is emitted from the SAME offset in the SAME frame as the rail,
 *    so an external header (e.g. the vault bar) tracks it with zero drift;
 *  - vertical scrolling stays native (touch-action: pan-y; each pane scrolls on
 *    its own), and only horizontal drags are captured here — no nested-scroll
 *    fights, no momentum glitches.
 * `onIndexChange` fires when a swipe settles; changing `index` from the parent
 * (tab tap / nav) animates there (adjacent) or fades through (far jumps).
 */
export function SwipePager({
  index,
  count,
  onIndexChange,
  renderPane,
  className,
  onProgress,
}: {
  index: number;
  count: number;
  onIndexChange: (i: number) => void;
  renderPane: (i: number, active: boolean) => ReactNode;
  mountWindow?: number;
  className?: string;
  containEdges?: boolean;
  onProgress?: (p: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const paneRefs = useRef(new Map<number, HTMLDivElement>());
  const idxRef = useRef(index);
  idxRef.current = index;
  const widthRef = useRef(0);
  const offsetRef = useRef(0);     // current rail translateX (px)
  const rafRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // Position the rail + emit progress from one place, so anything driven by
  // onProgress is always in lockstep with the rail.
  const setOffset = useCallback((off: number) => {
    offsetRef.current = off;
    if (rail.current) rail.current.style.transform = `translate3d(${off}px,0,0)`;
    const w = widthRef.current || 1;
    onProgressRef.current?.(-off / w);
  }, []);

  const cancelAnim = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; } };

  // rAF tween to a target offset (so onProgress fires every frame → header tracks).
  const animateTo = useCallback((target: number, done?: () => void) => {
    cancelAnim();
    const start = offsetRef.current;
    const dist = target - start;
    if (Math.abs(dist) < 0.5) { setOffset(target); done?.(); return; }
    const dur = 320;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      setOffset(start + dist * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else { rafRef.current = 0; done?.(); }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [setOffset]);

  // Land on an index: reset the panes you're leaving to the top, animate, commit.
  const settleTo = useCallback((i: number) => {
    const w = widthRef.current || 1;
    const target = Math.max(0, Math.min(count - 1, i));
    paneRefs.current.forEach((el, k) => { if (k !== target) el.scrollTop = 0; });
    animateTo(-target * w, () => { if (target !== idxRef.current) onIndexChange(target); });
  }, [animateTo, count, onIndexChange]);

  // Measure width + place at the active index on mount / resize.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      widthRef.current = el.clientWidth;
      cancelAnim();
      setOffset(-idxRef.current * widthRef.current);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnim(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parent changed the index (tab tap / nav / deep link): adjacent → animate;
  // far jump → fade through so the panes in between don't streak past.
  useEffect(() => {
    const w = widthRef.current || 1;
    const target = -index * w;
    if (Math.abs(offsetRef.current - target) < 1) {
      // Already parked on this index (deep link, return from a routed page): no
      // tween fires, so emit progress once so the nav/header sync to it.
      onProgressRef.current?.(index);
      return;
    }
    const far = Math.abs(offsetRef.current / w + index) > 1.2;
    const vp = viewport.current;
    if (far && vp) {
      vp.style.transition = "opacity 180ms ease";
      vp.style.opacity = "0";
      const t1 = window.setTimeout(() => {
        cancelAnim();
        setOffset(target);
        vp.style.opacity = "1";
      }, 180);
      const t2 = window.setTimeout(() => { vp.style.transition = ""; }, 400);
      return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    }
    animateTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ── Gesture ────────────────────────────────────────────────────────────────
  const drag = useRef<null | {
    startX: number; startY: number; base: number;
    axis: null | "x" | "y"; lastX: number; lastT: number; vx: number;
  }>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Sheets/dialogs are portaled to <body> but their pointer events still bubble
    // here through the React tree — so ignore any gesture that starts inside an
    // open form, otherwise the page swipes behind it.
    if ((e.target as Element)?.closest?.("[data-sheet]")) return;
    cancelAnim(); // grabbing mid-animation continues from where it is
    drag.current = { startX: e.clientX, startY: e.clientY, base: offsetRef.current, axis: null, lastX: e.clientX, lastT: e.timeStamp, vx: 0 };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;     // wait until the intent is clear
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    if (d.axis !== "x") return;                              // vertical → leave it to native scroll
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vx = (e.clientX - d.lastX) / dt;           // px/ms
    d.lastX = e.clientX; d.lastT = e.timeStamp;
    const w = widthRef.current || 1;
    let off = d.base + dx;
    const min = -(count - 1) * w;
    if (off > 0) off = off * 0.35;                           // rubber-band past the first
    else if (off < min) off = min + (off - min) * 0.35;     // …and past the last
    setOffset(off);
  }, [count, setOffset]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    const w = widthRef.current || 1;
    const dx = e.clientX - d.startX;
    const cur = idxRef.current;
    const flicked = Math.abs(d.vx) > 0.4;
    const passed = Math.abs(dx) > w * 0.35 || flicked;
    let target = cur;
    if (passed) target = dx < 0 ? cur + 1 : cur - 1;
    settleTo(target);
  }, [settleTo]);

  return (
    <div
      ref={viewport}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ overflow: "hidden", touchAction: "pan-y", position: "relative", willChange: "opacity" }}
    >
      <div
        ref={rail}
        style={{ display: "flex", height: "100%", width: `${count * 100}%`, willChange: "transform" }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            ref={(el) => { if (el) paneRefs.current.set(i, el); else paneRefs.current.delete(i); }}
            style={{ width: `${100 / count}%`, height: "100%", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}
          >
            {renderPane(i, i === index)}
          </div>
        ))}
      </div>
    </div>
  );
}
