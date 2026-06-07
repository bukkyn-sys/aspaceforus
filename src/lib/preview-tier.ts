"use client";

import { useSyncExternalStore } from "react";

// Beta-only "preview as free" toggle. Lets a beta tester (who has comped Premium)
// see what the free tier looks like. UI-only — server-side quota enforcement
// (Phase 3) reads this to gate the preview as well.
const KEY = "us_preview_free";
const listeners = new Set<() => void>();

export function isPreviewFree(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setPreviewFree(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** Reactive read of the preview-free flag. */
export function usePreviewFree(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => isPreviewFree(),
    () => false,
  );
}
