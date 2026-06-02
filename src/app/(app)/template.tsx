"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Page-transition wrapper for the tabbed app screens. template.tsx (unlike
 * layout.tsx) re-mounts on every navigation, so we animate an ENTRANCE only —
 * a quick fade-in. No exit animation means rapid tab-switching can never get
 * stuck in a half-finished state: the new screen just mounts and fades in.
 *
 * Opacity only (deliberately): a transform here would become the containing
 * block for position:fixed descendants and break the bottom sheets/dialogs,
 * and could disturb the sticky headers. A fade is the safe, smooth choice.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
