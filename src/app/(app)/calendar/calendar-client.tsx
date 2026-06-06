"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { setAvailability, setAvailabilityDay, clearCoupleAvailabilityPart, addEvent, updateEvent, deleteEvent, type DayPart } from "./actions";
import { deleteCountdown } from "@/app/(app)/home/actions";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { OwnerAvatars } from "@/components/ui/owner-avatars";
import { useOwnerIdentity, ownerCardStyle, ownerTint } from "@/lib/owner-identity";
import { cn, clickable } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { getAccent } from "@/lib/accent-colors";
import { useScrolled } from "@/lib/use-scrolled";

interface Row { user_id: string; date: string; part: DayPart; }
interface CalEvent { id: string; title: string; start_at: string; end_at: string | null; emoji: string; created_by: string; all_day: boolean; }

const PARTS: DayPart[] = ["morning", "afternoon", "evening", "night"];
const PART_META: Record<DayPart, { label: string; time: string }> = {
  morning:   { label: "morning",   time: "5–12" },
  afternoon: { label: "afternoon", time: "12–17" },
  evening:   { label: "evening",   time: "17–22" },
  night:     { label: "night",     time: "22–5" },
};
interface Countdown { id: string; title: string; target_date: string; end_date?: string | null; emoji: string; created_by: string; }

const EVENT_EMOJIS = ["📅", "🍽️", "🎬", "🏃", "🎂", "🎵", "💍", "✈️", "🏠", "🎉"];

type CalCache = { rows: Row[]; events: CalEvent[]; countdowns: Countdown[] };

const pad2 = (n: number) => String(n).padStart(2, "0");

// Local calendar date (YYYY-MM-DD) of an instant — used to bucket events into day
// cells in the VIEWER's timezone (timed events store a UTC instant; all-day events
// store a naive local noon). Keeps month placement correct across timezones.
function localDateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// "7pm" / "7:30pm" in the viewer's local timezone.
function fmtTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
  return m === 0 ? `${h}${ap}` : `${h}:${pad2(m)}${ap}`;
}
// "HH:MM" local value for a <input type="time">.
function timeInputOf(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function CalendarClient() {
  const { coupleId, me, partner, partnerName } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const resolveOwner = useOwnerIdentity();
  const searchParams = useSearchParams();
  const [current, setCurrent] = useState(() => new Date());
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [rtick, setRtick] = useState(0);
  const [dayView, setDayView] = useState<string | null>(null);
  const [planContext, setPlanContext] = useState<{ date: string; freeParts: DayPart[] } | null>(null);
  const [selectedParts, setSelectedParts] = useState<DayPart[]>([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [actionEvent, setActionEvent] = useState<CalEvent | null>(null);
  const [actionCountdown, setActionCountdown] = useState<Countdown | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEmoji, setEventEmoji] = useState("📅");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventStartTime, setEventStartTime] = useState("18:00");
  const [eventEndTime, setEventEndTime] = useState("");
  const [, startTransition] = useTransition();

  const scrolled = useScrolled();
  const year = current.getFullYear();
  const month = current.getMonth();

  useEffect(() => { markSeen("calendar"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: ?day=YYYY-MM-DD opens that day's view; ?plan=DATE:part opens the
  // add-event sheet prefilled at the part's default time (from Home's "plan").
  useEffect(() => {
    const plan = searchParams.get("plan");
    const partsParam = searchParams.get("parts");
    const day = searchParams.get("day");
    if (plan) {
      const date = plan;
      const d = new Date(date + "T12:00:00");
      setCurrent(new Date(d.getFullYear(), d.getMonth(), 1));
      const freeParts = ((partsParam?.split(",") ?? []).filter((p) => PARTS.includes(p as DayPart))) as DayPart[];
      setEditingEventId(null);
      setEventTitle(""); setEventEmoji("📅");
      setEventDate(date); setEventEndDate("");
      setEventAllDay(false); setEventStartTime(""); setEventEndTime("");
      setSelectedParts(freeParts);   // default: book the whole free window
      setPlanContext({ date, freeParts });
      setShowAddEvent(true);
    } else if (day) {
      const d = new Date(day + "T12:00:00");
      setCurrent(new Date(d.getFullYear(), d.getMonth(), 1));
      setDayView(day);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    const key = `cal:${coupleId}:${year}:${month}`;
    const cached = getCache<CalCache>(key);
    if (cached) {
      setRows(cached.rows);
      setEvents(cached.events);
      setCountdowns(cached.countdowns);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const supabase = createClient();
    // Use local date parts — .toISOString() shifts to UTC which causes off-by-one in non-UTC timezones
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${year}-${pad(month + 1)}-01`;
    const end = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
    Promise.all([
      supabase
        .from("availability")
        .select("user_id, date, part")
        .eq("couple_id", coupleId)
        .gte("date", start)
        .lte("date", end),
      supabase
        .from("events")
        .select("id, title, start_at, end_at, emoji, created_by, all_day")
        .eq("couple_id", coupleId)
        .gte("start_at", start + "T00:00:00")
        .lte("start_at", end + "T23:59:59")
        .order("start_at"),
      supabase
        .from("countdowns")
        .select("id, title, target_date, end_date, emoji, created_by")
        .eq("couple_id", coupleId)
        .eq("archived", false)
        .gte("target_date", start)
        .lte("target_date", end)
        .order("target_date"),
    ]).then(([{ data: avail }, { data: evts }, { data: cds }]) => {
      const rows = avail ?? [];
      const events = (evts as CalEvent[]) ?? [];
      const countdowns = (cds as Countdown[]) ?? [];
      setRows(rows);
      setEvents(events);
      setCountdowns(countdowns);
      setLoading(false);
      setCache(key, { rows, events, countdowns });
    });
  }, [coupleId, year, month, rtick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates — partner's availability / event changes come in without refresh.
  useEffect(() => {
    const supabase = createClient();
    // Skip our own INSERTs: the optimistic UI already shows them, so reloading
    // would be redundant work. Partner inserts + all edits/deletes still reload.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onChange = (p: any) => {
      if (p.eventType === "INSERT" && (p.new?.created_by === me.id || p.new?.user_id === me.id)) return;
      setRtick((t) => t + 1);
    };
    const channel = supabase.channel(`cal-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "availability", filter: `couple_id=eq.${coupleId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "events",       filter: `couple_id=eq.${coupleId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "countdowns",   filter: `couple_id=eq.${coupleId}` }, onChange)
      .subscribe();
    const onRefresh = () => setRtick((t) => t + 1);
    window.addEventListener("app:refresh", onRefresh);
    return () => { supabase.removeChannel(channel); window.removeEventListener("app:refresh", onRefresh); };
  }, [coupleId, me.id]);

  function isFree(userId: string, dateStr: string, part: DayPart): boolean {
    return rows.some((r) => r.user_id === userId && r.date === dateStr && r.part === part);
  }
  function freeParts(userId: string, dateStr: string): DayPart[] {
    return PARTS.filter((p) => isFree(userId, dateStr, p));
  }
  function bothFree(dateStr: string, part: DayPart): boolean {
    return isFree(me.id, dateStr, part) && !!partner && isFree(partner.id, dateStr, part);
  }
  function dayHasOverlap(dateStr: string): boolean {
    return PARTS.some((p) => bothFree(dateStr, p));
  }

  function getEvents(dateStr: string): CalEvent[] {
    return events.filter((e) => {
      const start = localDateOf(e.start_at);
      const end = e.end_at ? localDateOf(e.end_at) : start;
      return dateStr >= start && dateStr <= end;
    });
  }

  function getCountdownsForDate(dateStr: string): Countdown[] {
    return countdowns.filter((c) => {
      const end = c.end_date ?? c.target_date;
      return dateStr >= c.target_date && dateStr <= end;
    });
  }

  function daysUntil(dateStr: string): number {
    return Math.max(0, Math.floor((new Date(dateStr + "T00:00:00").getTime() - Date.now()) / 86400000));
  }

  function localDateStr(offset = 0) {
    const d = new Date(Date.now() + offset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function countdownLabel(targetDate: string): { top: string; bottom: string | null } {
    const today = localDateStr(0);
    const tomorrow = localDateStr(1);
    if (targetDate === today)    return { top: "today", bottom: null };
    if (targetDate === tomorrow) return { top: "tmrw",  bottom: null };
    return { top: String(daysUntil(targetDate)), bottom: "days" };
  }

  function writeRowsCache(newRows: Row[]) {
    const key = `cal:${coupleId}:${year}:${month}`;
    const existing = getCache<CalCache>(key);
    if (existing) setCache(key, { ...existing, rows: newRows });
  }

  // Toggle a single part free/not for me on a given day (optimistic + persist).
  function handlePart(dateStr: string, part: DayPart) {
    const free = !isFree(me.id, dateStr, part);
    setRows((prev) => {
      const filtered = prev.filter((r) => !(r.user_id === me.id && r.date === dateStr && r.part === part));
      const newRows = free ? [...filtered, { user_id: me.id, date: dateStr, part }] : filtered;
      writeRowsCache(newRows);
      return newRows;
    });
    markActivity("calendar");
    startTransition(() => { setAvailability(coupleId, me.id, dateStr, part, free); });
  }

  // Free or clear a whole day (all four parts) for me.
  function handleAllDay(dateStr: string, free: boolean) {
    setRows((prev) => {
      const filtered = prev.filter((r) => !(r.user_id === me.id && r.date === dateStr));
      const newRows = free ? [...filtered, ...PARTS.map((p) => ({ user_id: me.id, date: dateStr, part: p }))] : filtered;
      writeRowsCache(newRows);
      return newRows;
    });
    markActivity("calendar");
    startTransition(() => { setAvailabilityDay(coupleId, me.id, dateStr, free); });
  }

  useRegisterFab(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setEditingEventId(null);
    setEventTitle(""); setEventEmoji("📅");
    setEventDate(today);
    setEventEndDate("");
    setEventAllDay(false); setEventStartTime("18:00"); setEventEndTime("");
    setShowAddEvent(true);
  });

  function handleSaveEvent() {
    if (!eventTitle.trim() || !eventDate) return;
    if (planContext && selectedParts.length === 0) return;
    const title = eventTitle.trim();
    // In plan mode there's no all-day toggle — a time makes it timed, no time = all-day.
    const allDay = planContext ? !eventStartTime : eventAllDay;
    // All-day: store a naive local noon so .slice/date display stays tz-stable.
    // Timed: store a real UTC instant (via toISOString from the viewer's local
    // time) so it renders correctly in each partner's own timezone.
    let startAt: string;
    let endAt: string | null;
    if (allDay) {
      startAt = eventDate + "T12:00:00";
      endAt = eventEndDate ? eventEndDate + "T12:00:00" : null;
    } else {
      startAt = new Date(`${eventDate}T${eventStartTime || "12:00"}`).toISOString();
      endAt = eventEndTime
        ? new Date(`${eventEndDate || eventDate}T${eventEndTime}`).toISOString()
        : (eventEndDate ? eventEndDate + "T12:00:00" : null);
    }
    if (editingEventId) {
      const id = editingEventId;
      setEvents((prev) => prev
        .map((e) => e.id === id ? { ...e, title, start_at: startAt, end_at: endAt, emoji: eventEmoji, all_day: allDay } : e)
        .sort((a, b) => a.start_at.localeCompare(b.start_at)));
      startTransition(() => { updateEvent({ id, coupleId, userId: me.id, title, startAt, endAt, emoji: eventEmoji, allDay }); });
    } else {
      const optimistic: CalEvent = { id: crypto.randomUUID(), title, start_at: startAt, end_at: endAt, emoji: eventEmoji, created_by: me.id, all_day: allDay };
      setEvents((prev) => [...prev, optimistic].sort((a, b) => a.start_at.localeCompare(b.start_at)));
      markActivity("calendar");
      track("event_created", { multi_day: !!eventEndDate, all_day: allDay });
      startTransition(() => { addEvent({ coupleId, userId: me.id, title, startAt, endAt, emoji: eventEmoji, allDay }); });
    }
    // Planning a free window books it: clear that date+part for both partners so
    // they no longer show as free then.
    if (planContext) {
      const date = planContext.date;
      const parts = selectedParts;
      setRows((prev) => prev.filter((r) => !(r.date === date && parts.includes(r.part))));
      startTransition(() => { for (const p of parts) clearCoupleAvailabilityPart(coupleId, date, p); });
    }
    setEventTitle(""); setEventEndDate(""); setEventEmoji("📅");
    setEventAllDay(false); setEventStartTime("18:00"); setEventEndTime("");
    setPlanContext(null); setSelectedParts([]); setEditingEventId(null); setShowAddEvent(false);
  }

  function openEditEvent(evt: CalEvent) {
    setActionEvent(null);
    setEditingEventId(evt.id);
    setEventTitle(evt.title);
    setEventEmoji(evt.emoji);
    setEventDate(localDateOf(evt.start_at));
    setEventEndDate(evt.end_at ? localDateOf(evt.end_at) : "");
    setEventAllDay(evt.all_day);
    setEventStartTime(evt.all_day ? "18:00" : timeInputOf(evt.start_at));
    setEventEndTime(evt.all_day || !evt.end_at ? "" : timeInputOf(evt.end_at));
    setShowAddEvent(true);
  }

  function handleDeleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setActionEvent(null);
    startTransition(() => { deleteEvent(id, coupleId, me.id); });
  }

  function handleDeleteCountdownCal(id: string) {
    setCountdowns((prev) => prev.filter((c) => c.id !== id));
    setActionCountdown(null);
    startTransition(() => { deleteCountdown(id, coupleId, me.id); });
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = current.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const overlaps = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return dayHasOverlap(d);
  }).filter(Boolean).length;

  return (
    <div className="max-w-lg mx-auto pb-8">

      {/* ── Header (sticky) ───────────────────────────────── */}
      <div className={cn("hdr-float sticky top-0 z-30 bg-background px-5 pt-10 pb-3 border-b transition-[border-color,box-shadow]", scrolled ? "border-border/60 shadow-soft" : "border-transparent")}>
        <h1 className="font-heading text-3xl text-foreground tracking-tight">calendar.</h1>
        <p className={cn("text-sm mt-0.5", overlaps > 0 ? "text-sage font-medium" : "text-muted-foreground/70")}>
          {overlaps > 0
            ? `${overlaps} free day${overlaps !== 1 ? "s" : ""} together this month`
            : "mark your free days"}
        </p>
      </div>

      {/* ── Month nav ──────────────────────────────────────── */}
      <div className="flex items-center px-3 py-3">
        <button
          onClick={() => setCurrent(new Date(year, month - 1, 1))}
          aria-label="previous month"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="flex-1 text-center text-sm font-semibold text-foreground">{monthLabel}</p>
        <button
          onClick={() => setCurrent(new Date(year, month + 1, 1))}
          aria-label="next month"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Day headers ────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground/40 pb-1">{d}</div>
        ))}
      </div>

      {/* ── Grid ───────────────────────────────────────────── */}
      {(
        <div className="grid grid-cols-7 gap-y-2 px-2">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isPast = ds < todayStr;
            const isToday = ds === todayStr;
            const overlap = dayHasOverlap(ds);
            const dayEvents = getEvents(ds);
            const dayCds = getCountdownsForDate(ds);
            const isEventDay = dayEvents.length > 0 || dayCds.length > 0;
            const dayEmojis = isEventDay ? [...dayEvents.map(e => e.emoji), ...dayCds.map(c => c.emoji)] : [];
            const myFree = freeParts(me.id, ds);
            const theirFree = partner ? freeParts(partner.id, ds) : [];
            const hasAvail = myFree.length > 0 || theirFree.length > 0;
            const availLabel = [
              isEventDay ? `, ${dayEmojis.length > 1 ? `${dayEmojis.length} events` : "event"}` : "",
              myFree.length ? `, you free ${myFree.join(", ")}` : "",
            ].join("");

            return (
              <button
                key={i}
                onClick={() => setDayView(ds)}
                aria-label={`${day} ${monthLabel}${availLabel}`}
                className={cn(
                  "aspect-square w-full flex flex-col items-center justify-center gap-1 rounded-2xl relative transition-all select-none",
                  overlap && "bg-[var(--free-cell)]",
                  isPast && "opacity-30",
                )}
              >
                {/* Day number — today gets a filled circle */}
                {isToday ? (
                  <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center">
                    <span className="text-[11px] font-bold text-background leading-none">{day}</span>
                  </div>
                ) : (
                  <span className={cn(
                    "text-xs font-semibold leading-none",
                    overlap ? "text-[var(--free-ink)] font-bold" : "text-foreground/75",
                  )}>
                    {day}
                  </span>
                )}

                {/* Event emoji(s) */}
                {isEventDay && (
                  <div className="flex items-center justify-center gap-0.5 leading-none">
                    {dayEmojis.slice(0, 2).map((em, k) => (
                      <span key={k} className="text-[10px] leading-none">{em}</span>
                    ))}
                    {dayEmojis.length > 2 && (
                      <span className="text-[8px] font-semibold text-muted-foreground/70 leading-none">+{dayEmojis.length - 2}</span>
                    )}
                  </div>
                )}

                {/* 4-part availability bar (morning · afternoon · evening · night).
                    Only shown when there's some availability, to keep empty days calm. */}
                {hasAvail ? (
                  <div className="flex w-6 h-1 rounded-full overflow-hidden">
                    {PARTS.map((p) => {
                      const both = bothFree(ds, p);
                      const mineP = isFree(me.id, ds, p);
                      const theirsP = partner ? isFree(partner.id, ds, p) : false;
                      const segStyle = both
                        ? { backgroundColor: "var(--free-ink)" }
                        : mineP
                        ? { backgroundColor: myAccent.hex }
                        : theirsP
                        ? { backgroundColor: partnerAccent.hex, opacity: 0.6 }
                        : { backgroundColor: "rgba(127,127,127,0.14)" };
                      return <span key={p} className="flex-1 h-full" style={segStyle} />;
                    })}
                  </div>
                ) : (
                  <div className="h-1" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Always-visible compact legend ──────────────────── */}
      <div className="px-5 mt-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: myAccent.hex }} />
          <span className="text-xs text-muted-foreground/60">you free</span>
        </div>
        {partner && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: partnerAccent.hex, opacity: 0.65 }} />
            <span className="text-xs text-muted-foreground/60">{partnerName} free</span>
          </div>
        )}
        {partner && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[var(--free-cell)]" />
            <span className="text-xs text-muted-foreground/60">both free</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] leading-none">📅</span>
          <span className="text-xs text-muted-foreground/60">event</span>
        </div>
      </div>
      <p className="px-5 mt-1.5 text-[11px] text-muted-foreground/45">tap a day to set your free times</p>

      {/* ── Events this month ──────────────────────────────── */}
      <div className="px-5 mt-8">
        {!loading && events.length === 0 && countdowns.length === 0 && (
          <div className="flex flex-col items-center py-6 gap-2">
            <p className="text-sm text-muted-foreground">no events this month</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              tap the
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-foreground">
                <Plus className="w-3 h-3 text-background" strokeWidth={2.5} />
              </span>
              to add an event
            </div>
          </div>
        )}

        {!loading && (events.length > 0 || countdowns.length > 0) && (() => {
          type Item =
            | { kind: "event"; data: CalEvent }
            | { kind: "countdown"; data: Countdown };
          const items: Item[] = [
            ...events.map((e) => ({ kind: "event" as const, data: e })),
            ...countdowns.map((c) => ({ kind: "countdown" as const, data: c })),
          ].sort((a, b) => {
            const da = a.kind === "event" ? a.data.start_at.slice(0, 10) : a.data.target_date;
            const db = b.kind === "event" ? b.data.start_at.slice(0, 10) : b.data.target_date;
            return da.localeCompare(db);
          });

          return (
            <div>
              <p className="text-xs text-muted-foreground/50 font-medium tracking-wide mb-3">events this month</p>
              <div className="space-y-2">
                {items.map((item) => {
                  if (item.kind === "event") {
                    const evt = item.data;
                    const d = new Date(evt.start_at);
                    const o = resolveOwner(evt.created_by);
                    return (
                      <div
                        key={evt.id}
                        {...clickable(() => setActionEvent(evt))}
                        className="card-row overflow-hidden px-4 py-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                        style={ownerCardStyle(o)}
                      >
                        <span className="text-xl flex-shrink-0">{evt.emoji}</span>
                        <OwnerAvatars people={o.people} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{evt.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                            {evt.all_day
                              ? (evt.end_at && ` – ${new Date(evt.end_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`)
                              : ` · ${fmtTime(evt.start_at)}${evt.end_at ? `–${fmtTime(evt.end_at)}` : ""}`}
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    const cd = item.data;
                    const { top, bottom } = countdownLabel(cd.target_date);
                    const d = new Date(cd.target_date + "T12:00:00");
                    const o = resolveOwner(null); // countdowns are shared
                    return (
                      <div
                        key={cd.id}
                        {...clickable(() => setActionCountdown(cd))}
                        className="card-row overflow-hidden px-4 py-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                        style={ownerCardStyle(o)}
                      >
                        <span className="text-xl flex-shrink-0">{cd.emoji}</span>
                        <OwnerAvatars people={o.people} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{cd.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                            {cd.end_date && ` – ${new Date(cd.end_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 min-w-[2.5rem]">
                          <p className="text-sm font-semibold text-foreground">{top}</p>
                          {bottom && <p className="text-[10px] text-muted-foreground">{bottom}</p>}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Day view — set your free parts + see the day's events */}
      <BottomSheet
        open={dayView !== null}
        onClose={() => setDayView(null)}
        title={dayView ? new Date(dayView + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : ""}
      >
        {dayView && (() => {
          const ds = dayView;
          const past = ds < todayStr;
          const myAll = PARTS.every((p) => isFree(me.id, ds, p));
          const dayEvts = getEvents(ds);
          return (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-medium text-muted-foreground tracking-wide">your free times</p>
                  {!past && (
                    <button
                      onClick={() => handleAllDay(ds, !myAll)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {myAll ? "clear day" : "free all day"}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {PARTS.map((p) => {
                    const mineP = isFree(me.id, ds, p);
                    const theirsP = partner ? isFree(partner.id, ds, p) : false;
                    const both = mineP && theirsP;
                    return (
                      <button
                        key={p}
                        onClick={() => !past && handlePart(ds, p)}
                        disabled={past}
                        aria-pressed={mineP}
                        className={cn(
                          "w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-colors text-left",
                          both ? "bg-[var(--free-cell)]" : !mineP ? "bg-secondary" : "",
                          past && "opacity-50 cursor-default",
                        )}
                        style={mineP && !both ? { backgroundColor: ownerTint(myAccent.hex) } : undefined}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-medium text-foreground capitalize">{PART_META[p].label}</span>
                          <span className="text-[11px] text-muted-foreground/50 tabular-nums">{PART_META[p].time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {both ? (
                            <span className="text-[11px] font-medium text-[var(--free-ink)]">both free</span>
                          ) : (
                            <>
                              {mineP && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: myAccent.hex }} />}
                              {theirsP && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: partnerAccent.hex, opacity: 0.65 }} />}
                              {!mineP && !theirsP && <span className="text-[11px] text-muted-foreground/40">tap if free</span>}
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {partner && (
                  <p className="text-[11px] text-muted-foreground/45 mt-2">
                    a coloured dot shows when {partnerName}&apos;s free; highlighted rows are free for both of you.
                  </p>
                )}
              </div>

              {dayEvts.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2.5">events</p>
                  <div className="space-y-1.5">
                    {dayEvts.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-2.5 rounded-xl bg-secondary/60 px-3 py-2">
                        <span className="text-base flex-shrink-0">{evt.emoji}</span>
                        <span className="text-sm text-foreground flex-1 truncate">{evt.title}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                          {evt.all_day ? "all day" : fmtTime(evt.start_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/* Add / edit event sheet */}
      <BottomSheet
        open={showAddEvent}
        onClose={() => { setShowAddEvent(false); setEditingEventId(null); setPlanContext(null); setSelectedParts([]); }}
        title={editingEventId ? "edit event" : planContext ? "plan your free time" : "new event"}
        footer={
          <Button onClick={handleSaveEvent} disabled={!eventTitle.trim() || !eventDate || (!!planContext && selectedParts.length === 0)} className="w-full h-12 rounded-2xl text-[15px]">
            {editingEventId ? "save" : planContext ? "book it" : "add event"}
          </Button>
        }
      >
        {planContext && (
          <div>
            <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">block out</p>
            <div className="flex gap-1.5 flex-wrap">
              {planContext.freeParts.map((p) => {
                const single = planContext.freeParts.length === 1;
                const on = selectedParts.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={single}
                    onClick={() => setSelectedParts((prev) => on ? prev.filter((x) => x !== p) : [...prev, p])}
                    className={cn("px-3.5 h-9 rounded-xl text-xs font-medium capitalize transition-colors", on ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}
                  >
                    {PART_META[p].label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-sage mt-1.5">
              {planContext.freeParts.length === 1
                ? `your free ${PART_META[planContext.freeParts[0]].label} will be booked`
                : "tap the parts you're booking — they'll no longer show as free"}
            </p>
          </div>
        )}
        <Input
          value={eventTitle}
          onChange={(e) => setEventTitle(e.target.value)}
          placeholder="what's happening?"
          className="h-12 rounded-2xl bg-secondary border-0 text-[15px]"
        />
        <div>
          <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2.5">emoji</p>
          <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {EVENT_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEventEmoji(e)}
                className={cn(
                  "w-11 h-11 rounded-2xl text-xl flex items-center justify-center flex-shrink-0 transition-all",
                  eventEmoji === e ? "bg-foreground" : "bg-secondary"
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        {/* All-day toggle (hidden when planning a free window) */}
        {!planContext && (
        <button
          type="button"
          onClick={() => setEventAllDay((v) => !v)}
          aria-pressed={eventAllDay}
          className={cn(
            "flex items-center justify-between w-full rounded-2xl px-4 h-12 transition-colors",
            eventAllDay ? "bg-foreground text-background" : "bg-secondary text-foreground"
          )}
        >
          <span className="text-sm font-medium">all day</span>
          <span className={cn("relative w-9 h-5 rounded-full transition-colors", eventAllDay ? "bg-background/30" : "bg-foreground/15")}>
            <span className={cn(
              "absolute top-0.5 w-4 h-4 rounded-full transition-all",
              eventAllDay ? "left-[1.15rem] bg-background" : "left-0.5 bg-foreground/50"
            )} />
          </span>
        </button>
        )}

        {/* Time — timed events, and the optional "be specific" time when planning */}
        {!eventAllDay && (
          <div>
            <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2.5">time {planContext && <span className="normal-case font-normal opacity-50">(optional)</span>}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative rounded-2xl overflow-hidden">
                <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">from</p>
                  <p className="text-sm font-medium text-foreground">{eventStartTime || "select"}</p>
                </div>
                <input type="time" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
              </div>
              <div className="relative rounded-2xl overflow-hidden">
                <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">to <span className="normal-case font-normal opacity-50">(optional)</span></p>
                  <p className={cn("text-sm font-medium", eventEndTime ? "text-foreground" : "text-muted-foreground/40")}>{eventEndTime || "select"}</p>
                </div>
                <input type="time" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
              </div>
            </div>
          </div>
        )}

        {!planContext && (
        <div>
          <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2.5">dates</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative rounded-2xl overflow-hidden">
              <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">starts</p>
                <p className={cn("text-sm font-medium", eventDate ? "text-foreground" : "text-muted-foreground/40")}>
                  {eventDate ? new Date(eventDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                </p>
              </div>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            </div>
            <div className="relative rounded-2xl overflow-hidden">
              <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">ends <span className="normal-case font-normal opacity-50">(optional)</span></p>
                <p className={cn("text-sm font-medium", eventEndDate ? "text-foreground" : "text-muted-foreground/40")}>
                  {eventEndDate ? new Date(eventEndDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                </p>
              </div>
              <input type="date" value={eventEndDate} min={eventDate} onChange={(e) => setEventEndDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            </div>
          </div>
        </div>
        )}
      </BottomSheet>

      {/* Event action prompt — creator only */}
      <Dialog open={actionEvent !== null} onClose={() => setActionEvent(null)}>
        {actionEvent && (
          <>
            <p className="font-semibold text-foreground text-center truncate">{actionEvent.emoji} {actionEvent.title}</p>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-5">what would you like to do?</p>
            <div className="space-y-2">
              <Button onClick={() => openEditEvent(actionEvent)} className="w-full h-11 rounded-xl">
                <Pencil className="w-4 h-4 mr-1.5" /> edit
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDeleteEvent(actionEvent.id)}
                className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> remove
              </Button>
              <button onClick={() => setActionEvent(null)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
            </div>
          </>
        )}
      </Dialog>

      {/* Countdown action prompt — creator only (edit lives on the home page) */}
      <Dialog open={actionCountdown !== null} onClose={() => setActionCountdown(null)}>
        {actionCountdown && (
          <>
            <p className="font-semibold text-foreground text-center truncate">{actionCountdown.emoji} {actionCountdown.title}</p>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-5">remove this countdown? edit it from the home page.</p>
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => handleDeleteCountdownCal(actionCountdown.id)}
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
  );
}
