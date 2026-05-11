import { createClient } from "@/lib/supabase/server";
import HeroWidget from "@/components/dashboard/hero-widget";
import OverlapPulse from "@/components/dashboard/overlap-pulse";
import LedgerPulse from "@/components/dashboard/ledger-pulse";
import RecentActivity from "@/components/dashboard/recent-activity";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch profile + couple
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, couples(*)")
    .eq("id", user!.id)
    .single();

  const coupleId = profile?.couple_id ?? null;
  const firstName = profile?.display_name?.split(" ")[0] ?? "there";

  // Time-of-day greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "good morning" : hour < 17 ? "good afternoon" : "good evening";

  return (
    <div className="px-4 pt-10 pb-4 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground font-medium mb-0.5">{greeting},</p>
        <h1 className="font-heading text-3xl text-foreground tracking-tight">{firstName}.</h1>
      </div>

      {/* Hero — top-level hype widget */}
      <HeroWidget coupleId={coupleId} />

      {/* Pulse row */}
      <div className="grid grid-cols-2 gap-3">
        <OverlapPulse coupleId={coupleId} />
        <LedgerPulse coupleId={coupleId} />
      </div>

      {/* Recent activity feed */}
      <RecentActivity coupleId={coupleId} />
    </div>
  );
}
