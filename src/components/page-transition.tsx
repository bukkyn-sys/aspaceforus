"use client";

import { useContext, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Keeps the *outgoing* page rendering its old content during its exit animation.
 * Without this, the leaving subtree would immediately swap to the new route (or
 * blank) because the router context has already advanced — so there'd be nothing
 * to fade out. We snapshot the context on first render and hold it frozen.
 */
function FrozenRouter({ children }: { children: ReactNode }) {
  const context = useContext(LayoutRouterContext ?? ({} as never));
  const frozen = useRef(context).current;
  if (!frozen) return <>{children}</>;
  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

/**
 * Cross-fade between app screens: the current page fades to the background, then
 * the next page fades in and drops down into place. `mode="wait"` sequences them
 * (out → in) which also hides the new screen's load. Fully interruptible — a new
 * navigation just swaps the keyed child; there's no stuck half-state.
 *
 * Modals are portaled to <body>, so the small y-translate here can't affect them.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 0, transition: { duration: 0.22, ease: "easeIn" } }}
        transition={{ duration: 0.36, ease: [0.33, 0, 0.2, 1] }}
        style={{ willChange: "opacity, transform" }}
      >
        <FrozenRouter>{children}</FrozenRouter>
      </motion.div>
    </AnimatePresence>
  );
}
