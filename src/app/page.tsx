import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Signed-in visitors go straight to the app; everyone else sees the public
// landing page (also what crawlers and link-preview bots get).
export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/home");

  const features = [
    { emoji: "💭", title: "moods & the daily", body: "check in, and answer one shared question a day — revealed only once you both have." },
    { emoji: "📅", title: "find time together", body: "mark your free days and see where they overlap at a glance." },
    { emoji: "💸", title: "keep it square", body: "log shared costs and savings pots without spreadsheets." },
    { emoji: "🌹", title: "your shared vault", body: "photos, date ideas, wishlists and to-dos — just for the two of you." },
  ];

  return (
    <main className="min-h-dvh bg-background flex flex-col items-center px-6">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center max-w-md w-full py-16">
        <span className="font-heading text-6xl text-foreground tracking-tight">us.</span>
        <p className="font-heading text-2xl text-foreground/80 tracking-tight mt-4">just the two of you</p>
        <p className="text-sm text-muted-foreground leading-relaxed mt-3 max-w-xs">
          a private little home for your relationship — moods, plans, money and
          memories, shared between two people and no one else.
        </p>
        <Link
          href="/auth/login"
          className="mt-8 h-12 px-8 inline-flex items-center rounded-2xl bg-foreground text-background text-sm font-medium active:scale-[0.98] transition-transform"
        >
          open us.
        </Link>
      </section>

      {/* Features */}
      <section className="w-full max-w-md grid gap-3 pb-12">
        {features.map((f) => (
          <div key={f.title} className="card p-4 flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5" aria-hidden>{f.emoji}</span>
            <div>
              <p className="text-sm font-medium text-foreground">{f.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{f.body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="w-full max-w-md py-8 flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
        <Link href="/privacy" className="hover:text-muted-foreground transition-colors">privacy</Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-muted-foreground transition-colors">terms</Link>
        <span aria-hidden>·</span>
        <a href="mailto:bukkyn@gmail.com" className="hover:text-muted-foreground transition-colors">contact</a>
      </footer>
    </main>
  );
}
