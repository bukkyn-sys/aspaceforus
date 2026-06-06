import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily reminder push for to-dos that are due (or overdue) and flagged `remind`.
// Reminded at most once/day per item via last_reminded. Recipients: the item's
// assignee (if a specific person) else both partners.
type TodoRow = {
  id: string; couple_id: string; title: string; due_date: string; assignee: string | null;
};
type ProfRow = { id: string; couple_id: string };
type SubRow = { user_id: string; endpoint: string; p256dh: string; auth: string };

async function run(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  const today = new Date().toISOString().slice(0, 10);

  // Due/overdue, flagged, not done, not already reminded today.
  const { data: todosRaw, error } = await supabase
    .from("vault_todos")
    .select("id, couple_id, title, due_date, assignee")
    .eq("remind", true)
    .eq("done", false)
    .lte("due_date", today)
    .or(`last_reminded.is.null,last_reminded.lt.${today}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const todos = (todosRaw as TodoRow[]) ?? [];
  if (todos.length === 0) return NextResponse.json({ ok: true, reminded: 0 });

  // Couple members (for 'both'/unassigned items).
  const coupleIds = [...new Set(todos.map((t) => t.couple_id))];
  const { data: profsRaw } = await supabase.from("profiles").select("id, couple_id").in("couple_id", coupleIds);
  const membersByCouple = new Map<string, string[]>();
  for (const p of (profsRaw as ProfRow[]) ?? []) {
    const arr = membersByCouple.get(p.couple_id) ?? [];
    arr.push(p.id); membersByCouple.set(p.couple_id, arr);
  }

  // Subscriptions for everyone we might notify.
  const recipientIds = new Set<string>();
  for (const t of todos) {
    if (t.assignee && t.assignee !== "both") recipientIds.add(t.assignee);
    else (membersByCouple.get(t.couple_id) ?? []).forEach((id) => recipientIds.add(id));
  }
  const { data: subsRaw } = await supabase
    .from("push_subscriptions").select("user_id, endpoint, p256dh, auth").in("user_id", [...recipientIds]);
  const subsByUser = new Map<string, SubRow[]>();
  for (const s of (subsRaw as SubRow[]) ?? []) {
    const arr = subsByUser.get(s.user_id) ?? [];
    arr.push(s); subsByUser.set(s.user_id, arr);
  }

  const sentTodoIds: string[] = [];
  for (const t of todos) {
    const targets = t.assignee && t.assignee !== "both"
      ? [t.assignee]
      : (membersByCouple.get(t.couple_id) ?? []);
    const overdue = t.due_date < today;
    const body = `${overdue ? "still to do" : "due today"}: "${t.title}"`;
    let delivered = false;
    for (const uid of targets) {
      for (const s of subsByUser.get(uid) ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: "us.", body, url: "/vault?tab=todos" }),
          );
          delivered = true;
        } catch {
          // expired/revoked subscription — ignore
        }
      }
    }
    if (delivered) sentTodoIds.push(t.id);
  }

  if (sentTodoIds.length > 0) {
    await supabase.from("vault_todos").update({ last_reminded: today }).in("id", sentTodoIds);
  }

  return NextResponse.json({ ok: true, reminded: sentTodoIds.length });
}

export async function POST(req: Request) { return run(req); }
export async function GET(req: Request) { return run(req); }
