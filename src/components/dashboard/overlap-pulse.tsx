import { createClient } from "@/lib/supabase/server";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { coupleId: string | null; }

type DayStatus = "free" | "busy" | null;

interface AvailRow {
  user_id: string;
  date: string;
  status: DayStatus;
}

function todayStr() { return new Date().toISOString().split("T")[0]; }
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export default async function OverlapPulse({ coupleId }: Props) {
  if (!coupleId) {
    return <PulseCard label="overlap" value="—" sub="connect first" />;
  }

  const supabase = await createClient();
  const today = todayStr();
  const tomorrow = tomorrowStr();

  const { data: avail } = await supabase
    .from("availability")
    .select("user_id, date, status")
    .eq("couple_id", coupleId)
    .in("date", [today, tomorrow]);

  const rows: AvailRow[] = avail ?? [];

  function getStatuses(date: string): DayStatus[] {
    return rows.filter((r) => r.date === date).map((r) => r.status);
  }

  const todayStatuses = getStatuses(today);
  const tomorrowStatuses = getStatuses(tomorrow);

  const isMatch = (statuses: DayStatus[]) =>
    statuses.length === 2 && statuses.every((s) => s === "free");

  const todayMatch = isMatch(todayStatuses);
  const tomorrowMatch = isMatch(tomorrowStatuses);

  const hasMatch = todayMatch || tomorrowMatch;
  const label = todayMatch ? "today" : tomorrowMatch ? "tomorrow" : "no match";

  return (
    <div
      className={cn(
        "rounded-2xl p-4 flex flex-col gap-2",
        hasMatch
          ? "bg-sage-light border border-sage/20"
          : "bg-white border border-border/50 shadow-card"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">overlap</p>
        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
      </div>

      <div>
        <p className={cn("font-heading text-2xl leading-none mb-0.5", hasMatch ? "text-sage" : "text-muted-foreground")}>
          {hasMatch ? "✓" : "—"}
        </p>
        <p className={cn("text-xs font-medium", hasMatch ? "text-sage" : "text-muted-foreground")}>
          {label}
        </p>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-1.5 mt-auto">
        <DayDot label="today" match={todayMatch} statuses={todayStatuses} />
        <DayDot label="tmrw" match={tomorrowMatch} statuses={tomorrowStatuses} />
      </div>
    </div>
  );
}

function DayDot({
  label,
  match,
  statuses,
}: {
  label: string;
  match: boolean;
  statuses: DayStatus[];
}) {
  const hasBusy = statuses.some((s) => s === "busy");
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={cn(
          "w-4 h-4 rounded-full",
          match ? "bg-sage" : hasBusy ? "bg-terracotta/50" : "bg-border"
        )}
      />
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

function PulseCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl p-4 bg-white border border-border/50 shadow-card flex flex-col gap-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <p className="font-heading text-2xl text-muted-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
