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
export function FrozenRouter({ children }: { children: ReactNode }) {
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
 * the next fades in. `mode="wait"` sequences them (out → in), which also hides the
 * new screen's load. Opacity only — no transform — so sticky headers and modals
 * are untouched. Each screen's header additionally floats down via the `.hdr-float`
 * CSS animation (replays on mount). Fully interruptible: a new navigation just
 * swaps the keyed child, with no stuck half-state.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.22, ease: "easeIn" } }}
        transition={{ duration: 0.36, ease: [0.33, 0, 0.2, 1] }}
        style={{ willChange: "opacity" }}
      >
        <FrozenRouter>{children}</FrozenRouter>
      </motion.div>
    </AnimatePresence>
  );
}
