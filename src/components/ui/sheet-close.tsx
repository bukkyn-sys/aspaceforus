import { X } from "lucide-react";

/** Canonical close button for bottom sheets / modals. */
export function SheetClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="close"
      className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 -mr-1"
    >
      <X className="w-4 h-4" />
    </button>
  );
}
