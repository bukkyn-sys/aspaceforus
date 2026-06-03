"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";

// Honest feedback when there's no connection — so a tester who makes a change
// offline knows it won't save, rather than seeing the optimistic update and
// assuming it stuck.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-full bg-foreground text-background shadow-lg whitespace-nowrap"
          style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
        >
          <WifiOff className="w-3.5 h-3.5" /> you&apos;re offline — changes won&apos;t save
        </motion.div>
      )}
    </AnimatePresence>
  );
}
