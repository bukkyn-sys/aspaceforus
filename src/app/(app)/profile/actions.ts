"use server";

import { createClient } from "@/lib/supabase/server";
import { getUid } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { clampRequired, clampText, LIMITS } from "@/lib/validate-input";

export async function updateDisplayName(userId: string, name: string) {
  const supabase = await createClient();
  await supabase.rpc("update_my_display_name", { p_user_id: userId, p_name: clampRequired(name, LIMITS.name) });
}

export async function updateAccentColor(userId: string, color: string) {
  const supabase = await createClient();
  await supabase.rpc("update_my_accent_color", { p_user_id: userId, p_color: color });
}

export async function updateAvatar(userId: string, url: string) {
  const supabase = await createClient();
  await supabase.rpc("update_my_avatar", { p_user_id: userId, p_url: clampText(url, LIMITS.url) ?? "" });
}

export async function updateCoupleBanner(coupleId: string, userId: string, url: string) {
  const supabase = await createClient();
  await supabase.rpc("update_couple_banner", { p_couple_id: coupleId, p_user_id: userId, p_url: clampText(url, LIMITS.url) ?? "" });
}

export async function updateCoupleCurrency(coupleId: string, userId: string, currency: string) {
  const supabase = await createClient();
  await supabase.rpc("update_couple_currency", { p_couple_id: coupleId, p_user_id: userId, p_currency: clampRequired(currency, LIMITS.currency) });
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

// GDPR right to access — returns a JSON document of the caller's profile + their
// couple's shared content for the "download my data" action.
export async function exportMyData(): Promise<{ data?: unknown; error?: string }> {
  const { supabase, uid } = await getUid();
  if (!uid) return { error: "not signed in" };
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return { error: error.message };
  return { data };
}

// GDPR right to erasure — deletes the caller's account. If they're the only
// member of their couple, cancels any active Stripe subscription first (deleting
// the couple removes our local record but not the Stripe sub); if a partner
// remains, the subscription belongs to the surviving couple and is left alone.
export async function deleteAccount(): Promise<{ ok?: true; error?: string }> {
  const { supabase, uid } = await getUid();
  if (!uid) return { error: "not signed in" };
  try {
    const admin = createAdminClient();
    const { data: prof } = await admin.from("profiles").select("couple_id").eq("id", uid).single();
    const coupleId = (prof?.couple_id as string | null) ?? null;
    if (coupleId) {
      const { count } = await admin
        .from("profiles").select("id", { count: "exact", head: true })
        .eq("couple_id", coupleId).neq("id", uid);
      const solo = (count ?? 0) === 0;
      if (solo) {
        const { data: subs } = await admin
          .from("subscriptions").select("stripe_subscription_id, status").eq("couple_id", coupleId);
        for (const s of subs ?? []) {
          const sid = s.stripe_subscription_id as string | null;
          if (sid && s.status !== "canceled") {
            try { await stripe().subscriptions.cancel(sid); } catch { /* already gone at Stripe */ }
          }
        }
      }
    }
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) {
    return { error: (e as Error)?.message ?? "could not delete account" };
  }
}
