"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72;
const MAX_PULL = 96;

export default function PullToRefresh() {
  const router = useRouter();
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  // Gesture is disqualified if:
  // • the user moved upward at any point, OR
  // • scrollTop was > 0 when the touch started (scrolling back up, not pulling down)
  const disqualified = useRef(false);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onTouchStart(e: TouchEvent) {
      startY.current = null;
      disqualified.current = false;

      if (document.querySelector("[data-sheet]")) return;

      // Only track gestures that begin with the page already fully at the top.
      // This prevents inertial-scroll overshoot from triggering PTR — if the
      // user was mid-page and scrolled back up, scrollTop will be > 0 here.
      if (main!.scrollTop > 0) {
        disqualified.current = true;
        return;
      }
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshing || disqualified.current) return;
      // If the page scrolled during this gesture (shouldn't happen, but guard it)
      if (main!.scrollTop > 0) {
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
        router.refresh();
        setTimeout(() => setRefreshing(false), 1200);
      } else {
        setPullY(0);
      }
    }

    main.addEventListener("touchstart", onTouchStart, { passive: true });
    main.addEventListener("touchmove", onTouchMove, { passive: false });
    main.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      main.removeEventListener("touchstart", onTouchStart);
      main.removeEventListener("touchmove", onTouchMove);
      main.removeEventListener("touchend", onTouchEnd);
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
