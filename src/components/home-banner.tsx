"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const FULL = 176; // px — expanded height
const MIN = 76;   // px — collapsed bar height

/** Sticky banner that collapses as the page scrolls (iOS large-title style).
 *  Always pinned as a header and shrinks proportionally to whatever scroll
 *  exists, so it works even on short pages. `focus` (0–100) sets the vertical
 *  crop so the chosen band of the photo stays visible when collapsed. */
export function HomeBanner({ bannerUrl, focus = 50 }: { bannerUrl: string | null; focus?: number }) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { setScrollY(window.scrollY); raf = 0; });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const h = Math.max(MIN, FULL - scrollY);
  const progress = (FULL - h) / (FULL - MIN); // 0 → 1 as it collapses
  const fontSize = 48 - progress * 22;         // 48px → 26px

  return (
    <div className="sticky top-0 z-20 w-full overflow-hidden" style={{ height: h }}>
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bannerUrl}
          alt="couple"
          className="w-full h-full object-cover"
          style={{ objectPosition: `50% ${focus}%` }}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-secondary to-background" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-background/40" />
      <div className="absolute inset-0 flex items-center justify-center">
        <p
          className={cn("font-heading tracking-tight select-none leading-none", bannerUrl ? "text-white drop-shadow" : "text-foreground/20")}
          style={{ fontSize }}
        >us.</p>
      </div>
    </div>
  );
}
