"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import DashboardSkeleton from "./dashboard-skeleton";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { setMood, setStartedAt, setDashboardLayout, addNoteLine, updateNoteLine, deleteNoteLine, getPendingJoinRequest, respondJoinRequest } from "./actions";
import { addEvent, updateEvent, deleteEvent } from "@/app/(app)/calendar/actions";
import { EventSheet, type EventDraft } from "@/components/event-sheet";
import type { DayPart } from "@/lib/day-parts";
import { toggleTodoTick } from "@/app/(app)/vault/todo-actions";
import Link from "next/link";
import { Plane, Heart, User, Pencil, Trash2, Plus, LayoutGrid, Check, GripVertical, Settings, Sparkles } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { DateField } from "@/components/ui/date-field";
import { track } from "@/lib/analytics";
import { cn, clickable, commas } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";
import { ownerTint } from "@/lib/owner-identity";
import { HomeBanner } from "@/components/home-banner";
import { SignedImg } from "@/components/signed-img";
import DailyCard, { type DailyData } from "./daily-card";
import { PremiumBadges } from "@/components/premium-badges";
import { useEntitlement } from "@/contexts/entitlement-context";

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
const MOOD_LABELS = ["very low", "low", "okay", "good", "great"];

interface Countdown { id: string; title: string; target_date: string; end_date?: string | null; emoji: string; created_by: string; parts?: string[]; start_time?: string | null; attendee?: string | null; }
interface NoteLine { id: string; body: string; created_by: string; sort_order: number; }
interface PotMini { id: string; title: string; saved: number; goal: number; currency: string; pinned: boolean; }
interface PriorityTodoItem { id: string; title: string; due_date: string | null; assignee: string | null; needs_both?: boolean; ticked_by?: string[]; done?: boolean; }
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
  // The "countdowns" module id is kept for backward-compat with saved layouts,
  // but everything is an event now — so it shows as "events".
  mood: "mood", daily: "the daily", note: "shared note", countdowns: "events",
  free: "free times", accounts: "accounts", todo: "to-dos",
};

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
  noteItems: NoteLine[];
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
  events: { id: string; title: string; on_date: string; until_date: string | null; parts: string[]; start_time: string | null; emoji: string; created_by: string }[];
  free_days: { date: string; parts: string[] }[];
  balance: number;
  pots: { id: string; title: string; saved: number; goal: number; currency: string; progress: number; pinned?: boolean }[];
  partner_action: { text: string; at: string } | null;
  daily?: DailyData;
  priority_todo?: PriorityTodo | null;
  note_items: NoteLine[];
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

export default function DashboardClient({ live = true }: { live?: boolean }) {
  const { coupleId, me, partner, myName, partnerName, currency } = useCouple();
  const { markActivity } = useNotifications();
  const [data, setData] = useState<DashboardData>(() => {
    const c = getCache<DashCache>(`dash:${coupleId}`);
    return c?.data ?? {
      myMood: null, myMoodAt: null, partnerMood: null, partnerMoodAt: null,
      noteItems: [], startedAt: null, bannerUrl: null, bannerFocus: 50, countdowns: [], inviteCode: null, partnerAction: null, freeWindows: [], balance: 0, pots: [], daily: { paired: false }, priorityTodo: null, dashboardLayout: [],
    };
  });
  const [hasPartner, setHasPartner] = useState(() => getCache<DashCache>(`dash:${coupleId}`)?.hasPartner ?? false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loading, setLoading] = useState(() => getCache<DashCache>(`dash:${coupleId}`) === undefined);
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Countdown | null>(null);
  const [actionCountdown, setActionCountdown] = useState<Countdown | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState<DashModule[]>([]);
  const [showTrialInfo, setShowTrialInfo] = useState(false);
  const [, startTransition] = useTransition();

  // Founding-member badge, shown beside the profile button.
  const { paid, lifetime, premium, onTrial, trialEndsAt, openPaywall } = useEntitlement();
  const founding = paid || lifetime;
  const [trialNudgeDismissed, setTrialNudgeDismissed] = useState(false);
  const trialDaysLeft = onTrial && trialEndsAt ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000) : null;
  const showTrialNudge = !trialNudgeDismissed && trialDaysLeft !== null && trialDaysLeft <= 10;

  // Shared-note lines
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState<{ id: string; body: string } | null>(null);

  // Pending "someone wants to join your space" request (shown to the existing
  // member until they accept / decline).
  const [joinReq, setJoinReq] = useState<{ id: string; requester_id: string; name: string | null; avatar_url: string | null; accent_color: string | null } | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);

  function openNewEvent() {
    setEditingEvent(null);
    setShowEventSheet(true);
  }
  useRegisterFab(openNewEvent);

  // Note debounce ref

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

  // First time on Home while still solo: explain the trial starts at pairing
  // (and nudge the invite). Shown once per space.
  useEffect(() => {
    if (loading || hasPartner) return;
    try {
      const key = `us_trialinfo_${coupleId}`;
      if (localStorage.getItem(key)) return;
      setShowTrialInfo(true);
      localStorage.setItem(key, "1");
    } catch { /* ignore */ }
  }, [loading, hasPartner, coupleId]);

  const loadRef = useRef<(() => void) | null>(null);
  const dailyRefetch = useRef<(() => void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Load + subscribe while this tab is the active one or an adjacent neighbour
    // (`live`). Re-entering the window reloads (catches up) + resubscribes; far
    // tabs show their cache. So neighbours are always full-state for the swipe.
    if (!live) return;
    const supabase = createClient();

    async function load() {
     try {
      // Single RPC replaces the previous ~11 parallel queries (see get_home_data.sql).
      const { data: raw } = await supabase.rpc("get_home_data", { p_user_id: me.id });
      const h = raw as HomeData | null;
      if (!h) { setLoading(false); return; }

      const partner = h.partner;
      const pa = h.partner_action;
      const pots: PotMini[] = (h.pots ?? []).map((p) => ({
        id: p.id, title: p.title, saved: Number(p.saved), goal: Number(p.goal), currency: p.currency ?? "£", pinned: p.pinned ?? false,
      }));

      const newData: DashboardData = {
        myMood: h.me?.current_mood ?? null,
        myMoodAt: h.me?.mood_updated_at ?? null,
        partnerMood: partner?.current_mood ?? null,
        partnerMoodAt: partner?.mood_updated_at ?? null,
        noteItems: h.note_items ?? [],
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
      // (Events are never auto-deleted — they're the shared calendar history.
      // get_home_data already returns only upcoming/ongoing ones for this module.)
     } catch {
      // Network hiccup — don't strand the skeleton; show the page (cache if any).
      setLoading(false);
     }
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
        (p) => setData((prev) => ({ ...prev, startedAt: p.new.started_at ?? null })))
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
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries", filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_pots",   filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_todos",     filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "note_items",      filter: `couple_id=eq.${coupleId}` }, onPartnerChange)
      .subscribe();

    channelRef.current = channel;
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(channel); channelRef.current = null; };
  }, [coupleId, me.id, partner, live]);

  // While solo, watch for "someone wants to join your space" requests + show the
  // accept/decline prompt. Stops once paired.
  useEffect(() => {
    if (!live || hasPartner) { setJoinReq(null); return; }
    const supabase = createClient();
    let active = true;
    const refetch = async () => { const r = await getPendingJoinRequest(coupleId); if (active) setJoinReq(r); };
    refetch();
    const ch = supabase.channel(`joinreq-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "join_requests", filter: `couple_id=eq.${coupleId}` }, refetch)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [coupleId, hasPartner, live]);

  async function handleJoinResponse(accept: boolean) {
    if (!joinReq) return;
    setJoinBusy(true);
    const res = await respondJoinRequest(joinReq.id, accept, coupleId);
    setJoinBusy(false);
    setJoinReq(null);
    if (accept && res && "status" in res && res.status === "accepted") {
      setHasPartner(true);
      loadRef.current?.();
    }
  }

  function handleMood(mood: number) {
    const at = new Date().toISOString();
    setData((prev) => ({ ...prev, myMood: mood, myMoodAt: at }));
    channelRef.current?.send({ type: "broadcast", event: "mood", payload: { user_id: me.id, mood, at } });
    track("mood_set", { mood });
    startTransition(() => { setMood(me.id, mood, coupleId); });
  }

  function handleAddNote() {
    const body = noteDraft.trim();
    if (!body) return;
    const tempId = crypto.randomUUID();
    const sort = (data.noteItems.at(-1)?.sort_order ?? 0) + 1;
    setData((prev) => ({ ...prev, noteItems: [...prev.noteItems, { id: tempId, body, created_by: me.id, sort_order: sort }] }));
    setNoteDraft("");
    track("note_updated");
    startTransition(async () => {
      const realId = await addNoteLine(coupleId, body, sort);
      if (realId) setData((prev) => ({ ...prev, noteItems: prev.noteItems.map((n) => n.id === tempId ? { ...n, id: realId } : n) }));
    });
  }

  function handleSaveNoteEdit() {
    if (!editingNote) return;
    const id = editingNote.id;
    const body = editingNote.body.trim();
    setEditingNote(null);
    if (!body) { handleDeleteNote(id); return; }
    setData((prev) => ({ ...prev, noteItems: prev.noteItems.map((n) => n.id === id ? { ...n, body } : n) }));
    startTransition(() => { updateNoteLine(id, coupleId, body); });
  }

  function handleDeleteNote(id: string) {
    setEditingNote(null);
    setData((prev) => ({ ...prev, noteItems: prev.noteItems.filter((n) => n.id !== id) }));
    startTransition(() => { deleteNoteLine(id, coupleId); });
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

  // The events module uses the SAME form as the calendar (EventSheet).
  function handleSaveEvent(draft: EventDraft) {
    const { title, emoji, onDate, parts, untilDate, startTime, attendee } = draft;
    const endDate = untilDate || null;
    if (editingEvent) {
      const id = editingEvent.id;
      setData((prev) => ({
        ...prev,
        countdowns: prev.countdowns
          .map((c) => c.id === id ? { ...c, title, target_date: onDate, end_date: endDate, emoji, parts, start_time: startTime, attendee } : c)
          .sort((a, b) => a.target_date.localeCompare(b.target_date)),
      }));
      startTransition(() => { updateEvent({ id, coupleId, userId: me.id, title, onDate, parts: parts as DayPart[], untilDate: endDate, startTime, emoji, attendee }); });
    } else {
      const cd: Countdown = { id: crypto.randomUUID(), title, target_date: onDate, end_date: endDate, emoji, created_by: me.id, parts, start_time: startTime, attendee };
      // Blocking is derived (the event removes those parts from "free together"),
      // so just drop the now-booked days from the optimistic free list.
      const rangeEnd = endDate ?? onDate;
      setData((prev) => ({
        ...prev,
        countdowns: [...prev.countdowns, cd].sort((a, b) => a.target_date.localeCompare(b.target_date)),
        freeWindows: prev.freeWindows.filter((w) => !(w.date >= onDate && w.date <= rangeEnd)),
      }));
      markActivity("home");
      track("event_created", { multi_day: !!endDate, parts: parts.length });
      startTransition(() => { addEvent({ id: cd.id, coupleId, userId: me.id, title, onDate, parts: parts as DayPart[], untilDate: endDate, startTime, emoji, attendee }); });
    }
    setEditingEvent(null); setShowEventSheet(false);
  }

  function openEditCountdown(cd: Countdown) {
    setActionCountdown(null);
    setEditingEvent(cd);
    setShowEventSheet(true);
  }

  function handleDeleteCountdown(id: string) {
    setData((prev) => ({ ...prev, countdowns: prev.countdowns.filter((c) => c.id !== id) }));
    setActionCountdown(null);
    startTransition(() => { deleteEvent(id, coupleId, me.id); });
  }

  // Check off a pinned to-do straight from Home. Mirrors the vault: toggle MY
  // tick, derive done (needs_both ? both partners : ≥1), and show it in place
  // (filled circle + strike-through) rather than vanishing. Items finished today
  // keep showing on reload (the RPC returns them), so it survives navigation.
  function handleTodoCheck(item: PriorityTodoItem) {
    const ticked = item.ticked_by ?? [];
    const iTicked = ticked.includes(me.id);
    const nextTicked = iTicked ? ticked.filter((x) => x !== me.id) : [...ticked, me.id];
    const members = partner ? [me.id, partner.id] : [me.id];
    const done = item.needs_both ? members.every((m) => nextTicked.includes(m)) : nextTicked.length >= 1;
    setData((prev) => prev.priorityTodo ? {
      ...prev,
      priorityTodo: {
        ...prev.priorityTodo,
        items: prev.priorityTodo.items.map((i) => i.id === item.id ? { ...i, ticked_by: nextTicked, done } : i),
        remaining: Math.max(0, prev.priorityTodo.remaining + (done && !item.done ? -1 : !done && item.done ? 1 : 0)),
      },
    } : prev);
    if (done && !item.done) track("todo_completed");
    startTransition(() => { toggleTodoTick(item.id, coupleId, item.title); });
  }

  // Who a pinned to-do is for → avatars to render (mirrors the vault).
  function todoPeople(assignee: string | null | undefined) {
    if (assignee === me.id) return [{ url: me.avatar_url, name: myName, hex: myAccent.hex }];
    if (partner && assignee === partner.id) return [{ url: partner.avatar_url, name: partnerName, hex: partnerAccent.hex }];
    if (assignee === "both") return [
      { url: me.avatar_url, name: myName, hex: myAccent.hex },
      { url: partner?.avatar_url ?? null, name: partnerName, hex: partnerAccent.hex },
    ];
    return [];
  }

  const today = new Date().toISOString().split("T")[0];
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  // ── Modular layout (CSS order; cards themselves are unchanged) ───────────────
  const layout = normalizeLayout(data.dashboardLayout);
  const modIndex = new Map(layout.map((m, i) => [m.id, i]));
  // Modules are full-width for now — couples can still reorder them, but every
  // tile spans the row (no half/full sizing).
  function mod(id: string) {
    return {
      style: { order: modIndex.get(id) ?? 99 },
      className: "col-span-2 h-full [&>*]:h-full",
    };
  }
  const layoutSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function openLayoutEditor() {
    if (!premium) { openPaywall("layout"); return; }
    setLayoutDraft(normalizeLayout(data.dashboardLayout)); setShowLayoutEditor(true);
  }
  function onLayoutDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayoutDraft((prev) => {
      const oldI = prev.findIndex((m) => m.id === active.id);
      const newI = prev.findIndex((m) => m.id === over.id);
      return oldI < 0 || newI < 0 ? prev : arrayMove(prev, oldI, newI);
    });
  }
  function saveLayout() {
    setData((prev) => ({ ...prev, dashboardLayout: layoutDraft }));
    setShowLayoutEditor(false);
    startTransition(() => { setDashboardLayout(coupleId, layoutDraft); });
  }

  // First load (no cache yet) → skeleton. Revisits init `loading` false from
  // cache, so this only shows on a genuine cold/slow load.
  if (loading) return <DashboardSkeleton />;

  return (
    <div className="pb-6 max-w-lg mx-auto">
      {/* Banner — fixed-height sticky header */}
      <HomeBanner bannerUrl={data.bannerUrl} focus={data.bannerFocus} />

      <div className="px-4 pt-4">
      {/* Trial-ending nudge — gentle, dismissible, only in the final stretch. */}
      {showTrialNudge && (
        <div className="flex items-center gap-2.5 mb-4 rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: "rgba(245,158,11,0.10)" }}>
          <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: "#D97706" }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground leading-snug">
              {trialDaysLeft === 0 ? "your premium trial ends today" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} of premium left`}
            </p>
            <button onClick={() => openPaywall("generic")} className="text-[11px] font-medium" style={{ color: "#D97706" }}>keep your space unlocked →</button>
          </div>
          <button onClick={() => setTrialNudgeDismissed(true)} aria-label="dismiss" className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0">
            <span className="text-base leading-none">×</span>
          </button>
        </div>
      )}
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
        <div className="flex items-center gap-2 flex-shrink-0">
          <PremiumBadges founding={founding} />
          {/* Settings gear — same destination as the avatar, just clearer. */}
          <Link
            href="/profile"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
            aria-label="settings"
          >
            <Settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </Link>
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
        <p className="text-xs text-amber-600/60 font-medium tracking-wide mb-2.5">shared note</p>

        {data.noteItems.length === 0 && !editingNote && !noteDraft && (
          <p className="text-sm text-amber-900/30 mb-1.5">jot a few things for both of you to see…</p>
        )}

        <div className="space-y-0.5">
          {data.noteItems.map((n) => {
            const hex = getAccent(n.created_by === me.id ? me.accent_color : (partner?.accent_color ?? null)).hex;
            if (editingNote?.id === n.id) {
              return (
                <div key={n.id} className="flex items-center gap-1.5">
                  <input
                    value={editingNote.body}
                    onChange={(e) => setEditingNote({ id: n.id, body: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveNoteEdit(); }}
                    autoFocus
                    className="flex-1 text-sm bg-amber-100/50 rounded-lg px-2 py-1 outline-none font-semibold"
                    style={{ color: hex }}
                  />
                  <button onClick={handleSaveNoteEdit} className="w-7 h-7 flex items-center justify-center text-amber-700/70 active:scale-95" aria-label="save"><Check className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteNote(n.id)} className="w-7 h-7 flex items-center justify-center text-terracotta/70 active:scale-95" aria-label="delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            }
            return (
              <button
                key={n.id}
                onClick={() => setEditingNote({ id: n.id, body: n.body })}
                className="block w-full text-left text-sm font-semibold leading-relaxed break-words active:opacity-70"
                style={{ color: hex }}
              >
                {n.body}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
            placeholder="add a line, then tap +"
            className="flex-1 text-sm text-amber-950/70 placeholder:text-amber-900/30 bg-transparent outline-none"
          />
          {/* Always-present + so it's clear a line has to be added (not auto-saved). */}
          <button
            onClick={handleAddNote}
            disabled={!noteDraft.trim()}
            aria-label="add line"
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-95 flex-shrink-0",
              noteDraft.trim() ? "bg-amber-400/80 text-white shadow-sm" : "bg-amber-200/40 text-amber-800/30"
            )}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        {noteDraft.trim() && (
          <p className="text-[11px] text-amber-700/60 mt-1.5">tap + (or return) to save this line</p>
        )}
      </div>
      </div>

      {/* Countdowns */}
      {!loading && (
        <div {...mod("countdowns")}>
        {data.countdowns.length === 0 ? (
          <button
            onClick={openNewEvent}
            className="w-full rounded-3xl border border-dashed border-border/60 p-8 text-center transition-colors hover:border-border bg-secondary/40"
          >
            <Plane className="w-5 h-5 mx-auto mb-2 text-muted-foreground/30" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">nothing to look forward to yet</p>
            <p className="text-xs text-muted-foreground/40 mt-0.5">tap + to add an event</p>
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
                      href={`/calendar?plan=${w.date}&parts=${w.parts.join(",")}`}
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
                {data.balance > 0 ? "+" : "−"}{currency}{commas(Math.abs(data.balance), 2)}
              </p>
            </Link>
          )}

          {/* Pinned savings pots — stacked vertically (pin them from the ledger). */}
          {data.pots.some((p) => p.pinned) && (
            <div className="space-y-2 mt-4">
              {data.pots.filter((p) => p.pinned).map((pot) => {
                const pct = pot.goal > 0 ? Math.min(100, Math.round((pot.saved / pot.goal) * 100)) : 0;
                return (
                  <Link key={pot.id} href={`/ledger?tab=pots&pot=${pot.id}`}
                    className="block rounded-2xl bg-secondary/60 p-3 active:scale-[0.99] transition-transform">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium text-foreground truncate">{pot.title}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                        {pot.currency}{commas(pot.saved)} / {pot.currency}{commas(pot.goal)}
                      </p>
                    </div>
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
              const iTicked = (item.ticked_by ?? []).includes(me.id);
              const people = todoPeople(item.assignee);
              return (
                <div key={item.id} className="flex items-center gap-3 py-1.5">
                  <button
                    onClick={() => handleTodoCheck(item)}
                    aria-pressed={!!item.done}
                    aria-label={item.done ? `mark "${item.title}" not done` : `mark "${item.title}" done`}
                    className={cn(
                      "w-[20px] h-[20px] rounded-full flex items-center justify-center flex-shrink-0 transition-colors active:scale-90",
                      item.done ? "bg-sage" : iTicked ? "border-[1.5px] border-sage" : "border-[1.5px] border-muted-foreground/30 hover:border-muted-foreground/60"
                    )}
                  >
                    {item.done ? <Check className="w-3 h-3 text-white" strokeWidth={3} /> : iTicked ? <Check className="w-2.5 h-2.5 text-sage" strokeWidth={3} /> : null}
                  </button>
                  <span className={cn("text-sm flex-1 truncate", item.done ? "line-through text-muted-foreground/50" : "text-foreground")}>{item.title}</span>
                  {!item.done && item.needs_both && (
                    <span className="text-[11px] text-muted-foreground/50 tabular-nums flex-shrink-0">{(item.ticked_by ?? []).length}/2 ticked</span>
                  )}
                  {!item.done && due && (
                    <span className={cn("text-[11px] font-medium flex-shrink-0",
                      due.tone === "over" ? "text-terracotta/80" : due.tone === "today" ? "text-sage" : "text-muted-foreground/50")}>
                      {due.label}
                    </span>
                  )}
                  {!item.done && people.length > 0 && (
                    <div className="flex items-center -space-x-1 flex-shrink-0">
                      {people.map((p, i) => (
                        <span key={i} className="w-4 h-4 rounded-full overflow-hidden bg-secondary inline-flex items-center justify-center" style={{ boxShadow: `0 0 0 1.5px ${p.hex}` }}>
                          {p.url ? <SignedImg src={p.url} className="w-full h-full object-cover" /> : <span className="text-[8px] font-semibold text-muted-foreground">{p.name[0]?.toUpperCase()}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const shownOpen = data.priorityTodo.items.filter((i) => !i.done).length;
            const more = data.priorityTodo.remaining - shownOpen;
            return more > 0 ? (
              <p className="text-[11px] text-muted-foreground/50 mt-2">+{more} more on the list</p>
            ) : null;
          })()}
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

      {/* Add / edit event sheet — the SAME form as the calendar page */}
      <EventSheet
        open={showEventSheet}
        onClose={() => { setShowEventSheet(false); setEditingEvent(null); }}
        onSubmit={handleSaveEvent}
        editing={!!editingEvent}
        initial={editingEvent
          ? { title: editingEvent.title, emoji: editingEvent.emoji, onDate: editingEvent.target_date, untilDate: editingEvent.end_date ?? null, parts: (editingEvent.parts as DayPart[] | undefined) ?? undefined, startTime: editingEvent.start_time ?? null, attendee: editingEvent.attendee ?? null }
          : { onDate: today }}
      />

      {/* Countdown action prompt — creator only */}
      <Dialog open={actionCountdown !== null} onClose={() => setActionCountdown(null)}>
        {actionCountdown && (
          <>
            <p className="font-semibold text-foreground text-center truncate">{actionCountdown.emoji} {actionCountdown.title}</p>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-5">this event — what would you like to do?</p>
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

      {/* First-run: trial starts when your partner joins (incentivise inviting). */}
      <Dialog open={showTrialInfo} onClose={() => setShowTrialInfo(false)}>
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
            <Heart className="w-6 h-6" style={{ color: "#D97706" }} fill="currentColor" />
          </div>
        </div>
        <p className="font-semibold text-foreground text-center">invite your partner to unlock premium</p>
        <p className="text-sm text-muted-foreground text-center mt-1 mb-4 leading-relaxed">
          your <span className="font-medium text-foreground">60 days of premium, free</span> begin the moment they join your space — unlimited photos, full history, plan any month & more.
        </p>
        {data.inviteCode && (
          <button
            onClick={() => { navigator.clipboard.writeText(data.inviteCode!); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
            className="w-full flex items-center justify-between bg-secondary rounded-2xl px-4 py-3 mb-3 active:scale-[0.99] transition-transform"
          >
            <div className="text-left">
              <p className="text-[11px] text-muted-foreground mb-0.5">your invite code</p>
              <p className="font-mono text-base font-semibold tracking-widest text-foreground">{data.inviteCode}</p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{codeCopied ? "copied!" : "tap to copy"}</span>
          </button>
        )}
        <Button onClick={() => setShowTrialInfo(false)} className="w-full h-11 rounded-xl">got it</Button>
      </Dialog>

      {/* Join request — "X wants to join your space, accept?" */}
      <Dialog open={joinReq !== null} onClose={() => { if (!joinBusy) setJoinReq(null); }}>
        {joinReq && (
          <>
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-secondary flex items-center justify-center" style={{ boxShadow: `0 0 0 2px ${getAccent(joinReq.accent_color).hex}` }}>
                {joinReq.avatar_url
                  ? <SignedImg src={joinReq.avatar_url} className="w-full h-full object-cover" />
                  : <span className="text-lg font-semibold text-muted-foreground">{(joinReq.name ?? "?")[0]?.toUpperCase()}</span>}
              </div>
            </div>
            <p className="font-semibold text-foreground text-center">{joinReq.name ?? "someone"} wants to join your space</p>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-5">accept to pair up — this is your shared space from here on.</p>
            <div className="space-y-2">
              <Button onClick={() => handleJoinResponse(true)} disabled={joinBusy} className="w-full h-11 rounded-xl">
                {joinBusy ? "…" : "accept"}
              </Button>
              <Button variant="outline" onClick={() => handleJoinResponse(false)} disabled={joinBusy}
                className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light">
                decline
              </Button>
            </div>
          </>
        )}
      </Dialog>

      {/* Layout editor — reorder only */}
      <BottomSheet
        open={showLayoutEditor}
        onClose={() => setShowLayoutEditor(false)}
        title="edit layout"
        footer={<Button onClick={saveLayout} className="w-full h-11 rounded-xl">done</Button>}
      >
        <p className="text-xs text-muted-foreground/60 mb-3">drag the tiles to reorder your home.</p>
        <DndContext sensors={layoutSensors} collisionDetection={closestCenter} onDragEnd={onLayoutDragEnd}>
          <SortableContext items={layoutDraft.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-2">
              {layoutDraft.map((m) => (
                <LayoutTile key={m.id} m={m} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </BottomSheet>
      </div>
    </div>
  );
}

// A draggable tile in the layout editor — drag to reorder the home modules.
function LayoutTile({ m }: { m: DashModule }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-2xl bg-secondary border border-border/50 px-4 py-4 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none touch-none",
        isDragging && "opacity-70 shadow-lg z-10"
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-sm font-medium text-foreground truncate">{MODULE_LABEL[m.id] ?? m.id}</span>
    </div>
  );
}
