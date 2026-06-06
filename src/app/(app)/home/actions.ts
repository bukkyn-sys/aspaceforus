"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

async function getUid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

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

// Countdowns and events are one concept now: an "event". The home quick-add
// creates an all-day event (date + optional end date). Anchored at local noon so
// it lands on the right calendar day in every timezone, matching the calendar.
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
    start_at: data.targetDate + "T12:00:00",
    end_at: data.endDate ? data.endDate + "T12:00:00" : null,
    emoji: data.emoji,
    all_day: true,
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
      start_at: data.targetDate + "T12:00:00",
      end_at: data.endDate ? data.endDate + "T12:00:00" : null,
      emoji: data.emoji,
      all_day: true,
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
