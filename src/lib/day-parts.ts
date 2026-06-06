import type { DayPart } from "@/app/(app)/calendar/actions";

export type { DayPart };

// The four day-parts — the calendar's only time unit. Order matters (used for
// sorting / rendering segments left→right).
export const PARTS: DayPart[] = ["morning", "afternoon", "evening", "night"];

export const PART_META: Record<DayPart, { label: string; time: string }> = {
  morning:   { label: "morning",   time: "5–12" },
  afternoon: { label: "afternoon", time: "12–17" },
  evening:   { label: "evening",   time: "17–22" },
  night:     { label: "night",     time: "22–5" },
};

const pad2 = (n: number) => String(n).padStart(2, "0");

// "19:00" → "7pm" / "7:30pm". start_time is an optional cosmetic label only.
export function fmtTimeLabel(hhmm: string): string {
  const [hs, ms] = hhmm.split(":");
  let h = parseInt(hs, 10); const m = parseInt(ms ?? "0", 10);
  if (Number.isNaN(h)) return hhmm;
  const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
  return m === 0 ? `${h}${ap}` : `${h}:${pad2(m)}${ap}`;
}

// "all day" when all four parts, else "morning · evening".
export function partsLabel(parts: DayPart[]): string {
  if (parts.length >= 4) return "all day";
  return PARTS.filter((p) => parts.includes(p)).map((p) => PART_META[p].label).join(" · ");
}
