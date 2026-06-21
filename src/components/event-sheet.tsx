"use client";

import { useState, useEffect } from "react";
import { useCouple } from "@/contexts/couple-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { Field, ChipRow } from "@/components/ui/form";
import { SignedImg } from "@/components/signed-img";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";
import { PARTS, PART_META, fmtTimeLabel, type DayPart } from "@/lib/day-parts";

export interface EventDraft {
  title: string;
  emoji: string;
  onDate: string;
  parts: DayPart[];
  untilDate: string | null;
  startTime: string | null;
  attendee: string | null; // a profile id, or null = both of you
}

// Likely couple events first, one general (📅) to fall back on.
const EVENT_EMOJIS = ["🍽️", "🍸", "🎬", "✈️", "🎂", "❤️", "🎉", "📅"];

// One event form, shared by the calendar and Home so they're identical.
export function EventSheet({
  open,
  onClose,
  onSubmit,
  initial,
  editing,
  planContext,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: EventDraft) => void;
  initial?: Partial<EventDraft> | null; // prefill (edit or default date)
  editing?: boolean;
  planContext?: { date: string; freeParts: DayPart[] } | null;
}) {
  const { me, partner, myName, partnerName } = useCouple();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📅");
  const [onDate, setOnDate] = useState("");
  const [parts, setParts] = useState<DayPart[]>([]);
  const [untilDate, setUntilDate] = useState("");
  const [time, setTime] = useState("");
  const [attendee, setAttendee] = useState<string | null>(null);

  // Prefill / reset every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setEmoji(initial?.emoji ?? "📅");
    setOnDate(initial?.onDate ?? "");
    setParts(initial?.parts ?? (planContext ? planContext.freeParts : []));
    setUntilDate(initial?.untilDate ?? "");
    setTime(initial?.startTime ?? "");
    setAttendee(initial?.attendee ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const multiDay = !!untilDate && untilDate > onDate;
  const canSave = !!title.trim() && !!onDate && (parts.length > 0 || multiDay);

  function submit() {
    if (!canSave) return;
    onSubmit({
      title: title.trim(),
      emoji,
      onDate,
      parts: multiDay ? [...PARTS] : parts,
      untilDate: multiDay ? untilDate : null,
      startTime: time || null,
      attendee,
    });
  }

  const attendeeOpts = [
    { id: null as string | null, name: "both", url: null as string | null, hex: "" },
    { id: me.id, name: myName, url: me.avatar_url, hex: getAccent(me.accent_color).hex },
    ...(partner ? [{ id: partner.id, name: partnerName, url: partner.avatar_url, hex: getAccent(partner.accent_color).hex }] : []),
  ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "edit event" : planContext ? "plan your free time" : "new event"}
      footer={
        <Button onClick={submit} disabled={!canSave} className="w-full h-12 rounded-2xl text-[15px]">
          {editing ? "save" : planContext ? "book it" : "add event"}
        </Button>
      }
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="what's happening?"
        className="h-12 rounded-2xl bg-secondary border-0 text-[15px]"
      />

      <Field label="emoji">
        <ChipRow>
          {EVENT_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={cn(
                "h-11 rounded-2xl text-xl flex items-center justify-center transition-all",
                emoji === e ? "bg-foreground" : "bg-secondary"
              )}
            >
              {e}
            </button>
          ))}
        </ChipRow>
      </Field>

      {/* Who's going — only meaningful once there's a partner */}
      {partner && (
        <Field label="who's going">
          <ChipRow>
            {attendeeOpts.map((a) => {
              const on = attendee === a.id;
              return (
                <button
                  key={a.id ?? "both"}
                  type="button"
                  onClick={() => setAttendee(a.id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-2 h-10 rounded-xl text-xs font-medium transition-colors",
                    on ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
                  )}
                >
                  {a.id !== null && (
                    <span className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0" style={{ boxShadow: `0 0 0 1.5px ${a.hex}` }}>
                      {a.url
                        ? <SignedImg src={a.url} className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center text-[10px] font-semibold bg-secondary text-muted-foreground">{a.name[0]?.toUpperCase()}</span>}
                    </span>
                  )}
                  <span className="truncate">{a.name}</span>
                </button>
              );
            })}
          </ChipRow>
        </Field>
      )}

      {/* Day-parts — the only time unit. In plan mode, limited to the free parts. */}
      <Field label={planContext ? "block out" : "when"}>
        <ChipRow>
          {(planContext ? planContext.freeParts : PARTS).map((p) => {
            const single = !!planContext && planContext.freeParts.length === 1;
            const on = parts.includes(p);
            return (
              <button
                key={p}
                type="button"
                disabled={single}
                onClick={() => setParts((prev) => on ? prev.filter((x) => x !== p) : [...prev, p])}
                className={cn("h-10 rounded-xl text-xs font-medium capitalize transition-colors", on ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}
              >
                {PART_META[p].label}
              </button>
            );
          })}
        </ChipRow>
        {!planContext && (
          <button
            type="button"
            onClick={() => setParts((prev) => prev.length >= 4 ? [] : [...PARTS])}
            className={cn("w-full h-10 mt-2 rounded-xl text-xs font-medium transition-colors", parts.length >= 4 ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}
          >
            all day
          </button>
        )}
        {planContext && (
          <p className="text-[11px] text-sage mt-2">
            {planContext.freeParts.length === 1
              ? `your free ${PART_META[planContext.freeParts[0]].label} will be booked`
              : "tap the parts you're booking — they'll no longer show as free"}
          </p>
        )}
      </Field>

      {/* Date — single day, or a span via "until" (hidden when planning) */}
      {!planContext && (
        <Field label="date">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative rounded-2xl overflow-hidden">
              <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">on</p>
                <p className={cn("text-sm font-medium", onDate ? "text-foreground" : "text-muted-foreground/40")}>
                  {onDate ? new Date(onDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                </p>
              </div>
              <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            </div>
            <div className="relative rounded-2xl overflow-hidden">
              <div className="bg-secondary px-3.5 pt-2.5 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground tracking-wide mb-1">until <span className="normal-case font-normal opacity-50">(optional)</span></p>
                <p className={cn("text-sm font-medium", untilDate ? "text-foreground" : "text-muted-foreground/40")}>
                  {untilDate ? new Date(untilDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "select"}
                </p>
              </div>
              <input type="date" value={untilDate} min={onDate} onChange={(e) => setUntilDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            </div>
          </div>
          {untilDate && (
            <button type="button" onClick={() => setUntilDate("")} className="flex items-center justify-center gap-1 w-full text-xs font-medium text-muted-foreground/70 hover:text-foreground mt-1.5 transition-colors">
              <X className="w-3 h-3" /> remove end date
            </button>
          )}
          {multiDay && (
            <p className="text-[11px] text-muted-foreground/50 mt-1.5">a multi-day event books every part of each day</p>
          )}
        </Field>
      )}

      {/* Optional exact time — a label only; the day-part is what books the slot */}
      <Field label={<>time <span className="normal-case font-normal opacity-50">(optional)</span></>}>
        <div className="relative rounded-2xl overflow-hidden">
          <div className="bg-secondary px-3.5 pt-2.5 pb-3">
            <p className={cn("text-sm font-medium", time ? "text-foreground" : "text-muted-foreground/40")}>{time ? fmtTimeLabel(time) : "select"}</p>
          </div>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
        </div>
      </Field>
    </BottomSheet>
  );
}
