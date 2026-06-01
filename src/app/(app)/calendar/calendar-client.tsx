"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { setAvailability, addEvent, updateEvent, deleteEvent } from "./actions";
import { deleteCountdown } from "@/app/(app)/home/actions";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { OwnerAvatars } from "@/components/ui/owner-avatars";
import { useOwnerIdentity, cardOmbre } from "@/lib/owner-identity";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

type Status = "free" | null;
interface Row { user_id: string; date: string; status: Status; }
interface CalEvent { id: string; title: string; start_at: string; end_at: string | null; emoji: string; created_by: string; }
interface Countdown { id: string; title: string; target_date: string; end_date?: string | null; emoji: string; created_by: string; }

const EVENT_EMOJIS = ["📅", "🍽️", "🎬", "🏃", "🎂", "🎵", "💍", "✈️", "🏠", "🎉"];

type CalCache = { rows: Row[]; events: CalEvent[]; countdowns: Countdown[] };

export default function CalendarClient() {
  const { coupleId, me, partner, partnerName } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const resolveOwner = useOwnerIdentity();
  const [current, setCurrent] = useState(() => new Date());
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [actionEvent, setActionEvent] = useState<CalEvent | null>(null);
  const [actionCountdown, setActionCountdown] = useState<Countdown | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEmoji, setEventEmoji] = useState("📅");
  const [, startTransition] = useTransition();

  const year = current.getFullYear();
  const month = current.getMonth();

  useEffect(() => { markSeen("calendar"); }, []); // eslint-disable-line react-hooks/exhaustive-deps


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
        .select("user_id, date, status")
        .eq("couple_id", coupleId)
        .gte("date", start)
        .lte("date", end),
      supabase
        .from("events")
        .select("id, title, start_at, end_at, emoji, created_by")
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
  }, [coupleId, year, month]);

  function getStatus(userId: string, dateStr: string): Status {
    return rows.find((r) => r.user_id === userId && r.date === dateStr)?.status ?? null;
  }

  function getEvents(dateStr: string): CalEvent[] {
    return events.filter((e) => {
      const start = e.start_at.slice(0, 10);
      const end = e.end_at ? e.end_at.slice(0, 10) : start;
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

  function handleDay(dateStr: string) {
    const cur = getStatus(me.id, dateStr);
    const next: Status = cur === "free" ? null : "free";
    setRows((prev) => {
      const filtered = prev.filter((r) => !(r.user_id === me.id && r.date === dateStr));
      const newRows = next ? [...filtered, { user_id: me.id, date: dateStr, status: next }] : filtered;
      // Write through to cache so navigation away and back restores current state
      const key = `cal:${coupleId}:${year}:${month}`;
      const existing = getCache<CalCache>(key);
      if (existing) setCache(key, { ...existing, rows: newRows });
      return newRows;
    });
    markActivity("calendar");
    startTransition(() => { setAvailability(coupleId, me.id, dateStr, next); });
  }

  useRegisterFab(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setEditingEventId(null);
    setEventTitle(""); setEventEmoji("📅");
    setEventDate(today);
    setEventEndDate("");
    setShowAddEvent(true);
  });

  function handleSaveEvent() {
    if (!eventTitle.trim() || !eventDate) return;
    const title = eventTitle.trim();
    const startAt = eventDate + "T12:00:00";
    const endAt = eventEndDate ? eventEndDate + "T12:00:00" : null;
    if (editingEventId) {
      const id = editingEventId;
      setEvents((prev) => prev
        .map((e) => e.id === id ? { ...e, title, start_at: startAt, end_at: endAt, emoji: eventEmoji } : e)
        .sort((a, b) => a.start_at.localeCompare(b.start_at)));
      startTransition(() => { updateEvent({ id, coupleId, userId: me.id, title, startAt, endAt, emoji: eventEmoji }); });
    } else {
      const optimistic: CalEvent = { id: crypto.randomUUID(), title, start_at: startAt, end_at: endAt, emoji: eventEmoji, created_by: me.id };
      setEvents((prev) => [...prev, optimistic].sort((a, b) => a.start_at.localeCompare(b.start_at)));
      markActivity("calendar");
      startTransition(() => { addEvent({ coupleId, userId: me.id, title, startAt, endAt, emoji: eventEmoji }); });
    }
    setEventTitle(""); setEventEndDate(""); setEventEmoji("📅");
    setEditingEventId(null); setShowAddEvent(false);
  }

  function openEditEvent(evt: CalEvent) {
    setActionEvent(null);
    setEditingEventId(evt.id);
    setEventTitle(evt.title);
    setEventEmoji(evt.emoji);
    setEventDate(evt.start_at.slice(0, 10));
    setEventEndDate(evt.end_at ? evt.end_at.slice(0, 10) : "");
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
    return getStatus(me.id, d) === "free" && partner && getStatus(partner.id, d) === "free";
  }).filter(Boolean).length;

  return (
    <div className="max-w-lg mx-auto pb-8">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-5 pt-10 pb-2">
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
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-y-2 px-2">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const mine = getStatus(me.id, ds);
            const theirs = partner ? getStatus(partner.id, ds) : null;
            const overlap = mine === "free" && theirs === "free";
            const isPast = ds < todayStr;
            const isToday = ds === todayStr;
            const dayEvents = getEvents(ds);
            const dayCds = getCountdownsForDate(ds);
            const isEventDay = dayEvents.length > 0 || dayCds.length > 0;

            const colIndex = i % 7;
            const isWeekStart = colIndex === 0;
            const isWeekEnd = colIndex === 6;
            const isRangeStart = isEventDay && (
              dayEvents.some(e => e.start_at.slice(0, 10) === ds) ||
              dayCds.some(c => c.target_date === ds)
            );
            const isRangeEnd = isEventDay && (
              dayEvents.some(e => (e.end_at ? e.end_at.slice(0, 10) : e.start_at.slice(0, 10)) === ds) ||
              dayCds.some(c => (c.end_date ?? c.target_date) === ds)
            );
            const roundLeft = !isEventDay || isRangeStart || isWeekStart;
            const roundRight = !isEventDay || isRangeEnd || isWeekEnd;
            const eventRounding =
              roundLeft && roundRight ? "rounded-lg" :
              roundLeft ? "rounded-l-lg rounded-r-none" :
              roundRight ? "rounded-l-none rounded-r-lg" :
              "rounded-none";

            // Count how many distinct items start on this exact day (for collision badge)
            const startsHere = [
              ...dayEvents.filter(e => e.start_at.slice(0, 10) === ds),
              ...dayCds.filter(c => c.target_date === ds),
            ];
            const collisionCount = startsHere.length;
            const showBandEmoji = isEventDay && isRangeStart;
            const bandEmoji = dayEvents[0]?.emoji ?? dayCds[0]?.emoji;

            const availLabel = isEventDay
              ? `, ${collisionCount > 1 ? `${collisionCount} events` : "event"}`
              : `${mine === "free" ? ", you free" : ""}${theirs === "free" ? ", partner free" : ""}`;

            return (
              <button
                key={i}
                onClick={() => !isPast && !isEventDay && handleDay(ds)}
                disabled={isPast}
                aria-label={`${day} ${monthLabel}${availLabel}`}
                aria-pressed={!isEventDay && mine === "free"}
                className={cn(
                  "aspect-square w-full flex flex-col items-center justify-center relative transition-all select-none",
                  isEventDay
                    ? cn(eventRounding, "cursor-default")
                    : cn("rounded-lg", overlap && "bg-sage-light"),
                  isPast && "opacity-30 cursor-default",
                )}
                style={isEventDay ? { backgroundColor: "#E4DFD4" } : undefined}
              >
                {/* Collision badge — shows when 2+ items start on this day */}
                {collisionCount > 1 && (
                  <div className="absolute top-0.5 right-0.5 w-[14px] h-[14px] rounded-full bg-foreground/70 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-background leading-none">{collisionCount}</span>
                  </div>
                )}

                {/* Day number — today gets a filled circle */}
                {isToday ? (
                  <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center mb-1">
                    <span className="text-[11px] font-bold text-background leading-none">{day}</span>
                  </div>
                ) : (
                  <span className={cn(
                    "text-xs font-semibold leading-none",
                    overlap && !isEventDay ? "text-sage font-bold" : "text-foreground/75",
                    isEventDay ? "text-foreground/55 mb-0" : "mb-1.5",
                  )}>
                    {day}
                  </span>
                )}

                {/* Status dots — not shown on event days. free = accent dot · unset = faint dot */}
                {!isEventDay && (
                  <div className="flex gap-0.5 items-center h-1.5">
                    <div
                      className={cn("w-1.5 h-1.5 rounded-full", mine === null ? "bg-foreground/[0.08]" : "")}
                      style={mine === "free" ? { backgroundColor: myAccent.hex } : undefined}
                    />
                    {partner && (
                      <div
                        className={cn("w-1.5 h-1.5 rounded-full", theirs === null ? "bg-foreground/[0.08]" : "")}
                        style={theirs === "free" ? { backgroundColor: partnerAccent.hex, opacity: 0.65 } : undefined}
                      />
                    )}
                  </div>
                )}

                {/* Event band: emoji label on first cell of each row segment */}
                {showBandEmoji && bandEmoji && (
                  <span className="text-xs leading-none mt-0.5">{bandEmoji}</span>
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
            <div className="w-3 h-3 rounded bg-sage-light" />
            <span className="text-xs text-muted-foreground/60">both free</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: "#E4DFD4" }} />
          <span className="text-xs text-muted-foreground/60">event</span>
        </div>
      </div>
      <p className="px-5 mt-1.5 text-[11px] text-muted-foreground/45">tap a day to mark yourself free</p>

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
                    const isMe = evt.created_by === me.id;
                    const o = resolveOwner(evt.created_by);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => isMe && setActionEvent(evt)}
                        className={cn("card-row overflow-hidden px-4 py-3 flex items-center gap-3", isMe && "cursor-pointer active:scale-[0.99] transition-transform")}
                        style={{ background: cardOmbre(o) }}
                      >
                        <span className="text-xl flex-shrink-0">{evt.emoji}</span>
                        <OwnerAvatars people={o.people} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{evt.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                            {evt.end_at && ` – ${new Date(evt.end_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    const cd = item.data;
                    const days = daysUntil(cd.target_date);
                    const d = new Date(cd.target_date + "T12:00:00");
                    const o = resolveOwner(null); // countdowns are shared
                    const mine = cd.created_by === me.id;
                    return (
                      <div
                        key={cd.id}
                        onClick={() => mine && setActionCountdown(cd)}
                        className={cn("card-row overflow-hidden px-4 py-3 flex items-center gap-3", mine && "cursor-pointer active:scale-[0.99] transition-transform")}
                        style={{ background: cardOmbre(o) }}
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
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">{days}</p>
                          <p className="text-[10px] text-muted-foreground">days</p>
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

      {/* Add / edit event sheet */}
      <BottomSheet
        open={showAddEvent}
        onClose={() => { setShowAddEvent(false); setEditingEventId(null); }}
        title={editingEventId ? "edit event" : "new event"}
        footer={
          <Button onClick={handleSaveEvent} disabled={!eventTitle.trim() || !eventDate} className="w-full h-12 rounded-2xl text-[15px]">
            {editingEventId ? "save" : "add event"}
          </Button>
        }
      >
        <Input
          value={eventTitle}
          onChange={(e) => setEventTitle(e.target.value)}
          placeholder="what's happening?"
          className="h-12 rounded-2xl bg-secondary border-0 text-[15px]"
          autoFocus
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
