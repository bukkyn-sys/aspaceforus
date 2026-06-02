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

export async function updateCoupleCurrency(coupleId: string, userId: string, currency: string) {
  const supabase = await createClient();
  await supabase.rpc("update_couple_currency", { p_couple_id: coupleId, p_user_id: userId, p_currency: currency });
}

export async function updateCoupleBannerFocus(coupleId: string, userId: string, focus: number) {
  const supabase = await createClient();
  await supabase.rpc("update_couple_banner_focus", { p_couple_id: coupleId, p_user_id: userId, p_focus: focus });
}

// Leave the current couple — clears your link to it so you can create or join
// another. Your partner keeps the existing space and its data. Uses a
// security-definer RPC (like the other profile mutations) so it's reliable
// regardless of RLS/auth context in the server action.
export async function leaveCouple(userId: string) {
  const supabase = await createClient();
  await supabase.rpc("leave_couple_for_user", { p_user_id: userId });
}
