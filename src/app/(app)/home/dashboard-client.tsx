"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { setMood, updateNote, setStartedAt, addCountdown, deleteCountdown } from "./actions";
import Link from "next/link";
import { Plane, X, Heart, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

const COUNTDOWN_TYPES = [
  { label: "holiday",     emoji: "✈️" },
  { label: "date night",  emoji: "🍽️" },
  { label: "anniversary", emoji: "❤️" },
  { label: "concert",     emoji: "🎵" },
  { label: "birthday",    emoji: "🎂" },
  { label: "moving",      emoji: "🏠" },
  { label: "wedding",     emoji: "💍" },
  { label: "other",       emoji: "🗓️" },
];

interface Countdown { id: string; title: string; target_date: string; end_date?: string | null; emoji: string; }

interface DashboardData {
  myMood: number | null;
  myMoodAt: string | null;
  partnerMood: number | null;
  partnerMoodAt: string | null;
  sharedNote: string;
  startedAt: string | null;
  bannerUrl: string | null;
  countdowns: Countdown[];
  inviteCode: string | null;
  partnerAction: { text: string; at: string } | null;
  freeDays: string[];
}

function timeUntil(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00");
  const ms = Math.max(0, target.getTime() - Date.now());
  const totalHours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

function daysUntil(dateStr: string) {
  return timeUntil(dateStr).days;
}

function duration(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  const parts = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
  return parts.join(", ") || "less than a month";
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "good morning" : h < 17 ? "good afternoon" : "good evening";
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type DashCache = { data: DashboardData; hasPartner: boolean };

export default function DashboardClient() {
  const { coupleId, me, partner, myName, partnerName } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const [data, setData] = useState<DashboardData>(() => {
    const c = getCache<DashCache>(`dash:${coupleId}`);
    return c?.data ?? {
      myMood: null, myMoodAt: null, partnerMood: null, partnerMoodAt: null,
      sharedNote: "", startedAt: null, bannerUrl: null, countdowns: [], inviteCode: null, partnerAction: null, freeDays: [],
    };
  });
  const [hasPartner, setHasPartner] = useState(() => getCache<DashCache>(`dash:${coupleId}`)?.hasPartner ?? false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loading, setLoading] = useState(() => getCache<DashCache>(`dash:${coupleId}`) === undefined);
  const [showCountdownSheet, setShowCountdownSheet] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [, startTransition] = useTransition();

  // Countdown form
  const [cdTitle, setCdTitle] = useState("");
  const [cdDate, setCdDate] = useState("");
  const [cdEndDate, setCdEndDate] = useState("");
  const [cdEmoji, setCdEmoji] = useState("✈️");
  const [cdCustomEmoji, setCdCustomEmoji] = useState("");

  useRegisterFab(() => {
    setCdTitle(""); setCdDate(""); setCdEndDate(""); setCdEmoji("✈️"); setCdCustomEmoji("");
    setShowCountdownSheet(true);
  });

  // Note debounce ref
  useEffect(() => { markSeen("home"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.style.overflow = (showCountdownSheet || showDatePicker) ? "hidden" : "";
  }, [showCountdownSheet, showDatePicker]);

  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const today = new Date().toISOString().split("T")[0];
      const in60 = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];

      const [
        { data: myProfile }, { data: partnerProfile }, { data: coupleData }, { data: countdowns },
        { data: pCalEvent }, { data: pVaultItem }, { data: pLedgerEntry }, { data: availData },
        { data: pAvail },
      ] = await Promise.all([
        supabase.rpc("get_my_profile", { p_user_id: me.id }),
        supabase.rpc("get_partner_profile", { p_couple_id: coupleId, p_my_id: me.id }),
        supabase.from("couples").select("shared_note, started_at, invite_code, banner_url").eq("id", coupleId).single(),
        supabase.from("countdowns").select("id, title, target_date, end_date, emoji").eq("couple_id", coupleId)
          .eq("archived", false).gte("target_date", today).order("target_date"),
        supabase.from("events").select("title, start_at, created_at").eq("couple_id", coupleId)
          .neq("created_by", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("vault_items").select("title, type, created_at").eq("couple_id", coupleId)
          .neq("created_by", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("ledger_entries").select("title, created_at").eq("couple_id", coupleId)
          .neq("paid_by", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("availability").select("date, user_id, status").eq("couple_id", coupleId)
          .gte("date", today).lte("date", in60),
        supabase.from("availability").select("date, status, created_at").eq("couple_id", coupleId)
          .neq("user_id", me.id).not("status", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const partner = partnerProfile as { id: string; current_mood: number | null; mood_updated_at: string | null } | null;
      const me_ = myProfile as { current_mood: number | null; mood_updated_at: string | null } | null;

      // Determine most recent partner action
      const candidates: { text: string; at: string }[] = [];
      if (pCalEvent && "created_at" in pCalEvent) candidates.push({ text: "added to the calendar", at: (pCalEvent as { created_at: string }).created_at });
      if (pAvail && "created_at" in pAvail) candidates.push({ text: "updated their calendar", at: (pAvail as { created_at: string }).created_at });
      if (pVaultItem && "created_at" in pVaultItem) {
        const v = pVaultItem as { type: string; created_at: string };
        candidates.push({ text: `added to ${v.type === "wishlist" ? "the wishlist" : "date ideas"}`, at: v.created_at });
      }
      if (pLedgerEntry && "created_at" in pLedgerEntry) candidates.push({ text: "logged an expense", at: (pLedgerEntry as { created_at: string }).created_at });
      if (partner?.mood_updated_at) candidates.push({ text: "updated their mood", at: partner.mood_updated_at });
      candidates.sort((a, b) => b.at.localeCompare(a.at));
      const partnerAction = candidates[0] ?? null;

      // Compute next 3 shared free days (both explicitly "free")
      type AvailRow = { date: string; user_id: string; status: string };
      const avail = (availData as AvailRow[]) ?? [];
      const freeDays: string[] = [];
      if (partner) {
        const cursor = new Date(today + "T12:00:00");
        const end = new Date(in60 + "T12:00:00");
        while (cursor <= end && freeDays.length < 3) {
          const ds = cursor.toISOString().split("T")[0];
          const myFree = avail.find((r) => r.user_id === me.id && r.date === ds)?.status === "free";
          const theirFree = avail.find((r) => r.user_id === partner.id && r.date === ds)?.status === "free";
          if (myFree && theirFree) freeDays.push(ds);
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      const newData: DashboardData = {
        myMood: me_?.current_mood ?? null,
        myMoodAt: me_?.mood_updated_at ?? null,
        partnerMood: partner?.current_mood ?? null,
        partnerMoodAt: partner?.mood_updated_at ?? null,
        sharedNote: coupleData?.shared_note ?? "",
        startedAt: coupleData?.started_at ?? null,
        bannerUrl: coupleData?.banner_url ?? null,
        inviteCode: coupleData?.invite_code ?? null,
        countdowns: (countdowns as Countdown[]) ?? [],
        partnerAction,
        freeDays,
      };
      const hasP = !!partner;
      setHasPartner(hasP);
      setData(newData);
      setLoading(false);
      setCache(`dash:${coupleId}`, { data: newData, hasPartner: hasP });
    }

    load();

    // Realtime: note via postgres_changes, moods via broadcast (RLS blocks postgres_changes on profiles)
    const channel = supabase.channel(`dash-${coupleId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "couples", filter: `id=eq.${coupleId}` },
        (p) => setData((prev) => ({ ...prev, sharedNote: p.new.shared_note ?? "", startedAt: p.new.started_at ?? null })))
      .on("broadcast", { event: "mood" },
        ({ payload }: { payload: { user_id: string; mood: number; at: string } }) => {
          if (payload.user_id === me.id) setData((prev) => ({ ...prev, myMood: payload.mood, myMoodAt: payload.at }));
          else setData((prev) => ({ ...prev, partnerMood: payload.mood, partnerMoodAt: payload.at }));
        })
      // Still listen for profile inserts to detect when partner first joins
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => {
          if (p.new?.couple_id === coupleId && p.new?.id !== me.id) {
            setHasPartner(true);
          }
        })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [coupleId, me.id, partner]);

  function handleMood(mood: number) {
    const at = new Date().toISOString();
    setData((prev) => ({ ...prev, myMood: mood, myMoodAt: at }));
    channelRef.current?.send({ type: "broadcast", event: "mood", payload: { user_id: me.id, mood, at } });
    startTransition(() => { setMood(me.id, mood); });
  }

  function handleNote(val: string) {
    setData((prev) => ({ ...prev, sharedNote: val }));
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      startTransition(() => { updateNote(coupleId, me.id, val); });
    }, 600);
  }

  function handleSetStarted(date: string) {
    setData((prev) => ({ ...prev, startedAt: date }));
    setShowDatePicker(false);
    startTransition(() => { setStartedAt(coupleId, me.id, date); });
  }

  function handleAddCountdown() {
    if (!cdTitle.trim() || !cdDate) return;
    const cd: Countdown = { id: crypto.randomUUID(), title: cdTitle.trim(), target_date: cdDate, end_date: cdEndDate || null, emoji: cdEmoji };
    setData((prev) => ({
      ...prev,
      countdowns: [...prev.countdowns, cd].sort((a, b) => a.target_date.localeCompare(b.target_date)),
    }));
    setCdTitle(""); setCdDate(""); setCdEndDate(""); setCdEmoji("✈️"); setCdCustomEmoji(""); setShowCountdownSheet(false);
    markActivity("home");
    startTransition(() => { addCountdown({ coupleId, userId: me.id, title: cd.title, targetDate: cdDate, endDate: cdEndDate || null, emoji: cdEmoji }); });
  }

  function handleDeleteCountdown(id: string) {
    setData((prev) => ({ ...prev, countdowns: prev.countdowns.filter((c) => c.id !== id) }));
    startTransition(() => { deleteCountdown(id, coupleId); });
  }

  const today = new Date().toISOString().split("T")[0];
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const DeleteBtn = ({ id, size = "md" }: { id: string; size?: "sm" | "md" }) => (
    <button
      onClick={() => handleDeleteCountdown(id)}
      className={cn(
        "rounded-full flex items-center justify-center bg-black/5 hover:bg-black/10 transition-colors flex-shrink-0",
        size === "sm" ? "w-6 h-6" : "w-7 h-7"
      )}
    >
      <X className={cn("text-foreground/40", size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5")} />
    </button>
  );

  const RectCard = ({ cd }: { cd: Countdown }) => {
    const t = timeUntil(cd.target_date);
    return (
      <div className="bg-white border border-border/50 rounded-3xl overflow-hidden shadow-card">
        <div className="h-1 bg-foreground/10" />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-0 pr-3">
              <span className="text-lg leading-none flex-shrink-0">{cd.emoji}</span>
              <h2 className="font-heading text-lg text-foreground leading-tight truncate">{cd.title}</h2>
            </div>
            <DeleteBtn id={cd.id} />
          </div>
          <div className="flex items-baseline gap-x-2 flex-wrap">
            <span className="font-heading text-7xl leading-none text-foreground">{t.days}</span>
            <span className="font-heading text-2xl text-foreground/25 mr-3">days</span>
            <span className="font-heading text-7xl leading-none text-foreground">{t.hours}</span>
            <span className="font-heading text-2xl text-foreground/25">hours</span>
          </div>
          <p className="text-xs text-muted-foreground/35 mt-3 tabular-nums">
            {new Date(cd.target_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: cd.end_date ? undefined : "numeric" })}
            {cd.end_date && ` – ${new Date(cd.end_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
          </p>
        </div>
      </div>
    );
  };

  const SquareCard = ({ cd, small }: { cd: Countdown; small?: boolean }) => {
    const t = timeUntil(cd.target_date);
    return (
      <div
        className={cn(
          "bg-white border border-border/50 rounded-2xl overflow-hidden shadow-card",
          small && "w-36 flex-shrink-0"
        )}
      >
        <div className="h-1 bg-foreground/10" />
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xl leading-none">{cd.emoji}</span>
            <DeleteBtn id={cd.id} size="sm" />
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span
              className={cn("font-heading leading-none text-foreground", small ? "text-4xl" : "text-5xl")}
            >
              {t.days}
            </span>
            <span className={cn("font-heading text-foreground/25", small ? "text-base" : "text-xl")}>days</span>
          </div>
          <p className={cn("text-foreground/50 font-medium truncate", small ? "text-[10px]" : "text-xs")}>
            {cd.title}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-6 max-w-lg mx-auto">
      {/* Banner — always visible, "us." logo centred */}
      <div className="relative w-full h-44 overflow-hidden">
        {data.bannerUrl ? (
          <img src={data.bannerUrl} alt="couple" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-secondary to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-background/85" />
        <div className="absolute inset-0 flex items-center justify-center">
          <p className={cn(
            "font-heading text-5xl tracking-tight select-none",
            data.bannerUrl ? "text-white drop-shadow" : "text-foreground/20"
          )}>us.</p>
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{greeting()}</p>
          <h1 className="font-heading text-3xl text-foreground tracking-tight leading-tight">{myName}.</h1>
          {hasPartner && data.partnerAction ? (
            <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-tight">
              {partnerName} {data.partnerAction.text}
              <span className="text-muted-foreground/35"> · {timeAgo(data.partnerAction.at)}</span>
            </p>
          ) : null}
          {data.startedAt ? (
            <button onClick={() => setShowDatePicker(true)} className="flex items-center gap-1 text-[11px] text-muted-foreground/40 mt-1 hover:text-muted-foreground/60 transition-colors">
              <Heart className="w-2.5 h-2.5 text-terracotta/60" fill="currentColor" />
              {duration(data.startedAt)}
            </button>
          ) : !loading && (
            <button onClick={() => setShowDatePicker(true)} className="text-[11px] text-muted-foreground/40 underline underline-offset-2 mt-0.5">
              add start date
            </button>
          )}
        </div>
        <Link
          href="/profile"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="profile"
        >
          <User className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      </div>

      {/* Mood card */}
      <div className="bg-white border border-border/50 rounded-3xl p-4 shadow-card">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">how are you both?</p>
        <div className="space-y-3">
          {/* My mood */}
          <div className="flex items-center gap-3">
            <div className="w-20 flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary flex-shrink-0"
                style={{ boxShadow: `0 0 0 2px ${myAccent.hex}` }}>
                {me.avatar_url
                  ? <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-muted-foreground">{myName[0]?.toUpperCase()}</div>}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{myName}</p>
                {timeAgo(data.myMoodAt) && <p className="text-[9px] text-muted-foreground/50 leading-tight">{timeAgo(data.myMoodAt)}</p>}
              </div>
            </div>
            <div className="flex gap-1.5 flex-1">
              {MOODS.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleMood(i + 1)}
                  className={cn(
                    "flex-1 text-lg py-1 rounded-xl transition-all",
                    data.myMood === i + 1 ? "scale-110" : "opacity-40 hover:opacity-70"
                  )}
                  style={data.myMood === i + 1 ? { backgroundColor: myAccent.light } : undefined}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          {/* Partner mood */}
          {hasPartner && (
            <div className="flex items-center gap-3">
              <div className="w-20 flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary flex-shrink-0"
                  style={{ boxShadow: `0 0 0 2px ${partnerAccent.hex}` }}>
                  {partner?.avatar_url
                    ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-muted-foreground">{partnerName[0]?.toUpperCase()}</div>}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">{partnerName}</p>
                  {timeAgo(data.partnerMoodAt) && <p className="text-[9px] text-muted-foreground/50 leading-tight">{timeAgo(data.partnerMoodAt)}</p>}
                </div>
              </div>
              <div className="flex gap-1.5 flex-1">
                {MOODS.map((emoji, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 text-lg py-1 rounded-xl text-center",
                      data.partnerMood === i + 1 ? "" : "opacity-20"
                    )}
                    style={data.partnerMood === i + 1 ? { backgroundColor: partnerAccent.light } : undefined}
                  >
                    {emoji}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!loading && !hasPartner && data.inviteCode && (
            <div className="flex items-center justify-between bg-secondary rounded-2xl px-3 py-2.5">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">share this code with your partner</p>
                <p className="font-mono text-base font-semibold tracking-widest text-foreground">{data.inviteCode}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(data.inviteCode!);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-3"
              >
                {codeCopied ? "copied!" : "copy"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Shared note — post-it */}
      <div
        className="rounded-sm px-4 pt-4 pb-4 relative"
        style={{
          backgroundColor: "#FEFCE8",
          boxShadow: "3px 5px 16px rgba(0,0,0,0.10), inset 0 -1px 0 rgba(202,138,4,0.15)",
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-2 rounded-t-sm" style={{ backgroundColor: "#FDE68A" }} />
        <p className="text-[10px] text-amber-600/60 font-medium uppercase tracking-wider mb-2">shared note</p>
        <textarea
          value={data.sharedNote}
          onChange={(e) => handleNote(e.target.value)}
          placeholder="jot something for both of you to see…"
          className="w-full text-sm text-amber-950/70 placeholder:text-amber-900/30 bg-transparent resize-none outline-none leading-relaxed min-h-[80px]"
          rows={3}
        />
      </div>

      {/* Countdowns */}
      {!loading && (
        data.countdowns.length === 0 ? (
          <button
            onClick={() => setShowCountdownSheet(true)}
            className="w-full rounded-3xl border border-dashed border-border/60 p-8 text-center transition-colors hover:border-border bg-secondary/40"
          >
            <Plane className="w-6 h-6 mx-auto mb-2 text-muted-foreground/30" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">nothing to look forward to yet</p>
            <p className="text-xs text-muted-foreground/40 mt-0.5">tap + to add a countdown</p>
          </button>
        ) : data.countdowns.length === 1 ? (
          <RectCard cd={data.countdowns[0]} />
        ) : data.countdowns.length === 2 ? (
          <div className="grid grid-cols-2 gap-3">
            {data.countdowns.map((cd) => <SquareCard key={cd.id} cd={cd} />)}
          </div>
        ) : (
          <>
            <RectCard cd={data.countdowns[0]} />
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 mt-3 pb-1" style={{ scrollbarWidth: "none" }}>
              {data.countdowns.slice(1).map((cd) => <SquareCard key={cd.id} cd={cd} small />)}
            </div>
          </>
        )
      )}

      {/* Next free days */}
      {!loading && hasPartner && (
        <div className="bg-white border border-border/50 rounded-3xl p-4 shadow-card">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">next free days</p>
          {data.freeDays.length === 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">no overlapping free days in the next 60 days</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">mark days on the calendar to find overlaps</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.freeDays.map((ds) => {
                const d = new Date(ds + "T12:00:00");
                const diff = Math.round((d.getTime() - Date.now()) / 86400000);
                return (
                  <div key={ds} className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                    </p>
                    <span className="text-xs font-medium text-sage">
                      in {diff} day{diff !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Date picker sheet (started_at) */}
      {showDatePicker && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDatePicker(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">when did you get together?</p>
              <button onClick={() => setShowDatePicker(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <Input
              type="date"
              defaultValue={data.startedAt ?? ""}
              max={today}
              onChange={(e) => e.target.value && handleSetStarted(e.target.value)}
              className="h-11 rounded-xl bg-white border-border/60"
            />
          </div>
        </div>
      )}

      {/* Add countdown sheet */}
      {showCountdownSheet && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCountdownSheet(false)} />
          <div className="relative bg-background rounded-t-[28px] flex flex-col" style={{ maxHeight: "90dvh" }}>
            {/* Drag handle */}
            <div className="flex justify-center pt-3 flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-border/60" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
              <p className="text-base font-semibold">new countdown</p>
              <button
                onClick={() => setShowCountdownSheet(false)}
                className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4 space-y-5">
              {/* Type grid */}
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2.5">type</p>
                <div className="grid grid-cols-4 gap-2">
                  {COUNTDOWN_TYPES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => {
                        setCdEmoji(t.emoji); setCdCustomEmoji("");
                        const isDefault = !cdTitle || COUNTDOWN_TYPES.some((ct) => ct.label === cdTitle);
                        if (isDefault) setCdTitle(t.label);
                      }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-medium transition-all",
                        cdEmoji === t.emoji && !cdCustomEmoji
                          ? "bg-foreground text-background"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <span className="text-xl leading-none">{t.emoji}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Title */}
              <Input
                value={cdTitle}
                onChange={(e) => setCdTitle(e.target.value)}
                placeholder="give it a name"
                className="h-12 rounded-2xl bg-secondary border-0 text-[15px]"
              />
              {/* Dates */}
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2.5">dates</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative rounded-2xl overflow-hidden">
                    <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">starts</p>
                      <p className={cn("text-sm font-medium", cdDate ? "text-foreground" : "text-muted-foreground/40")}>
                        {cdDate ? new Date(cdDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                      </p>
                    </div>
                    <input type="date" value={cdDate} min={today} onChange={(e) => setCdDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
                  </div>
                  <div className="relative rounded-2xl overflow-hidden">
                    <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">ends <span className="normal-case font-normal opacity-50">(optional)</span></p>
                      <p className={cn("text-sm font-medium", cdEndDate ? "text-foreground" : "text-muted-foreground/40")}>
                        {cdEndDate ? new Date(cdEndDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                      </p>
                    </div>
                    <input type="date" value={cdEndDate} min={cdDate || today} onChange={(e) => setCdEndDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
                  </div>
                </div>
              </div>
            </div>
            {/* Pinned submit */}
            <div className="px-6 pt-3 flex-shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
              <Button onClick={handleAddCountdown} disabled={!cdTitle.trim() || !cdDate} className="w-full h-12 rounded-2xl text-[15px]">
                add countdown
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
