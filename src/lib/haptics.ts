// Lightweight haptics. Uses the Web Vibration API, which works on Android/Chrome;
// iOS Safari ignores navigator.vibrate, so this is a graceful no-op there (no
// crash, just no buzz). Respects a user setting (default on) stored locally.

export type Haptic = "selection" | "light" | "medium" | "success" | "warning";

const KEY = "us_haptics";

export function hapticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setHapticsEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
}

const PATTERNS: Record<Haptic, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 20,
  success: [10, 40, 16],
  warning: [22, 50, 22],
};

export function haptic(kind: Haptic = "light"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (!hapticsEnabled()) return;
  try { navigator.vibrate(PATTERNS[kind]); } catch { /* not allowed / unsupported */ }
}
