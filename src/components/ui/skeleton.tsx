import { cn } from "@/lib/utils";

/** Shimmer placeholder rows — shown only on a first-ever visit to a screen
 *  (cached revisits render instantly), so a tab never opens to a blank flash. */
export function SkeletonRows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-secondary/60 animate-pulse" />
      ))}
    </div>
  );
}
