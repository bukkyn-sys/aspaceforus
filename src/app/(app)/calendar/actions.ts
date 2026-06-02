"use server";

import { createClient } from "@/lib/supabase/server";

async function getUid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

export async function setAvailability(
  coupleId: string,
  userId: string,
  date: string,
  status: "free" | null
) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("set_availability", {
    p_couple_id: coupleId,
    p_user_id: uid,
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
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("events").insert({
    couple_id: data.coupleId,
    created_by: uid,
    title: data.title,
    start_at: data.startAt,
    end_at: data.endAt ?? null,
    emoji: data.emoji ?? "📅",
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
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
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
    .eq("created_by", uid);
}

export async function deleteEvent(id: string, coupleId: string, userId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("created_by", uid);
}
