"use client";

import type { ReactNode } from "react";
import { SheetClose } from "./sheet-close";
import { useScrollLock } from "@/lib/use-scroll-lock";

/**
 * Mobile-first bottom sheet. The drag handle + title + close stay pinned at the
 * top, the body scrolls, and an optional footer pins the primary action to the
 * bottom — so a tall form is never cropped and the action is always reachable.
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
  if (!open) return null;
  return (
    <div data-sheet="" className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-lg mx-auto bg-background rounded-t-3xl flex flex-col shadow-[0_-8px_40px_rgba(0,0,0,0.12)]"
        style={{ maxHeight: "92dvh" }}
      >
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-border/60" />
        </div>
        <div className="flex items-center justify-between px-6 pt-2 pb-2 flex-shrink-0">
          <p className="font-semibold text-foreground">{title}</p>
          <SheetClose onClick={onClose} />
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
      </div>
    </div>
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
  if (!open) return null;
  return (
    <div data-sheet="" className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-background rounded-3xl p-6 shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        {children}
      </div>
    </div>
  );
}
