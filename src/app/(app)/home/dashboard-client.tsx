"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { setMood, updateNote, setStartedAt, addCountdown, updateCountdown, deleteCountdown } from "./actions";
import Link from "next/link";
import { Plane, Heart, User, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";
import { ownerTint } from "@/lib/owner-identity";
import { HomeBanner } from "@/components/home-banner";

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
const MOOD_LABELS = ["very low", "low", "okay", "good", "great"];

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

interface Countdown { id: string; title: string; target_date: string; end_date?: string | null; emoji: string; created_by: string; }
interface PotMini { id: string; title: string; saved: number; goal: number; currency: string; }

interface DashboardData {
  myMood: number | null;
  myMoodAt: string | null;
  partnerMood: number | null;
  partnerMoodAt: string | null;
  sharedNote: string;
  startedAt: string | null;
  bannerUrl: string | null;
  bannerFocus: number;
  countdowns: Countdown[];
  inviteCode: string | null;
  partnerAction: { text: string; at: string } | null;
  freeDays: string[];
  balance: number;   // + means partner owes you, − means you owe partner
  pots: PotMini[];
}

function timeUntil(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00");
  const ms = Math.max(0, target.getTime() - Date.now());
  const totalHours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
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
  const { coupleId, me, partner, myName, partnerName, currency } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const [data, setData] = useState<DashboardData>(() => {
    const c = getCache<DashCache>(`dash:${coupleId}`);
    return c?.data ?? {
      myMood: null, myMoodAt: null, partnerMood: null, partnerMoodAt: null,
      sharedNote: "", startedAt: null, bannerUrl: null, bannerFocus: 50, countdowns: [], inviteCode: null, partnerAction: null, freeDays: [], balance: 0, pots: [],
    };
  });
  const [hasPartner, setHasPartner] = useState(() => getCache<DashCache>(`dash:${coupleId}`)?.hasPartner ?? false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loading, setLoading] = useState(() => getCache<DashCache>(`dash:${coupleId}`) === undefined);
  const [showCountdownSheet, setShowCountdownSheet] = useState(false);
  const [editingCountdownId, setEditingCountdownId] = useState<string | null>(null);
  const [actionCountdown, setActionCountdown] = useState<Countdown | null>(null);
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
    setEditingCountdownId(null);
    setShowCountdownSheet(true);
  });

  // Note debounce ref
  useEffect(() => { markSeen("home"); }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Keep the cache in sync with optimistic updates (add/delete countdown, mood,
  // note) so a refresh shows the current state instead of resurrecting items.
  useEffect(() => {
    if (!loading) setCache(`dash:${coupleId}`, { data, hasPartner });
  }, [data, hasPartner, loading, coupleId]);

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
        { data: pAvail }, { data: ledgerRows }, { data: potRows },
      ] = await Promise.all([
        supabase.rpc("get_my_profile", { p_user_id: me.id }),
        supabase.rpc("get_partner_profile", { p_couple_id: coupleId, p_my_id: me.id }),
        supabase.from("couples").select("shared_note, started_at, invite_code, banner_url, banner_focus").eq("id", coupleId).single(),
        supabase.from("countdowns").select("id, title, target_date, end_date, emoji, created_by").eq("couple_id", coupleId)
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
        supabase.from("ledger_entries").select("amount, split_ratio, paid_by").eq("couple_id", coupleId).eq("settled", false),
        supabase.from("savings_pots").select("id, title, goal_amount, his_amount, hers_amount, currency").eq("couple_id", coupleId).order("created_at", { ascending: false }),
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

      // Net balance from unsettled expenses (+ = partner owes you, − = you owe)
      type LedgerRow = { amount: string; split_ratio: string | null; paid_by: string };
      let youOwe = 0, theyOwe = 0;
      for (const e of (ledgerRows as LedgerRow[]) ?? []) {
        const amt = parseFloat(e.amount);
        const ratio = parseFloat(e.split_ratio ?? "0.5");
        if (e.paid_by !== me.id) youOwe += amt * ratio;
        else theyOwe += amt * (1 - ratio);
      }
      const balance = theyOwe - youOwe;

      type PotRow = { id: string; title: string; goal_amount: string; his_amount: string; hers_amount: string; currency: string };
      const pots: PotMini[] = ((potRows as PotRow[]) ?? []).map((p) => ({
        id: p.id, title: p.title,
        saved: parseFloat(p.his_amount ?? "0") + parseFloat(p.hers_amount ?? "0"),
        goal: parseFloat(p.goal_amount), currency: p.currency ?? "£",
      }));

      const newData: DashboardData = {
        myMood: me_?.current_mood ?? null,
        myMoodAt: me_?.mood_updated_at ?? null,
        partnerMood: partner?.current_mood ?? null,
        partnerMoodAt: partner?.mood_updated_at ?? null,
        sharedNote: coupleData?.shared_note ?? "",
        startedAt: coupleData?.started_at ?? null,
        bannerUrl: coupleData?.banner_url ?? null,
        bannerFocus: coupleData?.banner_focus ?? 50,
        inviteCode: coupleData?.invite_code ?? null,
        countdowns: (countdowns as Countdown[]) ?? [],
        partnerAction,
        freeDays,
        balance,
        pots,
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
    startTransition(() => { setMood(me.id, mood, coupleId); });
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

  function handleSaveCountdown() {
    if (!cdTitle.trim() || !cdDate) return;
    const title = cdTitle.trim();
    const endDate = cdEndDate || null;
    if (editingCountdownId) {
      const id = editingCountdownId;
      setData((prev) => ({
        ...prev,
        countdowns: prev.countdowns
          .map((c) => c.id === id ? { ...c, title, target_date: cdDate, end_date: endDate, emoji: cdEmoji } : c)
          .sort((a, b) => a.target_date.localeCompare(b.target_date)),
      }));
      startTransition(() => { updateCountdown({ id, coupleId, userId: me.id, title, targetDate: cdDate, endDate, emoji: cdEmoji }); });
    } else {
      const cd: Countdown = { id: crypto.randomUUID(), title, target_date: cdDate, end_date: endDate, emoji: cdEmoji, created_by: me.id };
      setData((prev) => ({
        ...prev,
        countdowns: [...prev.countdowns, cd].sort((a, b) => a.target_date.localeCompare(b.target_date)),
      }));
      markActivity("home");
      startTransition(() => { addCountdown({ coupleId, userId: me.id, title, targetDate: cdDate, endDate, emoji: cdEmoji }); });
    }
    setCdTitle(""); setCdDate(""); setCdEndDate(""); setCdEmoji("✈️"); setCdCustomEmoji("");
    setEditingCountdownId(null); setShowCountdownSheet(false);
  }

  function planFreeDay(ds: string) {
    setCdTitle(""); setCdDate(ds); setCdEndDate(""); setCdEmoji("🍽️"); setCdCustomEmoji("");
    setEditingCountdownId(null);
    setShowCountdownSheet(true);
  }

  function openEditCountdown(cd: Countdown) {
    setActionCountdown(null);
    setEditingCountdownId(cd.id);
    setCdTitle(cd.title); setCdDate(cd.target_date); setCdEndDate(cd.end_date ?? "");
    setCdEmoji(cd.emoji); setCdCustomEmoji("");
    setShowCountdownSheet(true);
  }

  function handleDeleteCountdown(id: string) {
    setData((prev) => ({ ...prev, countdowns: prev.countdowns.filter((c) => c.id !== id) }));
    setActionCountdown(null);
    startTransition(() => { deleteCountdown(id, coupleId, me.id); });
  }

  const today = new Date().toISOString().split("T")[0];
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);


  return (
    <div className="pb-6 max-w-lg mx-auto">
      {/* Banner — sticky header that collapses as you scroll */}
      <HomeBanner bannerUrl={data.bannerUrl} focus={data.bannerFocus} />

      <div className="px-4 space-y-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{greeting()}</p>
          <h1 className="font-heading text-3xl text-foreground tracking-tight leading-tight">{myName}.</h1>
          {hasPartner && data.partnerAction ? (
            <p className="text-xs text-muted-foreground/50 mt-0.5 leading-tight">
              {partnerName} {data.partnerAction.text}
              <span className="text-muted-foreground/35"> · {timeAgo(data.partnerAction.at)}</span>
            </p>
          ) : null}
          {data.startedAt ? (
            <button onClick={() => setShowDatePicker(true)} className="flex items-center gap-1 text-xs text-muted-foreground/40 mt-1 hover:text-muted-foreground/60 transition-colors">
              <Heart className="w-2.5 h-2.5 text-terracotta/60" fill="currentColor" />
              {duration(data.startedAt)}
            </button>
          ) : !loading && (
            <button onClick={() => setShowDatePicker(true)} className="text-xs text-muted-foreground/40 underline underline-offset-2 mt-0.5">
              add start date
            </button>
          )}
        </div>
        <Link
          href="/profile"
          className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex items-center justify-center flex-shrink-0"
          aria-label="profile"
          style={{ boxShadow: `0 0 0 1.5px ${myAccent.hex}` }}
        >
          {me.avatar_url ? (
            <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          )}
        </Link>
      </div>

      {/* Mood card */}
      <div className="card p-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">how are you both?</p>
        <div className="space-y-3">
          {/* My mood */}
          <div className="flex items-center gap-3">
            <div className="w-24 flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary flex-shrink-0"
                style={{ boxShadow: `0 0 0 2px ${myAccent.hex}` }}>
                {me.avatar_url
                  ? <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-muted-foreground">{myName[0]?.toUpperCase()}</div>}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{myName}</p>
                {timeAgo(data.myMoodAt) && <p className="text-[9px] text-muted-foreground/50 leading-tight">{timeAgo(data.myMoodAt)}</p>}
              </div>
            </div>
            <div className="flex gap-1 flex-1 bg-secondary/40 rounded-2xl p-1">
              {MOODS.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleMood(i + 1)}
                  aria-label={`feeling ${MOOD_LABELS[i]}`}
                  aria-pressed={data.myMood === i + 1}
                  className={cn(
                    "flex-1 text-lg py-1 rounded-xl transition-all",
                    data.myMood === i + 1 ? "scale-110" : "opacity-50 hover:opacity-80"
                  )}
                  style={data.myMood === i + 1 ? { backgroundColor: ownerTint(myAccent.hex) } : undefined}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          {/* Partner mood */}
          {hasPartner && (
            <div className="flex items-center gap-3">
              <div className="w-24 flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary flex-shrink-0"
                  style={{ boxShadow: `0 0 0 2px ${partnerAccent.hex}` }}>
                  {partner?.avatar_url
                    ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-muted-foreground">{partnerName[0]?.toUpperCase()}</div>}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground truncate">{partnerName}</p>
                  {timeAgo(data.partnerMoodAt) && <p className="text-[9px] text-muted-foreground/50 leading-tight">{timeAgo(data.partnerMoodAt)}</p>}
                </div>
              </div>
              <div className="flex gap-1 flex-1 p-1">
                {MOODS.map((emoji, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 text-lg py-1 rounded-xl text-center",
                      data.partnerMood === i + 1 ? "" : "opacity-20"
                    )}
                    style={data.partnerMood === i + 1 ? { backgroundColor: ownerTint(partnerAccent.hex) } : undefined}
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
                <p className="text-xs text-muted-foreground mb-0.5">share this code with your partner</p>
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
          backgroundColor: "#FBF7E4",
          boxShadow: "3px 5px 16px rgba(0,0,0,0.07), inset 0 -1px 0 rgba(180,140,60,0.10)",
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-sm" style={{ backgroundColor: "#EFE2B8" }} />
        <p className="text-xs text-amber-600/60 font-medium tracking-wide mb-2">shared note</p>
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
            <Plane className="w-5 h-5 mx-auto mb-2 text-muted-foreground/30" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">nothing to look forward to yet</p>
            <p className="text-xs text-muted-foreground/40 mt-0.5">tap + to add a countdown</p>
          </button>
        ) : (
          <div className="card overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground tracking-wide px-5 pt-4 pb-2">coming up</p>
            {data.countdowns.map((cd, i) => {
              const { days } = timeUntil(cd.target_date);
              const mine = cd.created_by === me.id;
              return (
                <div key={cd.id}
                  onClick={() => mine && setActionCountdown(cd)}
                  className={cn("flex items-center gap-3 px-5 py-3.5", i > 0 && "border-t border-border/30", mine && "cursor-pointer active:bg-black/[0.02]")}
                >
                  <span className="text-2xl flex-shrink-0">{cd.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cd.title}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5 tabular-nums">
                      {new Date(cd.target_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {cd.end_date && ` – ${new Date(cd.end_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-semibold tabular-nums leading-none">{days}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">days</p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Next free days */}
      {!loading && hasPartner && (
        <div className="card p-4">
          <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">next free days</p>
          {data.freeDays.length === 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">no overlapping free days in the next 60 days</p>
              <p className="text-xs text-muted-foreground/40 mt-1">mark days on the calendar to find overlaps</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.freeDays.map((ds) => {
                const d = new Date(ds + "T12:00:00");
                const diff = Math.round((d.getTime() - Date.now()) / 86400000);
                return (
                  <div key={ds} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                      </p>
                      <p className="text-xs font-medium text-sage">in {diff} day{diff !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={() => planFreeDay(ds)}
                      className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-secondary text-foreground active:scale-95 transition-transform flex-shrink-0"
                    >
                      <Plus className="w-3 h-3" strokeWidth={2.5} /> plan
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Money — settlement snapshot + savings pots */}
      {!loading && (
        <div className="card p-4">
          <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">accounts</p>

          {/* Settlement snapshot */}
          {Math.abs(data.balance) < 0.01 ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-sage-light flex items-center justify-center flex-shrink-0">
                <span className="text-sage text-sm">✓</span>
              </div>
              <p className="text-sm font-medium text-foreground">all settled up</p>
            </div>
          ) : (
            <Link href="/ledger" className="flex items-baseline justify-between">
              <p className="text-sm text-muted-foreground">
                {data.balance > 0 ? `${partnerName} owes you` : `you owe ${partnerName}`}
              </p>
              <p className={cn("text-xl font-bold tabular-nums", data.balance > 0 ? "text-sage" : "text-terracotta")}>
                {data.balance > 0 ? "+" : "−"}{currency}{Math.abs(data.balance).toFixed(2)}
              </p>
            </Link>
          )}

          {/* Savings pots — horizontal scroll */}
          {data.pots.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto mt-4 -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: "none" }}>
              {data.pots.map((pot) => {
                const pct = pot.goal > 0 ? Math.min(100, Math.round((pot.saved / pot.goal) * 100)) : 0;
                return (
                  <Link key={pot.id} href={`/ledger?tab=pots&pot=${pot.id}`}
                    className="flex-shrink-0 w-36 rounded-2xl bg-secondary/60 p-3 active:scale-[0.98] transition-transform">
                    <p className="text-xs font-medium text-foreground truncate">{pot.title}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {pot.currency}{pot.saved.toFixed(0)} / {pot.currency}{pot.goal.toFixed(0)}
                    </p>
                    <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-sage rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Date picker sheet (started_at) */}
      <BottomSheet open={showDatePicker} onClose={() => setShowDatePicker(false)} title="when did you get together?">
        <Input
          type="date"
          defaultValue={data.startedAt ?? ""}
          max={today}
          onChange={(e) => e.target.value && handleSetStarted(e.target.value)}
          className="h-11 rounded-xl bg-card border-border/60"
        />
      </BottomSheet>

      {/* Add / edit countdown sheet */}
      <BottomSheet
        open={showCountdownSheet}
        onClose={() => { setShowCountdownSheet(false); setEditingCountdownId(null); }}
        title={editingCountdownId ? "edit countdown" : "new countdown"}
        footer={
          <Button onClick={handleSaveCountdown} disabled={!cdTitle.trim() || !cdDate} className="w-full h-12 rounded-2xl text-[15px]">
            {editingCountdownId ? "save" : "add countdown"}
          </Button>
        }
      >
        {/* Type — single scrollable row */}
        <div>
          <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2.5">type</p>
          <div className="flex gap-2 overflow-x-auto py-0.5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
            {COUNTDOWN_TYPES.map((t) => (
              <button
                key={t.label}
                onClick={() => {
                  setCdEmoji(t.emoji); setCdCustomEmoji("");
                  const isDefault = !cdTitle || COUNTDOWN_TYPES.some((ct) => ct.label === cdTitle);
                  if (isDefault) setCdTitle(t.label);
                }}
                className={cn(
                  "flex-shrink-0 w-[68px] flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-medium transition-all",
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
          <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2.5">dates</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative rounded-2xl overflow-hidden">
              <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">starts</p>
                <p className={cn("text-sm font-medium", cdDate ? "text-foreground" : "text-muted-foreground/40")}>
                  {cdDate ? new Date(cdDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                </p>
              </div>
              <input type="date" value={cdDate} min={today} onChange={(e) => setCdDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            </div>
            <div className="relative rounded-2xl overflow-hidden">
              <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">ends <span className="normal-case font-normal opacity-50">(optional)</span></p>
                <p className={cn("text-sm font-medium", cdEndDate ? "text-foreground" : "text-muted-foreground/40")}>
                  {cdEndDate ? new Date(cdEndDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                </p>
              </div>
              <input type="date" value={cdEndDate} min={cdDate || today} onChange={(e) => setCdEndDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Countdown action prompt — creator only */}
      <Dialog open={actionCountdown !== null} onClose={() => setActionCountdown(null)}>
        {actionCountdown && (
          <>
            <p className="font-semibold text-foreground text-center truncate">{actionCountdown.emoji} {actionCountdown.title}</p>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-5">what would you like to do?</p>
            <div className="space-y-2">
              <Button onClick={() => openEditCountdown(actionCountdown)} className="w-full h-11 rounded-xl">
                <Pencil className="w-4 h-4 mr-1.5" /> edit
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDeleteCountdown(actionCountdown.id)}
                className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> remove
              </Button>
              <button onClick={() => setActionCountdown(null)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
            </div>
          </>
        )}
      </Dialog>
      </div>
    </div>
  );
}
