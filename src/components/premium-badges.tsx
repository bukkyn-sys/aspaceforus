import { cn } from "@/lib/utils";

// Small identity pills. Inline hex (gold / violet) because the default Tailwind
// amber palette isn't compiled in this project's theme.
function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-wide"
      style={{ color, backgroundColor: `${color}22` }}
    >
      {label}
    </span>
  );
}

/**
 * Founding member badge (paid subscriber or lifetime). Renders nothing otherwise.
 */
export function PremiumBadges({
  founding, className,
}: {
  founding?: boolean;
  className?: string;
}) {
  if (!founding) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Pill label="founding" color="#D97706" />
    </span>
  );
}
