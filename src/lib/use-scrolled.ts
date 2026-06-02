import { useState, useEffect } from "react";

/** True once the window has scrolled past `threshold` px — for giving sticky
 *  headers a separator (shadow/border) only while content is scrolling under. */
export function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}
