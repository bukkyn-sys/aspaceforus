"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { setAvailability, addEvent, deleteEvent } from "./actions";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetClose } from "@/components/ui/sheet-close";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

type Status = "free" | "busy" | null;
interface Row { user_id: string; date: string; status: Status; }
interface CalEvent { id: string; title: string; start_at: string; end_at: string | null; emoji: string; created_by: string; }
interface Countdown { id: string; title: string; target_date: string; end_date?: string | null; emoji: string; }

const EVENT_EMOJIS = ["📅", "🍽️", "🎬", "🏃", "🎂", "🎵", "💍", "✈️", "🏠", "🎉"];

type CalCache = { rows: Row[]; events: CalEvent[]; countdowns: Countdown[] };

export default function CalendarClient() {
  const { coupleId, me, partner, partnerName } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const [current, setCurrent] = useState(() => new Date());
  const [rows, setRows] = useState<Row[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEmoji, setEventEmoji] = useState("📅");
  const [, startTransition] = useTransition();

  const year = current.getFullYear();
  const month = current.getMonth();

  useEffect(() => { markSeen("calendar"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useScrollLock(showAddEvent);

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
        .select("id, title, target_date, end_date, emoji")
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
    const next: Status = cur === null ? "free" : cur === "free" ? "busy" : null;
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
    setEventDate(today);
    setEventEndDate("");
    setShowAddEvent(true);
  });

  function handleAddEvent() {
    if (!eventTitle.trim() || !eventDate) return;
    const startAt = eventDate + "T12:00:00";
    const endAt = eventEndDate ? eventEndDate + "T12:00:00" : null;
    const optimistic: CalEvent = {
      id: crypto.randomUUID(),
      title: eventTitle.trim(),
      start_at: startAt,
      end_at: endAt,
      emoji: eventEmoji,
      created_by: me.id,
    };
    setEvents((prev) => [...prev, optimistic].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setEventTitle(""); setEventEndDate(""); setEventEmoji("📅"); setShowAddEvent(false);
    markActivity("calendar");
    startTransition(() => {
      addEvent({ coupleId, userId: me.id, title: optimistic.title, startAt, endAt, emoji: eventEmoji });
    });
  }

  function handleDeleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    startTransition(() => { deleteEvent(id, coupleId); });
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
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="flex-1 text-center text-sm font-semibold text-foreground">{monthLabel}</p>
        <button
          onClick={() => setCurrent(new Date(year, month + 1, 1))}
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

            // Show emoji only on the true start of each event/countdown range
            const showBandEmoji = isEventDay && isRangeStart;
            const bandEmoji = dayEvents[0]?.emoji ?? dayCds[0]?.emoji;

            return (
              <button
                key={i}
                onClick={() => !isPast && !isEventDay && handleDay(ds)}
                disabled={isPast}
                className={cn(
                  "aspect-square w-full flex flex-col items-center justify-center relative transition-all select-none",
                  isEventDay
                    ? cn(eventRounding, "cursor-default")
                    : cn("rounded-lg", overlap && "bg-sage-light"),
                  isPast && "opacity-30 cursor-default",
                )}
                style={
                  isEventDay ? { backgroundColor: "#FEF3C7" }
                  : undefined
                }
              >
                {/* Day number — today gets a filled circle */}
                {isToday ? (
                  <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center mb-1">
                    <span className="text-[11px] font-bold text-background leading-none">{day}</span>
                  </div>
                ) : (
                  <span className={cn(
                    "text-xs font-semibold leading-none",
                    overlap && !isEventDay ? "text-sage font-bold" : "text-foreground/75",
                    isEventDay ? "text-amber-800/60 mb-0" : "mb-1.5",
                  )}>
                    {day}
                  </span>
                )}

                {/* Status dots — not shown on event days.
                    free = accent dot · busy = muted dash · unset = faint dot */}
                {!isEventDay && (
                  <div className="flex gap-0.5 items-center h-1.5">
                    {mine === "busy" ? (
                      <div className="w-2 h-[3px] rounded-full bg-foreground/25" />
                    ) : (
                      <div
                        className={cn("w-1.5 h-1.5 rounded-full", mine === null ? "bg-foreground/[0.08]" : "")}
                        style={mine === "free" ? { backgroundColor: myAccent.hex } : undefined}
                      />
                    )}
                    {partner && (
                      theirs === "busy" ? (
                        <div className="w-2 h-[3px] rounded-full bg-foreground/15" />
                      ) : (
                        <div
                          className={cn("w-1.5 h-1.5 rounded-full", theirs === null ? "bg-foreground/[0.08]" : "")}
                          style={theirs === "free" ? { backgroundColor: partnerAccent.hex, opacity: 0.65 } : undefined}
                        />
                      )
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
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-[3px] rounded-full bg-foreground/25" />
          <span className="text-xs text-muted-foreground/60">busy</span>
        </div>
        {partner && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-sage-light" />
            <span className="text-xs text-muted-foreground/60">both free</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-100" />
          <span className="text-xs text-muted-foreground/60">event</span>
        </div>
      </div>
      <p className="px-5 mt-1.5 text-[11px] text-muted-foreground/45">tap a day to cycle: free → busy → clear</p>

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
                    const creatorAccent = isMe ? myAccent : partnerAccent;
                    const creatorAvatar = isMe ? me.avatar_url : partner?.avatar_url;
                    const creatorInitial = isMe
                      ? (me.display_name?.[0] ?? "?").toUpperCase()
                      : (partner?.display_name?.[0] ?? "?").toUpperCase();
                    return (
                      <div
                        key={evt.id}
                        className="card-row accent-bar px-4 py-3 flex items-center gap-3"
                        style={{ "--accent-bar": creatorAccent.hex } as React.CSSProperties}
                      >
                        <span className="text-xl flex-shrink-0">{evt.emoji}</span>
                        <div
                          className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-secondary"
                          style={{ boxShadow: `0 0 0 1.5px ${creatorAccent.hex}` }}
                        >
                          {creatorAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={creatorAvatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] font-semibold text-muted-foreground">
                              {creatorInitial}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{evt.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                            {evt.end_at && ` – ${new Date(evt.end_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                          </p>
                        </div>
                        {isMe && (
                          <button
                            onClick={() => handleDeleteEvent(evt.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-terracotta hover:bg-terracotta-light transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  } else {
                    const cd = item.data;
                    const days = daysUntil(cd.target_date);
                    const d = new Date(cd.target_date + "T12:00:00");
                    return (
                      <div
                        key={cd.id}
                        className="card-row accent-bar px-4 py-3 flex items-center gap-3"
                        style={{ "--accent-bar": "#D4A427" } as React.CSSProperties}
                      >
                        <span className="text-xl flex-shrink-0">{cd.emoji}</span>
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

      {/* Add event sheet */}
      {showAddEvent && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddEvent(false)} />
          <div className="relative bg-background rounded-t-[28px] flex flex-col" style={{ maxHeight: "90dvh" }}>
            {/* Drag handle */}
            <div className="flex justify-center pt-3 flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-border/60" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
              <p className="text-base font-semibold">new event</p>
              <SheetClose onClick={() => setShowAddEvent(false)} />
            </div>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4 space-y-5">
              {/* Title */}
              <Input
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="what's happening?"
                className="h-12 rounded-2xl bg-secondary border-0 text-[15px]"
                autoFocus
              />
              {/* Emoji */}
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
              {/* Dates */}
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
            </div>
            {/* Pinned submit */}
            <div className="px-6 pt-3 flex-shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
              <Button onClick={handleAddEvent} disabled={!eventTitle.trim() || !eventDate} className="w-full h-12 rounded-2xl text-[15px]">
                add event
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
