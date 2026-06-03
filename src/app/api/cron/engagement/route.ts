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

  // Only nudge devices we haven't sent ANYTHING to in the last 3 hours — this
  // reuses the same last_notified_at the partner-activity throttle uses, so we
  // never pile onto someone who was just notified or who is actively using the app.
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .or(`last_notified_at.is.null,last_notified_at.lt.${cutoff}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const s of subs) {
    const prompt = pick();
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: "us.", body: prompt.body, url: prompt.url }),
      );
      await supabase.from("push_subscriptions").update({ last_notified_at: new Date().toISOString() }).eq("id", s.id);
      sent++;
    } catch (e) {
      // Clean up subscriptions the browser has revoked.
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }

  return NextResponse.json({ sent, candidates: subs.length });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
