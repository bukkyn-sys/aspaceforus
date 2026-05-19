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
