"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { setMood, updateNote, setStartedAt, addCountdown, updateCountdown, deleteCountdown, setDashboardLayout } from "./actions";
import { setAvailabilityDay } from "@/app/(app)/calendar/actions";
import { toggleTodoTick } from "@/app/(app)/vault/todo-actions";
import Link from "next/link";
import { Plane, Heart, User, Pencil, Trash2, Plus, LayoutGrid } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { DateField } from "@/components/ui/date-field";
import { track } from "@/lib/analytics";
import { cn, clickable } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";
import { ownerTint } from "@/lib/owner-identity";
import { HomeBanner } from "@/components/home-banner";
import { SignedImg } from "@/components/signed-img";
import DailyCard, { type DailyData } from "./daily-card";

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
interface PriorityTodoItem { id: string; title: string; due_date: string | null; assignee: string | null; }
interface PriorityTodo { list_id: string; title: string; emoji: string; remaining: number; items: PriorityTodoItem[]; }

// Calm due styling for the pinned to-do card (mirrors the vault's).
function todoDue(due: string | null): { label: string; tone: "muted" | "today" | "over" } | null {
  if (!due) return null;
  const today = localDateStr(0);
  const tomorrow = localDateStr(1);
  if (due < today) return { label: "overdue", tone: "over" };
  if (due === today) return { label: "today", tone: "today" };
  if (due === tomorrow) return { label: "tomorrow", tone: "muted" };
  return { label: new Date(due + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tone: "muted" };
}

type DashSize = "full" | "half";
interface DashModule { id: string; size: DashSize; }
const DEFAULT_LAYOUT: DashModule[] = [
  { id: "mood", size: "full" }, { id: "daily", size: "full" }, { id: "note", size: "full" },
  { id: "countdowns", size: "full" }, { id: "free", size: "full" }, { id: "accounts", size: "full" },
  { id: "todo", size: "full" },
];
const MODULE_ORDER = DEFAULT_LAYOUT.map((m) => m.id);
const MODULE_LABEL: Record<string, string> = {
  mood: "mood", daily: "the daily", note: "shared note", countdowns: "countdowns",
  free: "free times", accounts: "accounts", todo: "to-dos",
};
// Modules that read acceptably at half width. mood + the daily need full width.
const HALF_CAPABLE = new Set(["note", "countdowns", "free", "accounts", "todo"]);

// Merge a saved layout with the canonical module set (so new modules always
// appear, and a stale cache without a layout is handled).
function normalizeLayout(saved: DashModule[] | null | undefined): DashModule[] {
  const valid = (saved ?? []).filter((m) => MODULE_ORDER.includes(m.id));
  const base = valid.length ? valid : DEFAULT_LAYOUT;
  const missing = MODULE_ORDER.filter((id) => !base.some((m) => m.id === id)).map((id) => ({ id, size: "full" as DashSize }));
  return [...base, ...missing];
}

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
  freeWindows: { date: string; parts: string[] }[];
  balance: number;   // + means partner owes you, − means you owe partner
  pots: PotMini[];
  daily: DailyData;
  priorityTodo: PriorityTodo | null;
  dashboardLayout: DashModule[];
}

// Shape returned by the get_home_data RPC (single-call Home load).
interface HomeData {
  me: { id: string; current_mood: number | null; mood_updated_at: string | null } | null;
  partner: { id: string; current_mood: number | null; mood_updated_at: string | null } | null;
  couple: {
    shared_note: string | null; started_at: string | null; invite_code: string | null;
    banner_url: string | null; banner_focus: number | null; currency: string | null;
    dashboard_layout: DashModule[] | null;
  } | null;
  countdowns: Countdown[];
  events: { id: string; title: string; start_at: string; end_at: string | null; emoji: string; created_by: string }[];
  free_days: { date: string; parts: string[] }[];
  balance: number;
  pots: { id: string; title: string; saved: number; goal: number; currency: string; progress: number }[];
  partner_action: { text: string; at: string } | null;
  daily?: DailyData;
  priority_todo?: PriorityTodo | null;
}

function timeUntil(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00");
  const ms = Math.max(0, target.getTime() - Date.now());
  const totalHours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

function localDateStr(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Countdown badge — "today", "tmrw", or {n} days. */
function countdownLabel(targetDate: string): { top: string; bottom: string | null } {
  const today = localDateStr(0);
  const tomorrow = localDateStr(1);
  if (targetDate === today)     return { top: "today", bottom: null };
  if (targetDate === tomorrow)  return { top: "tmrw",  bottom: null };
  const { days } = timeUntil(targetDate);
  return { top: String(days), bottom: "days" };
}

function duration(startedAt: string): string {
  // Anchor date-only values at local noon so the year/month maths can't slip a
  // day (UTC-midnight parsing shifts to the previous day in negative timezones).
  const start = new Date(startedAt.length === 10 ? startedAt + "T12:00:00" : startedAt);
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
      sharedNote: "", startedAt: null, bannerUrl: null, bannerFocus: 50, countdowns: [], inviteCode: null, partnerAction: null, freeWindows: [], balance: 0, pots: [], daily: { paired: false }, priorityTodo: null, dashboardLayout: [],
    };
  });
  const [hasPartner, setHasPartner] = useState(() => getCache<DashCache>(`dash:${coupleId}`)?.hasPartner ?? false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loading, setLoading] = useState(() => getCache<DashCache>(`dash:${coupleId}`) === undefined);
  const [showCountdownSheet, setShowCountdownSheet] = useState(false);
  const [editingCountdownId, setEditingCountdownId] = useState<string | null>(null);
  const [actionCountdown, setActionCountdown] = useState<Countdown | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState<DashModule[]>([]);
  const [, startTransition] = useTransition();

  // Countdown form
  const [cdTitle, setCdTitle] = useState("");
  const [cdDate, setCdDate] = useState("");
  const [cdEndDate, setCdEndDate] = useState("");
  const [cdEmoji, setCdEmoji] = useState("✈️");

  useRegisterFab(() => {
    setCdTitle(""); setCdDate(""); setCdEndDate(""); setCdEmoji("✈️");
    setEditingCountdownId(null);
    setShowCountdownSheet(true);
  });

  // Note debounce ref
  useEffect(() => { markSeen("home"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull-to-refresh → refetch this screen's data.
  useEffect(() => {
    const onRefresh = () => loadRef.current?.();
    window.addEventListener("app:refresh", onRefresh);
    return () => window.removeEventListener("app:refresh", onRefresh);
  }, []);


  // Keep the cache in sync with optimistic updates (add/delete countdown, mood,
  // note) so a refresh shows the current state instead of resurrecting items.
  useEffect(() => {
    if (!loading) setCache(`dash:${coupleId}`, { data, hasPartner });
  }, [data, hasPartner, loading, coupleId]);

  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteFocusedRef = useRef(false);
  const loadRef = useRef<(() => void) | null>(null);
  const dailyRefetch = useRef<(() => void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      // Single RPC replaces the previous ~11 parallel queries (see get_home_data.sql).
      const { data: raw } = await supabase.rpc("get_home_data", { p_user_id: me.id });
      const h = raw as HomeData | null;
      if (!h) { setLoading(false); return; }

      const partner = h.partner;
      const pa = h.partner_action;
      const pots: PotMini[] = (h.pots ?? []).map((p) => ({
        id: p.id, title: p.title, saved: Number(p.saved), goal: Number(p.goal), currency: p.currency ?? "£",
      }));

      const newData: DashboardData = {
        myMood: h.me?.current_mood ?? null,
        myMoodAt: h.me?.mood_updated_at ?? null,
        partnerMood: partner?.current_mood ?? null,
        partnerMoodAt: partner?.mood_updated_at ?? null,
        sharedNote: h.couple?.shared_note ?? "",
        startedAt: h.couple?.started_at ?? null,
        bannerUrl: h.couple?.banner_url ?? null,
        bannerFocus: h.couple?.banner_focus ?? 50,
        inviteCode: h.couple?.invite_code ?? null,
        countdowns: h.countdowns ?? [],
        partnerAction: pa ? { text: pa.text, at: pa.at } : null,
        freeWindows: h.free_days ?? [],
        balance: Number(h.balance ?? 0),
        pots,
        daily: h.daily ?? { paired: false },
        priorityTodo: h.priority_todo ?? null,
        dashboardLayout: h.couple?.dashboard_layout ?? [],
      };
      const hasP = !!partner;
      setHasPartner(hasP);
      setData(newData);
      setLoading(false);
      setCache(`dash:${coupleId}`, { data: newData, hasPartner: hasP });

      // Auto-delete countdowns only once they're fully OVER — i.e. their end date
      // (or target date, if single-day) is yesterday or earlier. Keying off the
      // end date is essential: a multi-day trip (Jun 1–7) must not be deleted on
      // Jun 2 just because its start date has passed.
      const yesterday = localDateStr(-1);
      supabase.from("countdowns")
        .delete()
        .eq("couple_id", coupleId)
        .or(`and(end_date.is.null,target_date.lte.${yesterday}),end_date.lte.${yesterday}`)
        .then(() => {});
    }

    load();
    loadRef.current = load;

    // Debounced full reload when the partner changes something that feeds a home
    // card (free days, balance, pots, countdowns, activity line). Bursts collapse
    // into one reload; our own inserts are ignored (optimistic UI already shows them).
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { load(); }, 700);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPartnerChange = (p: any) => {
      if (p.eventType === "INSERT" && (p.new?.created_by === me.id || p.new?.user_id === me.id)) return;
      scheduleReload();
    };

    // Realtime: note/started_at via postgres_changes, moods via broadcast.
    const channel = supabase.channel(`dash-${coupleId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "couples", filter: `id=eq.${coupleId}` },
        (p) => setData((prev) => ({
          ...prev,
          startedAt: p.new.started_at ?? null,
          // Don't clobber the textarea while the user is actively editing it.
          sharedNote: noteFocusedRef.current ? prev.sharedNote : (p.new.shared_note ?? ""),
        })))
      .on("broadcast", { event: "mood" },
        ({ payload }: { payload: { user_id: string; mood: number; at: string } }) => {
          if (payload.user_id === me.id) setData((prev) => ({ ...prev, myMood: payload.mood, myMoodAt: payload.at }));
          else setData((prev) => ({ ...prev, partnerMood: payload.mood, partnerMoodAt: payload.at }));
        })
      // the daily — content-free "partner answered" signal; refetch through the
      // gated rpc (no answer text ever travels over the channel).
      .on("broadcast", { event: "daily_answered" },
        ({ payload }: { payload: { by: string } }) => {
          if (payload.by !== me.id) dailyRefetch.current?.();
        })
      // Partner first joins → reflect immediately + pull their data
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => {
          if (p.new?.couple_id === coupleId && p.new?.id !== me.id) { setHasPartner(true); scheduleReload(); }
        })
      // Keep the home cards live for partner changes made elsewhere in the app.
      .on("postgres_changes", { event: "*", schema: "public", table: "availability",  filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "events",         filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "countdowns",     filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries", filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_pots",   filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_todos",     filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .subscribe();

    channelRef.current = channel;
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(channel); channelRef.current = null; };
  }, [coupleId, me.id, partner]);

  function handleMood(mood: number) {
    const at = new Date().toISOString();
    setData((prev) => ({ ...prev, myMood: mood, myMoodAt: at }));
    channelRef.current?.send({ type: "broadcast", event: "mood", payload: { user_id: me.id, mood, at } });
    track("mood_set", { mood });
    startTransition(() => { setMood(me.id, mood, coupleId); });
  }

  function handleNote(val: string) {
    setData((prev) => ({ ...prev, sharedNote: val }));
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      track("note_updated");
      startTransition(() => { updateNote(coupleId, me.id, val); });
    }, 600);
  }

  function openStartedPicker() {
    setDateDraft(data.startedAt ?? "");
    setShowDatePicker(true);
  }

  function handleSetStarted(date: string) {
    if (!date) return;
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
      // Every free-together day the countdown now spans is blocked, not free —
      // clear them all from availability + the free-days list (dates are ISO,
      // so string comparison is chronological).
      const rangeEnd = endDate ?? cdDate;
      const blockedDates = Array.from(new Set(
        data.freeWindows.filter((w) => w.date >= cdDate && w.date <= rangeEnd).map((w) => w.date)
      ));
      setData((prev) => ({
        ...prev,
        countdowns: [...prev.countdowns, cd].sort((a, b) => a.target_date.localeCompare(b.target_date)),
        freeWindows: prev.freeWindows.filter((w) => !(w.date >= cdDate && w.date <= rangeEnd)),
      }));
      markActivity("home");
      track("countdown_created", { multi_day: !!endDate });
      startTransition(() => {
        addCountdown({ coupleId, userId: me.id, title, targetDate: cdDate, endDate, emoji: cdEmoji });
        for (const d of blockedDates) setAvailabilityDay(coupleId, me.id, d, false);
      });
    }
    setCdTitle(""); setCdDate(""); setCdEndDate(""); setCdEmoji("✈️");
    setEditingCountdownId(null); setShowCountdownSheet(false);
  }

  function openEditCountdown(cd: Countdown) {
    setActionCountdown(null);
    setEditingCountdownId(cd.id);
    setCdTitle(cd.title); setCdDate(cd.target_date); setCdEndDate(cd.end_date ?? "");
    setCdEmoji(cd.emoji);
    setShowCountdownSheet(true);
  }

  function handleDeleteCountdown(id: string) {
    setData((prev) => ({ ...prev, countdowns: prev.countdowns.filter((c) => c.id !== id) }));
    setActionCountdown(null);
    startTransition(() => { deleteCountdown(id, coupleId, me.id); });
  }

  // Check off a pinned to-do straight from Home — optimistic remove + persist.
  function handleTodoCheck(item: PriorityTodoItem) {
    setData((prev) => prev.priorityTodo ? {
      ...prev,
      priorityTodo: {
        ...prev.priorityTodo,
        items: prev.priorityTodo.items.filter((i) => i.id !== item.id),
        remaining: Math.max(0, prev.priorityTodo.remaining - 1),
      },
    } : prev);
    track("todo_completed");
    startTransition(() => { toggleTodoTick(item.id, coupleId, item.title); });
  }

  const today = new Date().toISOString().split("T")[0];
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  // ── Modular layout (CSS order + grid col-span; cards themselves are unchanged) ─
  const layout = normalizeLayout(data.dashboardLayout);
  const modIndex = new Map(layout.map((m, i) => [m.id, i]));
  // Which modules actually render right now (so pairing/gaps reflect reality).
  function visible(id: string): boolean {
    if (id === "mood" || id === "note") return true;       // always shown
    if (loading) return false;                              // the rest are gated on load
    if (id === "free") return hasPartner;
    if (id === "todo") return !!(data.priorityTodo && data.priorityTodo.items.length);
    return true;                                            // daily, countdowns, accounts
  }
  // Pair consecutive halves among the VISIBLE modules; a half that can't pair
  // (followed by a full, or last) renders full — no awkward half-row gaps.
  const visibleOrdered = layout.filter((m) => visible(m.id));
  const effSize = new Map<string, DashSize>();
  for (let i = 0; i < visibleOrdered.length; i++) {
    const m = visibleOrdered[i];
    if (m.size === "half" && visibleOrdered[i + 1]?.size === "half") {
      effSize.set(m.id, "half"); effSize.set(visibleOrdered[i + 1].id, "half"); i++;
    } else {
      effSize.set(m.id, "full");
    }
  }
  function mod(id: string) {
    return {
      style: { order: modIndex.get(id) ?? 99 },
      // h-full + [&>*]:h-full so two side-by-side halves stretch to equal height.
      className: (effSize.get(id) === "half" ? "col-span-1 min-w-0" : "col-span-2") + " h-full [&>*]:h-full",
    };
  }
  const layoutSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function openLayoutEditor() { setLayoutDraft(normalizeLayout(data.dashboardLayout)); setShowLayoutEditor(true); }
  function onLayoutDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayoutDraft((prev) => {
      const oldI = prev.findIndex((m) => m.id === active.id);
      const newI = prev.findIndex((m) => m.id === over.id);
      return oldI < 0 || newI < 0 ? prev : arrayMove(prev, oldI, newI);
    });
  }
  function toggleSize(id: string) {
    setLayoutDraft((prev) => prev.map((m) => m.id === id ? { ...m, size: m.size === "half" ? "full" : "half" } : m));
  }
  function saveLayout() {
    setData((prev) => ({ ...prev, dashboardLayout: layoutDraft }));
    setShowLayoutEditor(false);
    startTransition(() => { setDashboardLayout(coupleId, layoutDraft); });
  }

  return (
    <div className="pb-6 max-w-lg mx-auto">
      {/* Banner — fixed-height sticky header */}
      <HomeBanner bannerUrl={data.bannerUrl} focus={data.bannerFocus} />

      <div className="px-4 pt-4">
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
            <button onClick={openStartedPicker} className="flex items-center gap-1 text-xs text-muted-foreground/40 mt-1 hover:text-muted-foreground/60 transition-colors">
              <Heart className="w-2.5 h-2.5 text-terracotta/60" fill="currentColor" />
              {duration(data.startedAt)}
            </button>
          ) : !loading && (
            <button onClick={openStartedPicker} className="text-xs text-muted-foreground/40 underline underline-offset-2 mt-0.5">
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
            <SignedImg src={me.avatar_url} className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          )}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 items-stretch mt-4">
      {/* Mood card */}
      <div {...mod("mood")}>
      <div className="card p-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">how are you both?</p>
        <div className="space-y-3">
          {/* My mood */}
          <div className="flex items-center gap-3">
            <div className="w-24 flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary flex-shrink-0"
                style={{ boxShadow: `0 0 0 2px ${myAccent.hex}` }}>
                {me.avatar_url
                  ? <SignedImg src={me.avatar_url} className="w-full h-full object-cover" />
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
                    ? <SignedImg src={partner.avatar_url} className="w-full h-full object-cover" />
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
      </div>

      {/* The daily — one shared question a day */}
      {!loading && (
        <div {...mod("daily")}>
        <DailyCard
          initial={data.daily}
          onBroadcast={() => channelRef.current?.send({ type: "broadcast", event: "daily_answered", payload: { by: me.id } })}
          registerRefetch={(fn) => { dailyRefetch.current = fn; }}
        />
        </div>
      )}

      {/* Shared note — post-it */}
      <div {...mod("note")}>
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
          onFocus={() => { noteFocusedRef.current = true; }}
          onBlur={() => { noteFocusedRef.current = false; }}
          placeholder="jot something for both of you to see…"
          className="w-full text-sm text-amber-950/70 placeholder:text-amber-900/30 bg-transparent resize-none outline-none leading-relaxed min-h-[80px]"
          rows={3}
        />
      </div>
      </div>

      {/* Countdowns */}
      {!loading && (
        <div {...mod("countdowns")}>
        {data.countdowns.length === 0 ? (
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
              const { top, bottom } = countdownLabel(cd.target_date);
              return (
                <div key={cd.id}
                  {...clickable(() => setActionCountdown(cd))}
                  className={cn("flex items-center gap-3 px-5 py-3.5 cursor-pointer active:bg-black/[0.02]", i > 0 && "border-t border-border/30")}
                >
                  <span className="text-2xl flex-shrink-0">{cd.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cd.title}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5 tabular-nums">
                      {new Date(cd.target_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {cd.end_date && ` – ${new Date(cd.end_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 min-w-[2.5rem]">
                    <p className="text-sm font-semibold leading-none">{top}</p>
                    {bottom && <p className="text-[10px] text-muted-foreground/50 mt-0.5">{bottom}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}

      {/* Next free days */}
      {!loading && hasPartner && (
        <div {...mod("free")}>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">next free times</p>
          {data.freeWindows.length === 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">no overlapping free time in the next 60 days</p>
              <p className="text-xs text-muted-foreground/40 mt-1">mark your free times on the calendar to find overlaps</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.freeWindows.map((w) => {
                const d = new Date(w.date + "T12:00:00");
                const diff = Math.round((d.getTime() - Date.now()) / 86400000);
                return (
                  <div key={w.date} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug">
                        {d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} <span className="text-sage">{w.parts.length === 4 ? "all day" : w.parts.join(", ")}</span>
                      </p>
                      <p className="text-xs font-medium text-sage">in {diff} day{diff !== 1 ? "s" : ""}</p>
                    </div>
                    <Link
                      href={`/calendar?plan=${w.date}:${w.parts[0] ?? "afternoon"}`}
                      className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-secondary text-foreground active:scale-95 transition-transform flex-shrink-0"
                    >
                      <Plus className="w-3 h-3" strokeWidth={2.5} /> plan
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      )}

      {/* Money — settlement snapshot + savings pots */}
      {!loading && (
        <div {...mod("accounts")}>
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
        </div>
      )}

      {/* Pinned to-do list — check off without leaving Home */}
      {!loading && data.priorityTodo && data.priorityTodo.items.length > 0 && (
        <div {...mod("todo")}>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground font-medium tracking-wide truncate">
              <span className="mr-1">{data.priorityTodo.emoji}</span>{data.priorityTodo.title}
            </p>
            <Link href="/vault?tab=todos" className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex-shrink-0 ml-2">open list</Link>
          </div>
          <div className="space-y-0.5">
            {data.priorityTodo.items.map((item) => {
              const due = todoDue(item.due_date);
              return (
                <div key={item.id} className="flex items-center gap-3 py-1.5">
                  <button
                    onClick={() => handleTodoCheck(item)}
                    aria-label={`mark "${item.title}" done`}
                    className="w-[20px] h-[20px] rounded-full border-[1.5px] border-muted-foreground/30 hover:border-muted-foreground/60 flex-shrink-0 transition-colors active:scale-90"
                  />
                  <span className="text-sm text-foreground flex-1 truncate">{item.title}</span>
                  {due && (
                    <span className={cn("text-[11px] font-medium flex-shrink-0",
                      due.tone === "over" ? "text-terracotta/80" : due.tone === "today" ? "text-sage" : "text-muted-foreground/50")}>
                      {due.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {data.priorityTodo.remaining > data.priorityTodo.items.length && (
            <p className="text-[11px] text-muted-foreground/50 mt-2">+{data.priorityTodo.remaining - data.priorityTodo.items.length} more on the list</p>
          )}
        </div>
        </div>
      )}
      </div>

      {/* Customize layout */}
      {!loading && (
        <button onClick={openLayoutEditor} className="w-full mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2">
          <LayoutGrid className="w-3.5 h-3.5" /> edit layout
        </button>
      )}

      {/* Date picker sheet (started_at) — requires explicit save (no auto-commit). */}
      <BottomSheet
        open={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        title="when did you get together?"
        footer={
          <Button onClick={() => handleSetStarted(dateDraft)} disabled={!dateDraft} className="w-full h-11 rounded-xl">
            save
          </Button>
        }
      >
        <DateField value={dateDraft} onChange={setDateDraft} max={today} placeholder="select a date" />
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
                  setCdEmoji(t.emoji);
                  const isDefault = !cdTitle || COUNTDOWN_TYPES.some((ct) => ct.label === cdTitle);
                  if (isDefault) setCdTitle(t.label);
                }}
                className={cn(
                  "flex-shrink-0 w-[68px] flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-medium transition-all",
                  cdEmoji === t.emoji
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

      {/* Layout editor — reorder + half/full sizing */}
      <BottomSheet
        open={showLayoutEditor}
        onClose={() => setShowLayoutEditor(false)}
        title="edit layout"
        footer={<Button onClick={saveLayout} className="w-full h-11 rounded-xl">done</Button>}
      >
        <p className="text-xs text-muted-foreground/60 mb-3">drag the tiles to reorder your home. tap a tile&apos;s size to make it half-width — two halves sit side by side.</p>
        <DndContext sensors={layoutSensors} collisionDetection={closestCenter} onDragEnd={onLayoutDragEnd}>
          <SortableContext items={layoutDraft.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-2">
              {layoutDraft.map((m) => (
                <LayoutTile key={m.id} m={m} onToggleSize={() => toggleSize(m.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </BottomSheet>
      </div>
    </div>
  );
}

// A draggable skeleton tile in the layout editor — mirrors the page (full = wide,
// half = narrow) so the couple can picture the result while they rearrange.
function LayoutTile({ m, onToggleSize }: { m: DashModule; onToggleSize: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const half = m.size === "half";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-2xl bg-secondary border border-border/50 px-3 py-5 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing select-none touch-none",
        half ? "col-span-1" : "col-span-2",
        isDragging && "opacity-70 shadow-lg z-10"
      )}
    >
      <span className="text-sm font-medium text-foreground truncate">{MODULE_LABEL[m.id] ?? m.id}</span>
      {HALF_CAPABLE.has(m.id) && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleSize(); }}
          className={cn("text-[11px] font-medium px-2 py-1 rounded-md flex-shrink-0 transition-colors", half ? "bg-foreground text-background" : "bg-card text-muted-foreground")}
        >
          {half ? "half" : "full"}
        </button>
      )}
    </div>
  );
}
