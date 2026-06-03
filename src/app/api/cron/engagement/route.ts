import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Friendly, varied re-engagement nudges. Kept deliberately diverse — repetition
// reads as cheap — and each one deep-links to the relevant part of the app.
const PROMPTS: { body: string; url: string }[] = [
  { body: "how are you feeling today? a quick check-in 💭", url: "/home" },
  { body: "any free days coming up? mark them and find time together 📅", url: "/calendar" },
  { body: "thought of a date idea? pop it in the vault 🌹", url: "/vault" },
  { body: "leave a little note for your partner to find 📝", url: "/home" },
  { body: "logged any shared expenses lately? keep it square 💸", url: "/ledger" },
  { body: "how are your savings pots looking? 🎯", url: "/ledger" },
  { body: "anything to look forward to? add a countdown ✈️", url: "/home" },
  { body: "it's been a moment — say hi to your space 👋", url: "/home" },
  { body: "mark your free days so plans come together 🗓️", url: "/calendar" },
  { body: "add a photo to make your space feel like yours 📷", url: "/profile" },
  { body: "wishlist something you've had your eye on 🎁", url: "/vault" },
  { body: "plan a little something for your next free day ❤️", url: "/calendar" },
  { body: "settle up so it's all square between you 🧾", url: "/ledger" },
  { body: "drop a sweet note in your shared space 💌", url: "/home" },
  { body: "any trips on the horizon? start a countdown 🌴", url: "/home" },
  { body: "saving towards something together? start a pot 🫙", url: "/ledger" },
  { body: "a date idea a week keeps things fresh 🌹", url: "/vault" },
  { body: "checking in — hope you two are having a good one ☺️", url: "/home" },
];

function pick() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// Recency from profiles.activity_at (jsonb {section: now()::text}). Returns the
// most recent action time in ms, or null if the user has never acted.
function lastActiveFrom(activity: Record<string, string> | null): number | null {
  if (!activity) return null;
  let max = 0;
  for (const v of Object.values(activity)) {
    // Postgres now()::text → "2026-06-03 14:23:45.123456+00"
    const norm = v.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
    const t = Date.parse(norm);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max > 0 ? max : null;
}

// Max engagement nudges allowed today, by how recently the user was active.
// `null` recency (never active) falls into the inactive (7d+) tier.
function dailyCap(ageMs: number): number {
  if (ageMs < 2 * HOUR) return 0;     // active in last 2h → skip
  if (ageMs < 24 * HOUR) return 1;    // active in last 24h → max 1/day
  if (ageMs < 7 * DAY) return 2;      // active in last 7 days → max 2/day
  return 1;                            // inactive 7+ days → max 1/day
}

type SubRow = {
  id: string; user_id: string; endpoint: string; p256dh: string; auth: string;
  nudge_date: string | null; nudge_count: number;
};
type ProfRow = { id: string; activity_at: Record<string, string> | null };

async function run(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Set lazily (env isn't available at build-time module load).
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Base throttle (unchanged): only consider devices not sent ANYTHING in the
  // last 3h. The adaptive caps below are layered on top of this minimum.
  const cutoff = new Date(Date.now() - 3 * HOUR).toISOString();
  const { data: subsRaw, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, nudge_date, nudge_count")
    .or(`last_notified_at.is.null,last_notified_at.lt.${cutoff}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const subs = (subsRaw ?? []) as SubRow[];
  if (!subs.length) return NextResponse.json({ sent: 0, skipped: 0, candidates: 0 });

  // Recency per user, from profiles.activity_at.
  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const { data: profsRaw } = await supabase.from("profiles").select("id, activity_at").in("id", userIds);
  const lastActiveByUser = new Map<string, number>();
  for (const p of (profsRaw ?? []) as ProfRow[]) {
    const la = lastActiveFrom(p.activity_at);
    if (la) lastActiveByUser.set(p.id, la);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const now = Date.now();
  let sent = 0;
  let skipped = 0;

  for (const s of subs) {
    const lastActive = lastActiveByUser.get(s.user_id) ?? null;
    const ageMs = lastActive === null ? Infinity : now - lastActive;
    const cap = dailyCap(ageMs);
    const sentToday = s.nudge_date === todayStr ? s.nudge_count : 0;

    if (cap === 0 || sentToday >= cap) { skipped++; continue; }

    const prompt = pick();
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: "us.", body: prompt.body, url: prompt.url }),
      );
      await supabase.from("push_subscriptions").update({
        last_notified_at: nowIso,
        nudge_date: todayStr,
        nudge_count: sentToday + 1,
      }).eq("id", s.id);
      sent++;
    } catch (e) {
      // Clean up subscriptions the browser has revoked.
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }

  return NextResponse.json({ sent, skipped, candidates: subs.length });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
