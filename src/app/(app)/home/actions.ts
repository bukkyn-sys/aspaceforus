"use server";

import { getUid } from "@/lib/auth-server";
import { notifyPartner } from "@/lib/push";

export async function setMood(userId: string, mood: number, coupleId?: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("update_my_mood", { p_user_id: uid, p_mood: mood });
  if (coupleId) {
    const emojis = ["", "😔", "😕", "😐", "🙂", "😊"];
    await notifyPartner(coupleId, uid, "us.", `your partner updated their mood ${emojis[mood] ?? ""}`, "/home");
  }
}

export async function updateNote(coupleId: string, userId: string, note: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("update_shared_note", { p_couple_id: coupleId, p_user_id: uid, p_note: note });
}

export async function setDashboardLayout(coupleId: string, layout: { id: string; size: "full" | "half" }[]) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("set_dashboard_layout", { p_couple_id: coupleId, p_layout: layout });
}

export async function setStartedAt(coupleId: string, userId: string, date: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("update_couple_started_at", { p_couple_id: coupleId, p_user_id: uid, p_date: date });
}

// Countdowns and events are one concept now: a day-parts "event". The home
// quick-add creates an all-day event (all four parts) on a date + optional
// end date.
const ALL_PARTS = ["morning", "afternoon", "evening", "night"];

export async function addCountdown(data: {
  coupleId: string;
  userId: string;
  title: string;
  targetDate: string;
  endDate?: string | null;
  emoji: string;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("events").insert({
    couple_id: data.coupleId,
    created_by: uid,
    title: data.title,
    on_date: data.targetDate,
    parts: ALL_PARTS,
    until_date: data.endDate || null,
    emoji: data.emoji,
  });
}

export async function updateCountdown(data: {
  id: string;
  coupleId: string;
  userId: string;
  title: string;
  targetDate: string;
  endDate?: string | null;
  emoji: string;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Shared calendar: either partner may edit any event in their couple.
  await supabase
    .from("events")
    .update({
      title: data.title,
      on_date: data.targetDate,
      parts: ALL_PARTS,
      until_date: data.endDate || null,
      emoji: data.emoji,
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId);
}

export async function deleteCountdown(id: string, coupleId: string, userId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Shared calendar: either partner may delete any event in their couple.
  await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId);
}

// ── Shared note — per-author lines ───────────────────────────────────────────
export async function addNoteLine(coupleId: string, body: string, sortOrder: number) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data } = await supabase
    .from("note_items")
    .insert({ couple_id: coupleId, created_by: uid, body, sort_order: sortOrder })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

export async function updateNoteLine(id: string, coupleId: string, body: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Shared note: either partner may edit any line in their couple.
  await supabase.from("note_items").update({ body }).eq("id", id).eq("couple_id", coupleId);
}

export async function deleteNoteLine(id: string, coupleId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("note_items").delete().eq("id", id).eq("couple_id", coupleId);
}
