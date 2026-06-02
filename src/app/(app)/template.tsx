"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

/**
 * Page-transition wrapper for the tabbed app screens. template.tsx re-mounts on
 * every navigation, and keying the inner motion.div on the pathname guarantees a
 * fresh enter animation even if a segment is restored from the router cache.
 *
 * Entrance-only fade: rapid tab-switching can never get stuck mid-transition —
 * the new screen just mounts and fades in. Opacity only (no transform) so it
 * can't break fixed sheets/dialogs or sticky headers. A cross-fade is also the
 * recommended reduced-motion alternative, so it's safe to run for everyone.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
