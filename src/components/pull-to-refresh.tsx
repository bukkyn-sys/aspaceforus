"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72; // px to pull before triggering
const MAX_PULL = 96;

export default function PullToRefresh() {
  const router = useRouter();
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function onTouchStart(e: TouchEvent) {
      if (main!.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      triggered.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) { setPullY(0); return; }
      // Only intercept the scroll if we're genuinely pulling down from the top
      if (main!.scrollTop === 0) {
        e.preventDefault();
        setPullY(Math.min(delta * 0.55, MAX_PULL));
      }
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      startY.current = null;
      if (pullY >= THRESHOLD && !refreshing) {
        triggered.current = true;
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
