"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveProfile(data: {
  userId: string;
  name: string;
  accentColor: string;
  avatarUrl: string | null;
}) {
  const supabase = await createClient();
  await supabase.rpc("update_my_display_name", { p_user_id: data.userId, p_name: data.name.trim() });
  await supabase.rpc("update_my_accent_color", { p_user_id: data.userId, p_color: data.accentColor });
  if (data.avatarUrl) {
    await supabase.rpc("update_my_avatar", { p_user_id: data.userId, p_url: data.avatarUrl });
  }
}

export async function createCouple(userId: string) {
  const supabase = await createClient();
  const { data: inviteCode, error } = await supabase.rpc("create_couple_for_user", { p_user_id: userId });
  if (error) return { error: error.message };
  // get_my_profile is SECURITY DEFINER so it bypasses RLS — direct profiles query would return null
  const { data: profile } = await supabase.rpc("get_my_profile", { p_user_id: userId });
  const coupleId = (profile as { couple_id: string } | null)?.couple_id;
  return { inviteCode: inviteCode as string, coupleId: coupleId as string };
}

export async function joinCouple(userId: string, code: string) {
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("join_couple_for_user", { p_user_id: userId, p_code: code });
  if (error) return { error: error.message };
  if (result === "rate_limited") return { error: "too many attempts — try again in 15 minutes." };
  if (result === "not_found") return { error: "code not found — double-check with your partner." };
  if (result === "full") return { error: "that space already has two people in it." };
  // Success — the client routes on to the plan step (then /home).
  return { ok: true as const };
}

export async function setOnboardingStartDate(userId: string, coupleId: string, date: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_couple_started_at", {
    p_couple_id: coupleId,
    p_user_id: userId,
    p_date: date,
  });
  if (error) return { error: error.message };
}
