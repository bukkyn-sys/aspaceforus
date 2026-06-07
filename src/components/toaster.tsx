"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ToastAction } from "@/lib/toast";

interface ToastData { message: string; action?: ToastAction }

export default function Toaster() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastData>).detail;
      setToast(detail);
      if (timer.current) clearTimeout(timer.current);
      // Linger longer when there's an action (e.g. undo) to reach for.
      timer.current = setTimeout(() => setToast(null), detail.action ? 4500 : 3500);
    };
    window.addEventListener("app:toast", onToast);
    return () => {
      window.removeEventListener("app:toast", onToast);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 text-sm font-medium pl-4 pr-2 py-2 rounded-xl bg-foreground text-background shadow-lg max-w-[90%]"
          style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          <span className="py-0.5 cursor-pointer" onClick={() => setToast(null)}>{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action!.onClick(); setToast(null); }}
              className="px-2.5 py-1 rounded-lg bg-background/20 text-background font-semibold uppercase tracking-wide text-xs"
            >
              {toast.action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
