"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SheetClose } from "./sheet-close";
import { useScrollLock } from "@/lib/use-scroll-lock";

/** Esc-to-close + move focus into the panel on open and back to the trigger on close. */
function useDialogA11y(open: boolean, onClose: () => void, panel: React.RefObject<HTMLDivElement | null>) {
  // Keep onClose in a ref so the focus effect can depend on `open` ALONE. Callers
  // almost always pass an inline arrow for onClose, so including it in the deps
  // re-ran this effect on every parent render — and the re-run called
  // panel.focus(), yanking focus out of whatever input you were typing in. That
  // closed the keyboard after one keystroke (and snapped date pickers shut on the
  // next tap). Now focus only moves on a real open/close transition.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCloseRef.current(); }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

// Render to document.body so sheets/dialogs are never affected by an ancestor's
// transform (page transitions) — their fixed positioning always maps to the viewport.
function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const SHEET_SPRING = { type: "spring" as const, damping: 32, stiffness: 320 };
const DIALOG_SPRING = { type: "spring" as const, damping: 28, stiffness: 380 };

/**
 * Mobile-first bottom sheet with slide-up / slide-down animation.
 * The drag handle + title + close stay pinned at the top; the body scrolls;
 * an optional footer pins the primary action to the bottom.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useScrollLock(open);
  const panel = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onClose, panel);
  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <div data-sheet="" className="fixed inset-0 z-[60] flex flex-col justify-end">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
            className="relative w-full max-w-lg mx-auto bg-background rounded-t-3xl flex flex-col shadow-[0_-8px_40px_rgba(0,0,0,0.12)] outline-none"
            style={{ maxHeight: "92dvh" }}
          >
            <div className="flex justify-center pt-3 flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-border/60" />
            </div>
            <div className="relative flex items-center justify-center px-6 pt-2 pb-2 flex-shrink-0">
              <p className="font-semibold text-foreground text-center">{title}</p>
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <SheetClose onClick={onClose} />
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto px-6 pt-2 space-y-4"
              style={{ paddingBottom: footer ? "1rem" : "calc(1.5rem + env(safe-area-inset-bottom))" }}
            >
              {children}
            </div>
            {footer && (
              <div
                className="flex-shrink-0 px-6 pt-3 border-t border-border/30"
                style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </Portal>
  );
}

/** Small centred dialog for confirmations / quick choices. */
export function Dialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useScrollLock(open);
  const panel = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onClose, panel);
  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <div data-sheet="" className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={DIALOG_SPRING}
            className="relative w-full max-w-xs bg-background rounded-3xl p-6 shadow-[0_8px_40px_rgba(0,0,0,0.18)] outline-none"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </Portal>
  );
}
