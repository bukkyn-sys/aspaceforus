import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-way iCalendar feed for a couple's events. The URL token is the capability
// (calendar apps fetch with no login), so we look the couple up by token using
// the service role. Events are day-parts based, so they're emitted as all-day
// VEVENTs spanning on_date → until_date.

type EventRow = {
  id: string;
  title: string | null;
  emoji: string | null;
  on_date: string | null;       // YYYY-MM-DD
  until_date: string | null;    // YYYY-MM-DD or null
};

// Escape per RFC 5545 TEXT rules.
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// YYYY-MM-DD → YYYYMMDD
function dateBasic(d: string): string {
  return d.replace(/-/g, "");
}

// Exclusive DTEND for an all-day event: the day AFTER the last day.
function dayAfter(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + 1));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// Fold lines to <=75 octets (RFC 5545), continuation lines start with a space.
function fold(line: string): string {
  if (line.length <= 73) return line;
  const out: string[] = [];
  let s = line;
  out.push(s.slice(0, 73));
  s = s.slice(73);
  while (s.length > 72) { out.push(" " + s.slice(0, 72)); s = s.slice(72); }
  if (s.length) out.push(" " + s);
  return out.join("\r\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Reject anything that isn't a UUID before touching the DB.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response("not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: couple } = await admin.from("couples").select("id").eq("calendar_token", token).single();
  if (!couple) return new Response("not found", { status: 404 });

  // Events from the last year onward — keeps the feed bounded but useful.
  const since = new Date(Date.now() - 365 * 86400 * 1000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("events")
    .select("id, title, emoji, on_date, until_date")
    .eq("couple_id", couple.id)
    .gte("on_date", since)
    .order("on_date");
  const events = ((data ?? []) as EventRow[]).filter((e) => e.on_date);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//us.//calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:us.",
    "X-PUBLISHED-TTL:PT12H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
  ];

  const now = stamp();
  for (const e of events) {
    const start = e.on_date!;
    const end = e.until_date && e.until_date >= start ? e.until_date : start;
    const summary = `${e.emoji ? e.emoji + " " : ""}${e.title ?? "event"}`.trim();
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${e.id}@aspaceforus.app`),
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dateBasic(start)}`,
      `DTEND;VALUE=DATE:${dayAfter(end)}`,
      fold(`SUMMARY:${esc(summary)}`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="us.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
