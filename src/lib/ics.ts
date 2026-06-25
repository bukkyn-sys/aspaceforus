// Build + download a single-event .ics on the client (the per-event "add to
// calendar"). Opening the file adds the event on iOS/Android/desktop. The
// always-on subscribe feed lives at /api/calendar/<token>; this is for one-offs.

type IcsEvent = {
  id: string;
  title: string;
  emoji: string | null;
  on_date: string;            // YYYY-MM-DD
  until_date: string | null;  // YYYY-MM-DD or null
};

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function basic(d: string): string {
  return d.replace(/-/g, "");
}
function dayAfter(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + 1));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function downloadEventIcs(e: IcsEvent): void {
  const end = e.until_date && e.until_date >= e.on_date ? e.until_date : e.on_date;
  const summary = `${e.emoji ? e.emoji + " " : ""}${e.title || "event"}`.trim();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//us.//calendar//EN",
    "BEGIN:VEVENT",
    `UID:${e.id}@aspaceforus.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${basic(e.on_date)}`,
    `DTEND;VALUE=DATE:${dayAfter(end)}`,
    `SUMMARY:${esc(summary)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(e.title || "event").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
