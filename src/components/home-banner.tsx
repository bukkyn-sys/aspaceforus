"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const FULL = 176; // px — expanded height
const MIN = 76;   // px — collapsed bar height

/** Sticky banner that collapses as the page scrolls (iOS large-title style).
 *  Updates are written straight to the DOM inside a rAF scroll handler — no React
 *  state — so it stays perfectly in sync with the scroll (smooth, no gaps). The
 *  banner is fully opaque so content scrolling under it never shows through.
 *  `focus` (0–100) only re-crops as it collapses, keeping the chosen full crop. */
export function HomeBanner({ bannerUrl, focus = 50 }: { bannerUrl: string | null; focus?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const wordRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const h = Math.max(MIN, FULL - window.scrollY);
      const progress = (FULL - h) / (FULL - MIN); // 0 → 1
      el.style.height = `${h}px`;
      el.style.boxShadow = progress > 0.01
        ? `0 8px 18px -8px rgba(0,0,0,${(0.42 * Math.min(1, progress * 2)).toFixed(3)})`
        : "none";
      if (imgRef.current) imgRef.current.style.objectPosition = `50% ${50 + (focus - 50) * progress}%`;
      if (wordRef.current) wordRef.current.style.fontSize = `${48 - progress * 22}px`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [focus]);

  return (
    <div ref={ref} className="sticky top-0 z-20 w-full overflow-hidden bg-secondary" style={{ height: FULL }}>
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={imgRef} src={bannerUrl} alt="couple" className="w-full h-full object-cover" style={{ objectPosition: "50% 50%" }} />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-secondary to-background" />
      )}
      {/* Subtle, opaque-image darkening for wordmark contrast — never fades to the
          page colour, so content under the sticky banner stays hidden. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/0 to-black/15" />
      <div className="absolute inset-0 flex items-center justify-center">
        <p ref={wordRef} className={cn("font-heading tracking-tight select-none leading-none", bannerUrl ? "text-white drop-shadow" : "text-foreground/20")} style={{ fontSize: 48 }}>us.</p>
      </div>
    </div>
  );
}
