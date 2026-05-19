"use server";

import { createClient } from "@/lib/supabase/server";

export async function setAvailability(
  coupleId: string,
  userId: string,
  date: string,
  status: "free" | "busy" | null
) {
  const supabase = await createClient();
  await supabase.rpc("set_availability", {
    p_couple_id: coupleId,
    p_user_id: userId,
    p_date: date,
    p_status: status,
  });
}

export async function addEvent(data: {
  coupleId: string;
  userId: string;
  title: string;
  startAt: string;
  emoji?: string;
}) {
  const supabase = await createClient();
  await supabase.rpc("add_event", {
    p_couple_id: data.coupleId,
    p_user_id: data.userId,
    p_title: data.title,
    p_start_at: data.startAt,
    p_emoji: data.emoji || "📅",
  });
}

export async function deleteEvent(id: string, coupleId: string) {
  const supabase = await createClient();
  await supabase.rpc("delete_event", { p_id: id, p_couple_id: coupleId });
}
