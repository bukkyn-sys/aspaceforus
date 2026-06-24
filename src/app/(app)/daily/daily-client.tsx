"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { useEntitlement } from "@/contexts/entitlement-context";
import { getAccent } from "@/lib/accent-colors";
import { ownerTint } from "@/lib/owner-identity";
import { track } from "@/lib/analytics";
import { SignedImg } from "@/components/signed-img";

interface HistoryItem {
  moment_date: string;
  prompt_body: string;
  my_answer: string;
  partner_answer: string;
}

const PAGE = 20;

// The spine of the future "memories" feature: a permanent, scrollable timeline of
// every both-answered daily moment. Single-sided days never appear (and are never
// deleted). Cumulative — no streaks, no penalties.
export default function DailyHistoryClient() {
  const { me, partner, myName, partnerName } = useCouple();
  const { premium, openPaywall } = useEntitlement();
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);
  const supabase = useMemo(() => createClient(), []);
  // Free history window: the last 30 days; older shared moments are premium.
  const cutoffDate = new Date(Date.now() - 30 * 86400000);
  const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, "0")}-${String(cutoffDate.getDate()).padStart(2, "0")}`;

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(async (before: string | null) => {
    const { data } = await supabase.rpc("get_daily_history", { p_limit: PAGE, p_before: before ?? undefined });
    const rows = (data ?? []) as unknown as HistoryItem[];
    setHasMore(rows.length === PAGE);
    return rows;
  }, [supabase]);

  useEffect(() => {
    track("daily_history_opened");
    fetchPage(null).then((rows) => { setItems(rows); setLoading(false); }).catch(() => setLoading(false));
  }, [fetchPage]);

  async function loadMore() {
    if (loadingMore || !items.length) return;
    setLoadingMore(true);
    const rows = await fetchPage(items[items.length - 1].moment_date);
    setItems((prev) => [...prev, ...rows]);
    setLoadingMore(false);
  }

  const visible = premium ? items : items.filter((it) => it.moment_date >= cutoff);
  const hasLockedHistory = !premium && (hasMore || visible.length < items.length);

  return (
    <div className="pb-6 max-w-lg mx-auto px-4 pt-4">
      {/* Header */}
      <div className="hdr-float flex items-center gap-3 mb-6">
        <Link
          href="/home"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          aria-label="back to home"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="font-heading text-3xl text-foreground tracking-tight leading-tight">the daily.</h1>
          {!loading && visible.length > 0 && (
            <p className="text-xs text-muted-foreground/50">{visible.length}{(hasMore || hasLockedHistory) ? "+" : ""} shared moments</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="card p-4 h-28 animate-pulse bg-secondary/40" />)}
        </div>
      ) : visible.length === 0 && !hasLockedHistory ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted-foreground">no shared moments yet</p>
          <p className="text-xs text-muted-foreground/40 mt-1">answer today&apos;s daily on home — they&apos;ll gather here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((it) => (
            <div key={it.moment_date} className="card p-4">
              <p className="text-[11px] text-muted-foreground/50 mb-1.5">
                {new Date(it.moment_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="text-sm font-medium text-foreground leading-snug mb-3">{it.prompt_body}</p>
              <div className="space-y-2">
                <Row name={myName} url={me.avatar_url} hex={myAccent.hex} answer={it.my_answer} />
                <Row name={partnerName} url={partner?.avatar_url ?? null} hex={partnerAccent.hex} answer={it.partner_answer} />
              </div>
            </div>
          ))}

          {premium && hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full h-11 rounded-xl bg-secondary text-sm font-medium text-muted-foreground active:scale-[0.99] transition-transform disabled:opacity-60"
            >
              {loadingMore ? "loading…" : "load more"}
            </button>
          )}
          {hasLockedHistory && (
            <button onClick={() => openPaywall("history")} className="w-full card p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">your earlier moments are tucked away</p>
                <p className="text-xs text-muted-foreground mt-0.5">re-unlock premium to scroll your whole story together</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ name, url, hex, answer }: { name: string; url: string | null; hex: string; answer: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-full overflow-hidden bg-secondary flex-shrink-0"
        style={{ boxShadow: `0 0 0 2px ${hex}` }}>
        {url
          ? <SignedImg src={url} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-[9px] font-semibold text-muted-foreground">{name[0]?.toUpperCase()}</div>}
      </div>
      <div className="min-w-0 flex-1 rounded-2xl px-3 py-2" style={{ backgroundColor: ownerTint(hex) }}>
        <p className="text-[10px] text-muted-foreground/70 mb-0.5">{name}</p>
        <p className="text-sm text-foreground break-words leading-snug">{answer}</p>
      </div>
    </div>
  );
}
