// Tiny global toast: dispatch an event from anywhere, the <Toaster> in the
// layout renders it. Optional action button (e.g. "undo").
export interface ToastAction { label: string; onClick: () => void }

export function toast(message: string, action?: ToastAction) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, action } }));
  }
}

/**
 * Optimistic delete with an undo window. The caller has already removed the item
 * from its UI state; this defers the real (server) delete by `delay`ms and offers
 * an "undo" that cancels it and restores the UI instead.
 */
export function undoableDelete(opts: {
  message: string;
  commit: () => void;   // perform the real delete (called if not undone)
  restore: () => void;  // put the item back in the UI
  delay?: number;
}) {
  if (typeof window === "undefined") { opts.commit(); return; }
  let undone = false;
  const timer = window.setTimeout(() => { if (!undone) opts.commit(); }, opts.delay ?? 4500);
  toast(opts.message, {
    label: "undo",
    onClick: () => { undone = true; window.clearTimeout(timer); opts.restore(); },
  });
}
