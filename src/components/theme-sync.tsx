"use client";

import { useEffect } from "react";
import { applyDark, type Theme } from "@/lib/theme";

// Mounted once at the app root. When the theme is "system" (or unset), this keeps
// the whole app — including onboarding, which has no theme control — in sync with
// OS light/dark changes live (class + status-bar colour + fade). The initial
// paint is handled by the inline script in layout; this only reacts to changes.
export default function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const t = (localStorage.getItem("theme") as Theme | null) ?? "system";
      if (t === "system") applyDark(mq.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return null;
}
