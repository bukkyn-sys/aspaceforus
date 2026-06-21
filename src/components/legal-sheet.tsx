"use client";

import { BottomSheet } from "@/components/ui/sheet";
import { LEGAL, type LegalDoc } from "@/lib/legal";

// Read-only viewer for the privacy policy / terms. Shared by onboarding (the
// acceptance gate) and settings (read any time).
export function LegalSheet({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const content = doc ? LEGAL[doc] : null;
  return (
    <BottomSheet open={doc !== null} onClose={onClose} title={content?.title ?? ""}>
      {content && (
        <div className="space-y-3 pb-2">
          <p className="text-xs text-muted-foreground/50">last updated · {content.updated}</p>
          {content.body.map((para, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed">{para}</p>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
