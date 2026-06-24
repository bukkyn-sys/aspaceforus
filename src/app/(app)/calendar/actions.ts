"use server";

import { getUid } from "@/lib/auth-server";
import { clampText, clampRequired, LIMITS } from "@/lib/validate-input";

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

// Clear a date+part for BOTH partners (used when an event blocks a free window).
export async function clearCoupleAvailabilityPart(coupleId: string, date: string, part: DayPart) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.rpc("clear_couple_availability", { p_couple_id: coupleId, p_date: date, p_part: part });
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

// Events are day-parts now: a date + one or more parts (morning/afternoon/
// evening/night). untilDate spans a multi-day event (all parts each day);
// startTime is an optional cosmetic label only (no free/busy logic).
export async function addEvent(data: {
  id?: string;
  coupleId: string;
  userId: string;
  title: string;
  onDate: string;
  parts: DayPart[];
  untilDate?: string | null;
  startTime?: string | null;
  emoji?: string;
  attendee?: string | null;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Insert with the client-generated id so the optimistic row and the DB row
  // share an id — otherwise editing a just-created event targets a row that
  // doesn't exist (the edit silently no-ops and reverts on the next reload).
  await supabase.from("events").insert({
    ...(data.id ? { id: data.id } : {}),
    couple_id: data.coupleId,
    created_by: uid,
    title: clampRequired(data.title, LIMITS.title),
    on_date: data.onDate,
    parts: data.parts,
    until_date: data.untilDate || null,
    start_time: clampText(data.startTime, 32),
    emoji: clampText(data.emoji, LIMITS.emoji) ?? "📅",
    attendee: data.attendee ?? null,
  });
}

export async function updateEvent(data: {
  id: string;
  coupleId: string;
  userId: string;
  title: string;
  onDate: string;
  parts: DayPart[];
  untilDate?: string | null;
  startTime?: string | null;
  emoji?: string;
  attendee?: string | null;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Shared calendar: either partner may edit any event in their couple
  // (RLS scopes writes to the couple).
  await supabase
    .from("events")
    .update({
      title: data.title,
      on_date: data.onDate,
      parts: data.parts,
      until_date: data.untilDate || null,
      start_time: data.startTime || null,
      emoji: data.emoji ?? "📅",
      attendee: data.attendee ?? null,
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
