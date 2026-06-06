"use server";

import { createClient } from "@/lib/supabase/server";

async function getUid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

export type DayPart = "morning" | "afternoon" | "evening" | "night";

// Toggle a single part (morning/afternoon/evening/night) free or not.
export async function setAvailability(
  coupleId: string,
  userId: string,
  date: string,
  part: DayPart,
  free: boolean
) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("set_availability", {
    p_couple_id: coupleId,
    p_user_id: uid,
    p_date: date,
    p_part: part,
    p_free: free,
  });
}

// Toggle a whole day (all four parts) free or clear.
export async function setAvailabilityDay(
  coupleId: string,
  userId: string,
  date: string,
  free: boolean
) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("set_availability_day", {
    p_couple_id: coupleId,
    p_user_id: uid,
    p_date: date,
    p_free: free,
  });
}

export async function addEvent(data: {
  coupleId: string;
  userId: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  emoji?: string;
  allDay?: boolean;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("events").insert({
    couple_id: data.coupleId,
    created_by: uid,
    title: data.title,
    start_at: data.startAt,
    end_at: data.endAt ?? null,
    emoji: data.emoji ?? "📅",
    all_day: data.allDay ?? false,
  });
}

export async function updateEvent(data: {
  id: string;
  coupleId: string;
  userId: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  emoji?: string;
  allDay?: boolean;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Shared calendar: either partner may edit any event in their couple
  // (RLS scopes writes to the couple).
  await supabase
    .from("events")
    .update({
      title: data.title,
      start_at: data.startAt,
      end_at: data.endAt ?? null,
      emoji: data.emoji ?? "📅",
      all_day: data.allDay ?? false,
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId);
}

export async function deleteEvent(id: string, coupleId: string, userId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Shared calendar: either partner may delete any event in their couple.
  await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId);
}
