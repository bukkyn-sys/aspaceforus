"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72;
const MAX_PULL = 96;

// The app scrolls the window/body (the layout's <main> only has min-height, so
// it grows with content rather than scrolling internally). Read the real offset.
function scrollOffset() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

export default function PullToRefresh() {
  const router = useRouter();
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  // Disqualified if the gesture didn't begin at the very top, the user moved
  // upward, or a sheet is open — so scrolling back up never triggers a refresh.
  const disqualified = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      startY.current = null;
      disqualified.current = false;

      if (document.querySelector("[data-sheet]")) return;

      // Must begin with the page already fully at the top. If the user is
      // mid-page (or flinging up toward the top), scrollOffset() is > 0 here.
      if (scrollOffset() > 0) {
        disqualified.current = true;
        return;
      }
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshing || disqualified.current) return;
      // If the page is no longer at the top, bail (covers any late scrolling).
      if (scrollOffset() > 0) {
        disqualified.current = true;
        setPullY(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta < 0) {
        disqualified.current = true;
        setPullY(0);
        return;
      }
      if (delta === 0) return;
      e.preventDefault();
      setPullY(Math.min(delta * 0.55, MAX_PULL));
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      const y = pullY;
      startY.current = null;
      disqualified.current = false;
      if (y >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPullY(0);
        // Refresh server components AND tell the active client screen to refetch
        // its own data (screens load via client effects that router.refresh can't rerun).
        router.refresh();
        window.dispatchEvent(new Event("app:refresh"));
        setTimeout(() => setRefreshing(false), 1200);
      } else {
        setPullY(0);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pullY, refreshing, router]);

  const progress = Math.min(pullY / THRESHOLD, 1);
  const visible = pullY > 4 || refreshing;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: Math.max(pullY - 8, 8) }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          className="fixed top-0 inset-x-0 z-50 flex justify-center pointer-events-none"
        >
          <div className="bg-background/90 backdrop-blur-sm border border-border/50 rounded-full p-2.5 shadow-sm">
            <RefreshCw
              className={`w-4 h-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`}
              style={refreshing ? undefined : {
                transform: `rotate(${progress * 360}deg)`,
                transition: "none",
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
