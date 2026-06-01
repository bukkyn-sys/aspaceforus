"use server";

import { createClient } from "@/lib/supabase/server";

export async function updateDisplayName(userId: string, name: string) {
  const supabase = await createClient();
  await supabase.rpc("update_my_display_name", { p_user_id: userId, p_name: name });
}

export async function updateAccentColor(userId: string, color: string) {
  const supabase = await createClient();
  await supabase.rpc("update_my_accent_color", { p_user_id: userId, p_color: color });
}

export async function updateAvatar(userId: string, url: string) {
  const supabase = await createClient();
  await supabase.rpc("update_my_avatar", { p_user_id: userId, p_url: url });
}

export async function updateCoupleBanner(coupleId: string, userId: string, url: string) {
  const supabase = await createClient();
  await supabase.rpc("update_couple_banner", { p_couple_id: coupleId, p_user_id: userId, p_url: url });
}

// Leave the current couple — clears your link to it so you can create or join
// another. Your partner keeps the existing space and its data.
export async function leaveCouple(userId: string) {
  const supabase = await createClient();
  await supabase.from("profiles").update({ couple_id: null }).eq("id", userId);
}
