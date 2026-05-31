"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

export async function setMood(userId: string, mood: number, coupleId?: string) {
  const supabase = await createClient();
  await supabase.rpc("update_my_mood", { p_user_id: userId, p_mood: mood });
  if (coupleId) {
    const emojis = ["", "😔", "😕", "😐", "🙂", "😊"];
    await notifyPartner(coupleId, userId, "us.", `your partner updated their mood ${emojis[mood] ?? ""}`, "/home");
  }
}

export async function updateNote(coupleId: string, userId: string, note: string) {
  const supabase = await createClient();
  await supabase.rpc("update_shared_note", { p_couple_id: coupleId, p_user_id: userId, p_note: note });
}

export async function setStartedAt(coupleId: string, userId: string, date: string) {
  const supabase = await createClient();
  await supabase.rpc("update_couple_started_at", { p_couple_id: coupleId, p_user_id: userId, p_date: date });
}

export async function addCountdown(data: {
  coupleId: string;
  userId: string;
  title: string;
  targetDate: string;
  endDate?: string | null;
  emoji: string;
}) {
  const supabase = await createClient();
  await supabase.from("countdowns").insert({
    couple_id: data.coupleId,
    created_by: data.userId,
    title: data.title,
    target_date: data.targetDate,
    end_date: data.endDate ?? null,
    emoji: data.emoji,
  });
}

export async function deleteCountdown(id: string, coupleId: string) {
  const supabase = await createClient();
  await supabase.rpc("delete_countdown", { p_id: id, p_couple_id: coupleId });
}
