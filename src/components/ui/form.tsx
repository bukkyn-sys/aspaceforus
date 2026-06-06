import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Shared form vocabulary ───────────────────────────────────────────────────
// One look across every form (matching the to-do sheet): left-aligned section
// labels, and controls that fill the FULL width of the sheet in tidy even rows.

/** Left-aligned section label that sits above a control. */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-medium text-muted-foreground tracking-wide mb-2", className)}>
      {children}
    </p>
  );
}

/** A labelled form field: left label + full-width control(s). */
export function Field({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label != null && <FieldLabel>{label}</FieldLabel>}
      {children}
    </div>
  );
}

/**
 * A single row of equal-width chips/buttons that fills the form width. Children
 * are stretched to share the row evenly (flex-1) and never wrap to a second line.
 */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex gap-2 [&>*]:flex-1 [&>*]:min-w-0", className)}>{children}</div>;
}
