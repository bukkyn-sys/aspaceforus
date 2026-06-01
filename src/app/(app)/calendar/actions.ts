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
  endAt?: string | null;
  emoji?: string;
}) {
  const supabase = await createClient();
  await supabase.from("events").insert({
    couple_id: data.coupleId,
    created_by: data.userId,
    title: data.title,
    start_at: data.startAt,
    end_at: data.endAt ?? null,
    emoji: data.emoji ?? "📅",
  });
}

// Update / delete restricted to the creator (created_by filter enforces it).
export async function updateEvent(data: {
  id: string;
  coupleId: string;
  userId: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  emoji?: string;
}) {
  const supabase = await createClient();
  await supabase
    .from("events")
    .update({
      title: data.title,
      start_at: data.startAt,
      end_at: data.endAt ?? null,
      emoji: data.emoji ?? "📅",
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId)
    .eq("created_by", data.userId);
}

export async function deleteEvent(id: string, coupleId: string, userId: string) {
  const supabase = await createClient();
  await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("created_by", userId);
}
