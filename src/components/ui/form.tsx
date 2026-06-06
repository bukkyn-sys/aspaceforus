import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Shared form vocabulary ───────────────────────────────────────────────────
// One look across every form: centered section labels, full-width controls, and
// centered chip/emoji rows. Keeps the whole app's sheets cohesive and aligned.

/** Centered section label that sits above a control. */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-medium text-muted-foreground tracking-wide text-center mb-2.5", className)}>
      {children}
    </p>
  );
}

/** A labelled form field: centered label + full-width control(s). */
export function Field({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label != null && <FieldLabel>{label}</FieldLabel>}
      {children}
    </div>
  );
}

/** A centered, wrapping row of chips/emojis/toggles. */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap justify-center gap-2", className)}>{children}</div>;
}
