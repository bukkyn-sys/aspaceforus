"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

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

// Ask to join a space: creates a PENDING request and pings the existing member
// to accept. The joiner waits on a "waiting for them to accept" screen until
// their request row flips to accepted (see onboarding-client).
export async function requestJoinCouple(userId: string, code: string, requesterName: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_join_couple", { p_user_id: userId, p_code: code });
  if (error) return { error: error.message };
  const res = (data ?? {}) as { status?: string; couple_id?: string };
  if (res.status === "rate_limited") return { error: "too many attempts — try again in 15 minutes." };
  if (res.status === "not_found") return { error: "code not found — double-check with your partner." };
  if (res.status === "full") return { error: "that space already has two people in it." };
  // Already in this space — nothing to confirm, just proceed.
  if (res.status === "already_member") return { ok: true as const };
  if (res.status === "pending" && res.couple_id) {
    await notifyPartner(res.couple_id, userId, "us.", `${requesterName} wants to join your space`, "/home");
    return { pending: true as const };
  }
  return { error: "something went wrong — please try again." };
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
