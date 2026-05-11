import { createClient } from "@/lib/supabase/server";
import { Bookmark, Receipt, CalendarDays } from "lucide-react";

interface Props { coupleId: string | null; }

type ActivityItem = {
  id: string;
  type: "vault" | "ledger" | "event";
  title: string;
  subtitle: string;
  createdAt: string;
};

const typeIcon = {
  vault: Bookmark,
  ledger: Receipt,
  event: CalendarDays,
};

const typeColor = {
  vault: "bg-sage-light text-sage",
  ledger: "bg-terracotta-light text-terracotta",
  event: "bg-secondary text-muted-foreground",
};

export default async function RecentActivity({ coupleId }: Props) {
  if (!coupleId) return null;

  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: vaultItems }, { data: ledgerItems }, { data: events }] =
    await Promise.all([
      supabase
        .from("vault_items")
        .select("id, title, created_at")
        .eq("couple_id", coupleId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("ledger_entries")
        .select("id, title, amount, created_at")
        .eq("couple_id", coupleId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("events")
        .select("id, title, start_at, created_at")
        .eq("couple_id", coupleId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const items: ActivityItem[] = [
    ...(vaultItems ?? []).map((v) => ({
      id: v.id,
      type: "vault" as const,
      title: v.title ?? "untitled",
      subtitle: "added to vault",
      createdAt: v.created_at,
    })),
    ...(ledgerItems ?? []).map((l) => ({
      id: l.id,
      type: "ledger" as const,
      title: l.title ?? "expense",
      subtitle: `£${parseFloat(l.amount).toFixed(2)}`,
      createdAt: l.created_at,
    })),
    ...(events ?? []).map((e) => ({
      id: e.id,
      type: "event" as const,
      title: e.title ?? "event",
      subtitle: new Date(e.start_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      createdAt: e.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  if (!items.length) return null;

  return (
    <div className="mt-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">
        recent activity
      </p>

      <div className="space-y-2">
        {items.map((item) => {
          const Icon = typeIcon[item.type];
          const color = typeColor[item.type];
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-border/50 shadow-card"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.subtitle}</p>
              </div>
              <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
                {new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
