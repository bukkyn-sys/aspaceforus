"use client";

import { useState, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyDark, resolveDark, type Theme } from "@/lib/theme";

const OPTIONS: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "system", label: "auto", Icon: Monitor },
  { id: "light", label: "light", Icon: Sun },
  { id: "dark", label: "dark", Icon: Moon },
];

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(((localStorage.getItem("theme") as Theme) || "system"));
  }, []);
  // OS-change handling for "system" lives globally in <ThemeSync>.

  function choose(t: Theme) {
    setTheme(t);
    localStorage.setItem("theme", t);
    applyDark(resolveDark(t));
  }

  if (compact) {
    return (
      <div className="inline-flex gap-1 p-1 rounded-full bg-secondary" role="group" aria-label="theme">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => choose(id)}
            aria-pressed={theme === id}
            aria-label={`${label} theme`}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
              theme === id ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="card p-4 mb-4">
      <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">appearance</p>
      <div className="flex gap-2" role="group" aria-label="theme">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => choose(id)}
            aria-pressed={theme === id}
            aria-label={`${label} theme`}
            className={cn(
              "flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-colors",
              theme === id
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border/60"
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
