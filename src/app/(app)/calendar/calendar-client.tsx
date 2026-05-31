"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { setAvailability, addEvent, deleteEvent } from "./actions";
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from "lucide-react";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [showLegend, setShowLegend] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEmoji, setEventEmoji] = useState("📅");
  const [eventCustomEmoji, setEventCustomEmoji] = useState("");
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
  }, [coupleId, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setEventTitle(""); setEventEndDate(""); setEventEmoji("📅"); setEventCustomEmoji(""); setShowAddEvent(false);
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
    <div className="px-4 pt-10 pb-6 max-w-lg mx-auto">
      <h1 className="font-heading text-3xl text-foreground tracking-tight mb-1">calendar.</h1>
      {overlaps > 0 ? (
        <p className="text-sm text-sage font-medium mb-6">
          {overlaps} day{overlaps !== 1 ? "s" : ""} overlap this month
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mb-6">mark your free days below</p>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrent(new Date(year, month - 1, 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-foreground capitalize">{monthLabel}</p>
        <button
          onClick={() => setCurrent(new Date(year, month + 1, 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-y-1.5">
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

            // Banding: determine which edges to round for event days
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
              roundLeft && roundRight ? "rounded-xl" :
              roundLeft ? "rounded-l-xl rounded-r-none" :
              roundRight ? "rounded-l-none rounded-r-xl" :
              "rounded-none";

            return (
              <button
                key={i}
                onClick={() => !isPast && handleDay(ds)}
                disabled={isPast}
                className={cn(
                  "flex flex-col items-center justify-center py-2 transition-all",
                  isEventDay
                    ? eventRounding
                    : cn(
                        "rounded-xl mx-0.5",
                        overlap && "bg-sage-light ring-1 ring-sage/20",
                      ),
                  isToday && "ring-1 ring-inset ring-foreground/40",
                  isPast && "opacity-25 cursor-default",
                )}
                style={
                  isEventDay ? { backgroundColor: "#FEF3C7" }
                  : !overlap && mine === "free" ? { backgroundColor: myAccent.light }
                  : undefined
                }
              >
                <span className={cn(
                  "text-xs font-semibold leading-none mb-1.5",
                  overlap && !isEventDay ? "text-sage" : "text-foreground",
                )}>
                  {day}
                </span>
                <div className="flex gap-0.5 items-center">
                  {mine === "busy" ? (
                    <div className="w-2.5 h-0.5 rounded-full bg-terracotta" />
                  ) : (
                    <div
                      className={cn("w-1.5 h-1.5 rounded-full", mine === null ? "bg-border/60" : "")}
                      style={mine === "free" ? { backgroundColor: myAccent.hex } : undefined}
                    />
                  )}
                  {partner && (
                    theirs === "busy" ? (
                      <div className="w-2.5 h-0.5 rounded-full bg-terracotta/60" />
                    ) : (
                      <div
                        className={cn("w-1.5 h-1.5 rounded-full", theirs === null ? "bg-border/40" : "")}
                        style={theirs === "free" ? { backgroundColor: partnerAccent.hex, opacity: 0.65 } : undefined}
                      />
                    )
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Legend — collapsed by default */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50">tap a day · free → busy → clear</p>
          <button
            onClick={() => setShowLegend(s => !s)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <span className="w-4 h-4 rounded-full border border-muted-foreground/25 inline-flex items-center justify-center text-[9px] font-bold">i</span>
            key
          </button>
        </div>
        {showLegend && (
          <div className="mt-2 bg-secondary/50 rounded-2xl px-4 py-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5 items-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: myAccent.hex }} />
                {partner
                  ? <div className="w-2 h-2 rounded-full" style={{ backgroundColor: partnerAccent.hex, opacity: 0.65 }} />
                  : <div className="w-2 h-2 rounded-full bg-border/40" />
                }
              </div>
              <span className="text-[11px] text-muted-foreground">
                left dot = you · right dot = {partner ? partnerName : "partner"}
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: myAccent.hex }} />
                <span className="text-[11px] text-muted-foreground">free</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded-full bg-terracotta" />
                <span className="text-[11px] text-muted-foreground">busy</span>
              </div>
              {partner && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-sage-light border border-sage/30" />
                  <span className="text-[11px] text-muted-foreground">both free</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-md bg-amber-100" />
                <span className="text-[11px] text-muted-foreground">event / countdown</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Events + countdowns */}
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
          <div className="text-muted-foreground/30 text-lg mt-1">↓</div>
        </div>
      )}

      {!loading && (events.length > 0 || countdowns.length > 0) && (() => {
        // Merge events + countdowns sorted by date
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
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">events this month</p>
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
                      className="bg-white border border-border/50 rounded-2xl px-4 py-3 shadow-card flex items-center gap-3"
                      style={{ borderLeftColor: creatorAccent.hex, borderLeftWidth: "3px" }}
                    >
                      <span className="text-xl flex-shrink-0">{evt.emoji}</span>
                      {/* Creator avatar */}
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
                        <p className="text-xs mt-0.5" style={{ color: creatorAccent.hex }}>
                          {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                          {evt.end_at && (() => {
                            const endD = new Date(evt.end_at!);
                            return ` – ${endD.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
                          })()}
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
                      className="bg-white border border-border/50 border-l-[3px] rounded-2xl px-4 py-3 shadow-card flex items-center gap-3"
                      style={{ borderLeftColor: "#D4A427" }}
                    >
                      <span className="text-xl flex-shrink-0">{cd.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{cd.title}</p>
                        <p className="text-xs text-amber-600/70 mt-0.5">
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

      {/* Add event sheet */}
      {showAddEvent && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddEvent(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">add event</p>
              <button onClick={() => setShowAddEvent(false)} className="text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="what's happening?"
              className="h-11 rounded-xl bg-white border-border/60"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">start date</p>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="h-11 rounded-xl bg-white border-border/60"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">end date <span className="opacity-50">(optional)</span></p>
                <Input
                  type="date"
                  value={eventEndDate}
                  min={eventDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                  className="h-11 rounded-xl bg-white border-border/60"
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">pick an emoji</p>
              <div className="flex flex-wrap gap-2">
                {EVENT_EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => { setEventEmoji(e); setEventCustomEmoji(""); }}
                    className={cn(
                      "w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all",
                      eventEmoji === e && !eventCustomEmoji ? "bg-foreground" : "bg-secondary hover:bg-secondary/70"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <Input
                value={eventCustomEmoji}
                onChange={(e) => { const v = e.target.value; setEventCustomEmoji(v); if (v.trim()) setEventEmoji(v.trim()); }}
                placeholder="or type your own emoji"
                className="h-9 rounded-xl bg-white border-border/60 text-sm mt-2"
              />
            </div>
            <Button onClick={handleAddEvent} disabled={!eventTitle.trim() || !eventDate} className="w-full h-11 rounded-xl">
              add event
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
