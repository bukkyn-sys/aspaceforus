"use client";

import { cn } from "@/lib/utils";

/**
 * Date picker that looks consistent on every platform: a styled box shows the
 * formatted date, with a transparent native <input type="date"> overlaid on top
 * as the tap target. (Raw native date inputs render with their own misaligned,
 * overflowing styling — this is the same approach the countdown form uses.)
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  placeholder = "select",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
}) {
  const label = value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : placeholder;

  return (
    <div className={cn("relative h-11 rounded-xl bg-card border border-border/60 overflow-hidden", className)}>
      <div className="absolute inset-0 flex items-center px-3.5 pointer-events-none">
        <span className={cn("text-sm", value ? "text-foreground" : "text-muted-foreground/50")}>{label}</span>
      </div>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="select a date"
      />
    </div>
  );
}
