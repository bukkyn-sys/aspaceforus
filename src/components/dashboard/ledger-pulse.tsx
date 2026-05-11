import { createClient } from "@/lib/supabase/server";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { coupleId: string | null; }

export default async function LedgerPulse({ coupleId }: Props) {
  if (!coupleId) {
    return <Card value="£—" sub="no couple yet" neutral />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("couple_id", coupleId)
    .eq("settled", false);

  let youOwe = 0;
  let theyOwe = 0;

  for (const e of entries ?? []) {
    const amt = parseFloat(e.amount);
    const ratio = parseFloat(e.split_ratio ?? "0.5");
    if (e.paid_by !== user!.id) youOwe += amt * ratio;
    else theyOwe += amt * (1 - ratio);
  }

  const net = theyOwe - youOwe; // positive = they owe you, negative = you owe them
  const balanced = Math.abs(net) < 0.01;

  const display = balanced
    ? "all clear"
    : net > 0
    ? `+£${net.toFixed(2)}`
    : `-£${Math.abs(net).toFixed(2)}`;

  const sub = balanced
    ? "all settled up"
    : net > 0
    ? "they owe you"
    : "you owe them";

  return <Card value={display} sub={sub} positive={net > 0.01} negative={net < -0.01} neutral={balanced} />;
}

function Card({
  value,
  sub,
  positive,
  negative,
  neutral,
}: {
  value: string;
  sub: string;
  positive?: boolean;
  negative?: boolean;
  neutral?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 flex flex-col gap-2",
        positive && "bg-sage-light border border-sage/20",
        negative && "bg-terracotta-light border border-terracotta/20",
        neutral && "bg-white border border-border/50 shadow-card"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">ledger</p>
        <Receipt className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
      </div>

      <div>
        <p
          className={cn(
            "font-heading text-2xl leading-none mb-0.5",
            positive && "text-sage",
            negative && "text-terracotta",
            neutral && "text-muted-foreground"
          )}
        >
          {value}
        </p>
        <p
          className={cn(
            "text-xs font-medium",
            positive && "text-sage",
            negative && "text-terracotta",
            neutral && "text-muted-foreground"
          )}
        >
          {sub}
        </p>
      </div>
    </div>
  );
}
