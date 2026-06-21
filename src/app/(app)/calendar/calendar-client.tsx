"use client";

import { useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { setAvailability, setAvailabilityDay, addEvent, updateEvent, deleteEvent, type DayPart } from "./actions";
import { PARTS, PART_META, fmtTimeLabel, partsLabel } from "@/lib/day-parts";
import { EventSheet, type EventDraft } from "@/components/event-sheet";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { useRegisterFab } from "@/contexts/fab-context";
import { useEntitlement } from "@/contexts/entitlement-context";
import { useNotifications } from "@/contexts/notification-context";
import { Button } from "@/components/ui/button";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { OwnerAvatars } from "@/components/ui/owner-avatars";
import { useOwnerIdentity, ownerTint } from "@/lib/owner-identity";
import { cn, clickable } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { undoableDelete } from "@/lib/toast";
import { getAccent } from "@/lib/accent-colors";
import { useScrolled } from "@/lib/use-scrolled";

interface Row { user_id: string; date: string; part: DayPart; }
interface CalEvent { id: string; title: string; emoji: string; on_date: string; parts: DayPart[]; until_date: string | null; start_time: string | null; created_by: string; attendee: string | null; }

type CalCache = { rows: Row[]; events: CalEvent[] };

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function CalendarClient({ live = true }: { live?: boolean }) {
  const { coupleId, me, partner, partnerName } = useCouple();
  const { markActivity } = useNotifications();
  const { premium, openPaywall } = useEntitlement();

  // Free plan can view any month but only plan in the current one.
  function plannableMonth(dateStr: string): boolean {
    if (premium) return true;
    const now = new Date();
    const [y, m] = dateStr.split("-").map(Number); // m is 1-based
    const future = y > now.getFullYear() || (y === now.getFullYear() && m - 1 > now.getMonth());
    if (future) { openPaywall("calendar"); return false; }
    return true;
  }

  // Free plan is limited to the current month — navigating away prompts upgrade.
  function goToMonth(target: Date) {
    if (!premium) {
      const now = new Date();
      if (target.getFullYear() !== now.getFullYear() || target.getMonth() !== now.getMonth()) {
        openPaywall("calendar"); return;
      }
    }
    setCurrent(target);
  }
  const resolveOwner = useOwnerIdentity();
  const searchParams = useSearchParams();
  const [current, setCurrent] = useState(() => new Date());
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rtick, setRtick] = useState(0);
  const [dayView, setDayView] = useState<string | null>(null);
  const [planContext, setPlanContext] = useState<{ date: string; freeParts: DayPart[] } | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null);
  const [composeDate, setComposeDate] = useState("");   // default date for a new event
  const [actionEvent, setActionEvent] = useState<CalEvent | null>(null);
  const [, startTransition] = useTransition();

  const scrolled = useScrolled();
  const year = current.getFullYear();
  const month = current.getMonth();


  // Deep-link: ?day=YYYY-MM-DD opens that day's view; ?plan=DATE&parts=… opens the
  // add-event sheet on a free window (from Home's "plan"). Reacts to the params
  // (not just mount) so it works while the calendar stays mounted in the tab shell.
  const planParam = searchParams.get("plan");
  const partsParam = searchParams.get("parts");
  const dayParam = searchParams.get("day");
  useEffect(() => {
    if (planParam) {
      const date = planParam;
      const d = new Date(date + "T12:00:00");
      setCurrent(new Date(d.getFullYear(), d.getMonth(), 1));
      const freeParts = ((partsParam?.split(",") ?? []).filter((p) => PARTS.includes(p as DayPart))) as DayPart[];
      setEditEvent(null);
      setComposeDate(date);
      setPlanContext({ date, freeParts });
      setShowAddEvent(true);
    } else if (dayParam) {
      const d = new Date(dayParam + "T12:00:00");
      setCurrent(new Date(d.getFullYear(), d.getMonth(), 1));
      setDayView(dayParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planParam, partsParam, dayParam]);


  useEffect(() => {
    const key = `cal:${coupleId}:${year}:${month}`;
    const cached = getCache<CalCache>(key);
    if (cached) {
      setRows(cached.rows);
      setEvents(cached.events);
      setLoading(false);
    } else {
      setLoading(true);
    }
    // Far panes show the cache above but skip the network fetch — they refetch
    // when this tab enters the live window (active or adjacent).
    if (!live) return;
    const supabase = createClient();
    // Use local date parts — .toISOString() shifts to UTC which causes off-by-one in non-UTC timezones.
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const start = fmt(new Date(year, month, 1));
    const end = fmt(new Date(year, month + 1, 0));
    Promise.all([
      supabase
        .from("availability")
        .select("user_id, date, part")
        .eq("couple_id", coupleId)
        .gte("date", start)
        .lte("date", end),
      supabase
        .from("events")
        .select("id, title, emoji, created_by, attendee, on_date, parts, until_date, start_time")
        .eq("couple_id", coupleId)
        .lte("on_date", end)
        .or(`until_date.gte.${start},on_date.gte.${start}`)
        .order("on_date"),
    ]).then(([{ data: avail }, { data: evts }]) => {
      const rows = (avail ?? []) as Row[];
      const events = (evts as unknown as CalEvent[]) ?? [];
      setRows(rows);
      setEvents(events);
      setLoading(false);
      setCache(key, { rows, events });
    });
  }, [coupleId, year, month, rtick, live]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates — partner's availability / event changes come in without refresh.
  // Only the active tab + neighbours subscribe; far tabs drop their channel.
  useEffect(() => {
    if (!live) return;
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
      .subscribe();
    const onRefresh = () => setRtick((t) => t + 1);
    window.addEventListener("app:refresh", onRefresh);
    return () => { supabase.removeChannel(channel); window.removeEventListener("app:refresh", onRefresh); };
  }, [coupleId, me.id, live]);

  function isFree(userId: string, dateStr: string, part: DayPart): boolean {
    return rows.some((r) => r.user_id === userId && r.date === dateStr && r.part === part);
  }
  function freeParts(userId: string, dateStr: string): DayPart[] {
    return PARTS.filter((p) => isFree(userId, dateStr, p));
  }
  function getEvents(dateStr: string): CalEvent[] {
    return events.filter((e) => {
      const end = e.until_date ?? e.on_date;
      return dateStr >= e.on_date && dateStr <= end;
    });
  }
  // A part is booked if any event covers it. Multi-day events occupy every part
  // of each day they span; single-day events occupy just their chosen parts.
  function isBooked(dateStr: string, part: DayPart): boolean {
    return getEvents(dateStr).some((e) =>
      (!!e.until_date && e.until_date > e.on_date) || e.parts.includes(part));
  }
  // Free together = both marked free AND no event has booked that part.
  function bothFree(dateStr: string, part: DayPart): boolean {
    return isFree(me.id, dateStr, part) && !!partner && isFree(partner.id, dateStr, part) && !isBooked(dateStr, part);
  }
  function dayHasOverlap(dateStr: string): boolean {
    return PARTS.some((p) => bothFree(dateStr, p));
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
    if (!plannableMonth(dateStr)) return;
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
    if (!plannableMonth(dateStr)) return;
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
    setEditEvent(null);
    setComposeDate(today);
    setPlanContext(null);
    setShowAddEvent(true);
  });

  function closeEventSheet() {
    setShowAddEvent(false); setEditEvent(null); setPlanContext(null);
  }

  // Booking is derived (a part with an event no longer shows as free together),
  // so there's nothing to clear — saving the event is enough.
  function handleSaveEvent(draft: EventDraft) {
    const { title, emoji, onDate, parts, untilDate, startTime, attendee } = draft;
    if (!plannableMonth(onDate)) { closeEventSheet(); return; }
    if (editEvent) {
      const id = editEvent.id;
      setEvents((prev) => prev
        .map((e) => e.id === id ? { ...e, title, emoji, on_date: onDate, parts, until_date: untilDate, start_time: startTime, attendee } : e)
        .sort((a, b) => a.on_date.localeCompare(b.on_date)));
      startTransition(() => { updateEvent({ id, coupleId, userId: me.id, title, onDate, parts, untilDate, startTime, emoji, attendee }); });
    } else {
      const optimistic: CalEvent = { id: crypto.randomUUID(), title, emoji, on_date: onDate, parts, until_date: untilDate, start_time: startTime, created_by: me.id, attendee };
      setEvents((prev) => [...prev, optimistic].sort((a, b) => a.on_date.localeCompare(b.on_date)));
      markActivity("calendar");
      track("event_created", { multi_day: !!untilDate, parts: parts.length });
      startTransition(() => { addEvent({ id: optimistic.id, coupleId, userId: me.id, title, onDate, parts, untilDate, startTime, emoji, attendee }); });
    }
    closeEventSheet();
  }

  function openEditEvent(evt: CalEvent) {
    setActionEvent(null);
    setEditEvent(evt);
    setPlanContext(null);
    setShowAddEvent(true);
  }

  function handleDeleteEvent(id: string) {
    const ev = events.find((e) => e.id === id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setActionEvent(null);
    if (!ev) { startTransition(() => deleteEvent(id, coupleId, me.id)); return; }
    undoableDelete({
      message: "event removed",
      commit: () => startTransition(() => deleteEvent(id, coupleId, me.id)),
      restore: () => setEvents((prev) => [...prev, ev].sort((a, b) => a.on_date.localeCompare(b.on_date))),
    });
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const monthLabel = current.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const overlaps = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return dayHasOverlap(d);
  }).filter(Boolean).length;

  // One month's 7-col grid, for any month — rendered three-up by the MonthSwiper.
  function renderMonth(base: Date) {
    const y = base.getFullYear();
    const m = base.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const startOffset = (firstDay + 6) % 7;
    const mLabel = base.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const monthCells: (number | null)[] = [
      ...Array(startOffset).fill(null),
      ...Array.from({ length: dim }, (_, i) => i + 1),
    ];
    while (monthCells.length % 7 !== 0) monthCells.push(null);

    // Only this month's events (the data window spans 3 months for the swipe peek).
    const mm = String(m + 1).padStart(2, "0");
    const monthStart = `${y}-${mm}-01`;
    const monthEnd = `${y}-${mm}-${String(dim).padStart(2, "0")}`;
    const monthEvents = events.filter((e) => e.on_date <= monthEnd && (e.until_date ?? e.on_date) >= monthStart);

    return (
      <div className="pb-2">
      <div className="grid grid-cols-7 gap-y-2 px-2">
        {monthCells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast = ds < todayStr;
          const isToday = ds === todayStr;
          const overlap = dayHasOverlap(ds);
          const dayEvents = getEvents(ds);
          const isEventDay = dayEvents.length > 0;
          const dayEmojis = isEventDay ? dayEvents.map((e) => e.emoji) : [];
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
              aria-label={`${day} ${mLabel}${availLabel}`}
              className={cn(
                "aspect-square w-full flex flex-col items-center justify-center gap-1 rounded-2xl relative transition-all select-none",
                overlap && "bg-[var(--free-cell)]",
                isPast && "opacity-30",
              )}
            >
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

      {/* ── Legend ─────────────────────────────────────────── */}
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
      <div className="px-5 mt-8 min-h-[40vh]">
        {!loading && monthEvents.length === 0 && (
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

        {!loading && monthEvents.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground/50 font-medium tracking-wide mb-3">events this month</p>
            <div className="space-y-2">
              {monthEvents.map((evt) => {
                const d = new Date(evt.on_date + "T12:00:00");
                const o = resolveOwner(evt.attendee ?? null);
                const badge = evt.on_date >= todayStr ? countdownLabel(evt.on_date) : null;
                return (
                  <div
                    key={evt.id}
                    {...clickable(() => setActionEvent(evt))}
                    className="card-row overflow-hidden px-4 py-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                  >
                    <span className="text-xl flex-shrink-0">{evt.emoji}</span>
                    <OwnerAvatars people={o.people} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{evt.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                        {evt.until_date && evt.until_date > evt.on_date
                          ? ` – ${new Date(evt.until_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                          : ` · ${partsLabel(evt.parts)}`}
                        {evt.start_time && ` · ${fmtTimeLabel(evt.start_time)}`}
                      </p>
                    </div>
                    {badge && (
                      <div className="text-right flex-shrink-0 min-w-[2.5rem]">
                        <p className="text-sm font-semibold text-foreground">{badge.top}</p>
                        {badge.bottom && <p className="text-[10px] text-muted-foreground">{badge.bottom}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-8">

      {/* ── Header (sticky) ───────────────────────────────── */}
      <div className={cn("hdr-float sticky top-0 z-30 bg-background px-5 pt-10 pb-3 border-b transition-[border-color,box-shadow]", scrolled ? "border-border/60 shadow-soft" : "border-transparent")}>
        <h1 className="font-heading text-3xl text-foreground tracking-tight">calendar.</h1>
        <p key={monthLabel} className={cn("swap-fade text-sm mt-0.5", overlaps > 0 ? "text-sage font-medium" : "text-muted-foreground/70")}>
          {overlaps > 0
            ? `${overlaps} free day${overlaps !== 1 ? "s" : ""} together this month`
            : "mark your free days"}
        </p>
      </div>

      {/* ── Month nav ──────────────────────────────────────── */}
      <div className="flex items-center px-3 py-3">
        <button
          onClick={() => goToMonth(new Date(year, month - 1, 1))}
          aria-label="previous month"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p key={monthLabel} className="swap-fade flex-1 text-center text-sm font-semibold text-foreground">{monthLabel}</p>
        <button
          onClick={() => goToMonth(new Date(year, month + 1, 1))}
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

      {/* ── Grid + legend + events (month changes via the arrows above) ── */}
      {renderMonth(current)}

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
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">
                          {evt.start_time ? fmtTimeLabel(evt.start_time) : partsLabel(evt.parts)}
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

      {/* Add / edit event sheet — shared with Home */}
      <EventSheet
        open={showAddEvent}
        onClose={closeEventSheet}
        onSubmit={handleSaveEvent}
        editing={!!editEvent}
        planContext={planContext}
        initial={editEvent
          ? { title: editEvent.title, emoji: editEvent.emoji, onDate: editEvent.on_date, parts: editEvent.parts, untilDate: editEvent.until_date, startTime: editEvent.start_time, attendee: editEvent.attendee }
          : { onDate: composeDate }}
      />

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
    </div>
  );
}
