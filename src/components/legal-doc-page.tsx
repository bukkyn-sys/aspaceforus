import Link from "next/link";
import { LEGAL, type LegalDoc } from "@/lib/legal";

// Public, crawlable legal page (no auth) — required for Google OAuth verification
// and Stripe. Shares its copy with the in-app LegalSheet via lib/legal.ts.
export default function LegalDocPage({ doc }: { doc: LegalDoc }) {
  const { title, updated, body } = LEGAL[doc];
  return (
    <main className="min-h-dvh bg-background px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← us.</Link>
        <h1 className="font-heading text-4xl text-foreground tracking-tight mt-6">{title}</h1>
        <p className="text-xs text-muted-foreground/60 mt-2">last updated {updated}</p>
        <div className="mt-8 space-y-4">
          {body.map((p, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
          ))}
        </div>
        <div className="mt-12 text-xs text-muted-foreground/50">
          <Link href={doc === "privacy" ? "/terms" : "/privacy"} className="hover:text-muted-foreground transition-colors">
            {doc === "privacy" ? "terms of service" : "privacy policy"}
          </Link>
        </div>
      </div>
    </main>
  );
}
