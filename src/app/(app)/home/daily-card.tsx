"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getAccent } from "@/lib/accent-colors";
import { ownerTint } from "@/lib/owner-identity";
import { track } from "@/lib/analytics";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SignedImg } from "@/components/signed-img";
import { Pencil, ArrowRight, Sparkles } from "lucide-react";
import { submitDaily } from "@/app/(app)/daily/actions";

export interface DailyPrompt {
  id: string;
  kind: "question" | "this_or_that" | "reflect" | "tied";
  body: string;
  options: string[] | null;
  tags: string[];
  intimacy: number;
}
export interface DailyOnThisDay {
  year: number;
  prompt_body: string;
  my_answer: string | null;
  partner_answer: string | null;
}
export interface DailyData {
  paired: boolean;
  day_key?: string;
  moment_id?: string | null;
  prompt?: DailyPrompt | null;
  my_answer?: string | null;
  partner_answered?: boolean;
  partner_answer?: string | null;
  both_answered?: boolean;
  locked?: boolean;
  shared_count?: number;
  on_this_day?: DailyOnThisDay | null;
}

// Deep-link a `tied` prompt to the surface it references (advisory; the answer
// itself still flows through the normal reveal/lock path).
const TIED_LINK: Record<string, { href: string; label: string }> = {
  vault:       { href: "/vault",            label: "open the vault" },
  free_days:   { href: "/calendar",         label: "open the calendar" },
  pots:        { href: "/ledger?tab=pots",  label: "open savings pots" },
  countdowns:  { href: "/calendar",         label: "open the calendar" },
  ledger:      { href: "/ledger",           label: "open the ledger" },
};

// Cumulative buckets for analytics — never the raw count, never a streak.
function sharedBucket(n: number): string {
  if (n < 10) return "0-9";
  if (n < 50) return "10-49";
  if (n < 100) return "50-99";
  if (n < 365) return "100-364";
  return "365+";
}

export default function DailyCard({
  initial,
  onBroadcast,
  registerRefetch,
}: {
  initial: DailyData;
  onBroadcast: () => void;
  registerRefetch: (fn: () => void) => void;
}) {
  const { me, partner, myName, partnerName } = useCouple();
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const [d, setD] = useState<DailyData>(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  // Resync when Home reloads and hands down fresh data — but never stomp on an
  // in-progress edit/submit.
  const busyRef = useRef(false);
  busyRef.current = editing || submitting;
  useEffect(() => { if (!busyRef.current) setD(initial); }, [initial]);

  // Refetch through the GATED rpc (applies the reveal gate server-side). The
  // dashboard calls this when a content-free "partner answered" broadcast lands.
  const refetch = useCallback(async () => {
    if (!d.paired || !d.day_key) return;
    const { data } = await supabase.rpc("get_daily", { p_day_key: d.day_key });
    if (data && !busyRef.current) setD(data as DailyData);
  }, [d.paired, d.day_key, supabase]);
  useEffect(() => { registerRefetch(refetch); }, [registerRefetch, refetch]);

  async function submit(body: string, option: string | null) {
    if (!d.paired || !d.prompt || !d.day_key || submitting) return;
    const trimmed = option ?? body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setD((prev) => ({ ...prev, my_answer: trimmed })); // optimistic

    const res = await submitDaily({
      dayKey: d.day_key,
      body,
      option,
      coupleId: me.couple_id,
      actorName: myName,
    });
    setSubmitting(false);

    if ("error" in res) {
      toast("couldn't save — check your connection");
      refetch();
      return;
    }

    const next = res.data as unknown as DailyData & { completed_pair?: boolean };
    setD(next);
    setEditing(false);
    setDraft("");
    track("daily_answered", { kind: d.prompt.kind, intimacy: d.prompt.intimacy, prompt_id: d.prompt.id });
    if (next.completed_pair) track("daily_revealed", { shared_count: sharedBucket(next.shared_count ?? 0) });
    onBroadcast();
  }

  // ── State 0: unpaired ──────────────────────────────────────────────────────
  if (!d.paired) {
    return (
      <div className="card p-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide mb-2">the daily</p>
        <p className="text-sm text-muted-foreground">the daily wakes up when {partnerName} joins.</p>
        <p className="text-xs text-muted-foreground/40 mt-1">one small question a day, just the two of you.</p>
      </div>
    );
  }

  const prompt = d.prompt!;
  const isChoice = prompt.kind === "this_or_that";
  const answered = !!d.my_answer;
  const tied = prompt.kind === "tied" ? prompt.tags.map((t) => TIED_LINK[t]).find(Boolean) : undefined;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground font-medium tracking-wide">the daily</p>
        <Link href="/daily" className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          history
        </Link>
      </div>

      <p className="text-[15px] font-medium text-foreground leading-snug mb-3">{prompt.body}</p>

      {/* ── State 3: both answered (revealed, locked) ── */}
      {d.both_answered ? (
        <div className="space-y-2.5">
          <AnswerRow name={myName} url={me.avatar_url} hex={myAccent.hex} answer={d.my_answer ?? ""} />
          <AnswerRow name={partnerName} url={partner?.avatar_url ?? null} hex={partnerAccent.hex} answer={d.partner_answer ?? ""} />
          {(d.shared_count ?? 0) >= 3 && (
            <p className="text-xs text-muted-foreground/50 text-center pt-1">
              you&apos;ve shared {d.shared_count} daily moments
            </p>
          )}
        </div>
      ) : answered && !editing ? (
        /* ── State 2: answered, waiting on partner (editable) ── */
        <div className="space-y-2.5">
          <AnswerRow name={myName} url={me.avatar_url} hex={myAccent.hex} answer={d.my_answer ?? ""} />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground/60">waiting on {partnerName}…</p>
            <button
              onClick={() => { setDraft(isChoice ? "" : (d.my_answer ?? "")); setEditing(true); }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" /> edit
            </button>
          </div>
        </div>
      ) : (
        /* ── State 1 (or editing): input ── */
        <div className="space-y-2.5">
          {d.partner_answered && !editing && (
            <p className="text-xs text-sage">{partnerName}&apos;s answered — your turn.</p>
          )}

          {isChoice ? (
            <div className="grid grid-cols-2 gap-2">
              {(prompt.options ?? []).map((opt) => {
                const selected = d.my_answer === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => submit(opt, opt)}
                    disabled={submitting}
                    aria-pressed={selected}
                    className={cn(
                      "h-12 rounded-2xl text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-60",
                      selected ? "text-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                    style={selected ? { backgroundColor: ownerTint(myAccent.hex) } : undefined}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={280}
                rows={2}
                aria-label={prompt.body}
                placeholder="your answer…"
                className="w-full text-sm text-foreground placeholder:text-muted-foreground/40 bg-secondary rounded-2xl px-3.5 py-3 resize-none outline-none leading-relaxed focus:ring-1 focus:ring-foreground/15"
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => submit(draft, null)}
                  disabled={!draft.trim() || submitting}
                  className="flex-1 h-11 rounded-xl text-sm font-medium"
                >
                  {editing ? "save" : "share"}
                </Button>
                {editing && (
                  <button onClick={() => { setEditing(false); setDraft(""); }} className="px-3 h-11 text-sm text-muted-foreground">
                    cancel
                  </button>
                )}
              </div>
            </>
          )}

          {tied && !editing && (
            <Link
              href={tied.href}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              {tied.label} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      )}

      {/* ── State 4: on this day ── */}
      {d.on_this_day && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 mb-1.5">
            <Sparkles className="w-3 h-3" /> a year ago today
          </p>
          <p className="text-xs text-muted-foreground/70 italic mb-1.5">{d.on_this_day.prompt_body}</p>
          <div className="space-y-1">
            <p className="text-xs text-foreground/80"><span className="text-muted-foreground/50">{myName}: </span>{d.on_this_day.my_answer}</p>
            <p className="text-xs text-foreground/80"><span className="text-muted-foreground/50">{partnerName}: </span>{d.on_this_day.partner_answer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AnswerRow({ name, url, hex, answer }: { name: string; url: string | null; hex: string; answer: string }) {
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary flex-shrink-0 mt-0.5"
        style={{ boxShadow: `0 0 0 2px ${hex}` }}>
        {url
          ? <SignedImg src={url} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-muted-foreground">{name[0]?.toUpperCase()}</div>}
      </div>
      <div className="min-w-0 flex-1 rounded-2xl px-3 py-2" style={{ backgroundColor: ownerTint(hex) }}>
        <p className="text-[10px] text-muted-foreground/70 mb-0.5">{name}</p>
        <p className="text-sm text-foreground break-words leading-snug">{answer}</p>
      </div>
    </div>
  );
}
