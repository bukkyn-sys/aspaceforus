"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), 3500);
    };
    window.addEventListener("app:toast", onToast);
    return () => {
      window.removeEventListener("app:toast", onToast);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed left-1/2 -translate-x-1/2 z-[90] text-sm font-medium px-4 py-2.5 rounded-xl bg-foreground text-background shadow-lg max-w-[90%] text-center cursor-pointer"
          style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
          onClick={() => setMsg(null)}
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
