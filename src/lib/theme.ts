// Single source of truth for applying the light/dark theme at runtime.
//
// The theme is class-based (`.dark` on <html>). applyDark also keeps the
// status-bar <meta name="theme-color"> in lockstep and adds a brief
// `theme-transition` class so the colour change fades instead of jump-cutting.

export type Theme = "system" | "light" | "dark";

// Status-bar / background colours (must match --background light/dark in globals.css).
const LIGHT = "#F9F8F6";
const DARK = "#1A1A18";

export function resolveDark(theme: Theme): boolean {
  return theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

export function applyDark(dark: boolean): void {
  const root = document.documentElement;
  // Fade the colour change (one-shot — removed after the transition).
  root.classList.add("theme-transition");
  root.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? DARK : LIGHT);
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.classList.remove("theme-transition"), 320);
}
