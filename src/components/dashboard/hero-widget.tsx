import { createClient } from "@/lib/supabase/server";
import { Plane } from "lucide-react";

interface Props { coupleId: string | null; }

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86_400_000));
}

export default async function HeroWidget({ coupleId }: Props) {
  if (!coupleId) return <HeroEmpty />;

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Next countdown / trip
  const { data: countdowns } = await supabase
    .from("countdowns")
    .select("*")
    .eq("couple_id", coupleId)
    .eq("archived", false)
    .gte("target_date", today)
    .order("target_date")
    .limit(1);

  const next = countdowns?.[0];
  if (!next) return <HeroEmpty />;

  const days = daysUntil(next.target_date);

  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-foreground text-background p-6"
      style={{ boxShadow: "0 8px 30px rgb(0 0 0 / 0.12)" }}
    >
      {/* Decorative blob */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
      <div className="absolute -bottom-12 -right-4 w-56 h-56 rounded-full bg-white/[0.03]" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <p className="text-background/60 text-xs font-medium uppercase tracking-widest">next adventure</p>
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
            <span className="text-base leading-none">{next.emoji ?? "✈️"}</span>
          </div>
        </div>

        <h2 className="font-heading text-2xl text-background mb-1 tracking-tight">{next.title}</h2>
        <p className="text-background/50 text-sm mb-6">
          {new Date(next.target_date + "T12:00:00").toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>

        {/* Countdown */}
        <div className="flex items-end gap-1">
          <span className="font-heading text-5xl text-background leading-none">{days}</span>
          <span className="text-background/60 text-sm mb-1.5">days to go</span>
        </div>
      </div>
    </div>
  );
}

function HeroEmpty() {
  return (
    <div className="rounded-3xl bg-foreground/5 border border-border/50 p-6 text-center">
      <Plane className="w-8 h-8 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">no trips planned yet</p>
      <p className="text-xs text-muted-foreground/70 mt-1">add a countdown to see it here</p>
    </div>
  );
}
