"use server";

import { headers } from "next/headers";
import { getUid } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, priceFor, PRICE_ANNUAL, PRICE_MONTHLY, type PlanInterval } from "@/lib/stripe";

type Admin = ReturnType<typeof createAdminClient>;

// Derive the caller's couple server-side from their validated uid — never trust a
// client-supplied couple id (the admin client bypasses RLS).
async function coupleOf(admin: Admin, uid: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("couple_id").eq("id", uid).single();
  return (data?.couple_id as string | null) ?? null;
}

async function origin(): Promise<string> {
  const h = await headers();
  return h.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isActivePaid(s: any): boolean {
  return s.activation_state === "active" && (s.status === "active" || s.status === "trialing");
}

export type BillingState = {
  premium: boolean;      // effective entitlement (paid OR comp OR active trial)
  paid: boolean;         // active paid subscription → founding member
  comp: boolean;         // active beta/comp override → beta tester
  onTrial: boolean;
  trialEndsAt: string | null;
  plan: PlanInterval | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

const EMPTY_STATE: BillingState = {
  premium: false, paid: false, comp: false, onTrial: false,
  trialEndsAt: null, plan: null, cancelAtPeriodEnd: false, currentPeriodEnd: null,
};

export async function getBillingState(): Promise<BillingState> {
  const { uid } = await getUid();
  if (!uid) return EMPTY_STATE;
  const admin = createAdminClient();
  const coupleId = await coupleOf(admin, uid);
  if (!coupleId) return EMPTY_STATE;

  const [{ data: couple }, { data: subs }] = await Promise.all([
    admin.from("couples").select("trial_ends_at, premium_override_until").eq("id", coupleId).single(),
    admin.from("subscriptions")
      .select("plan_kind, activation_state, status, current_period_end, cancel_at_period_end, price_id")
      .eq("couple_id", coupleId),
  ]);

  const now = Date.now();
  const trialEndsAt = (couple?.trial_ends_at as string | null) ?? null;
  const overrideUntil = (couple?.premium_override_until as string | null) ?? null;
  const onTrial = !!trialEndsAt && new Date(trialEndsAt).getTime() > now;
  const comp = !!overrideUntil && new Date(overrideUntil).getTime() > now;
  const active = (subs ?? []).find(isActivePaid);
  const paid = !!active;

  const plan: PlanInterval | null =
    active?.price_id === PRICE_ANNUAL() ? "annual"
    : active?.price_id === PRICE_MONTHLY() ? "monthly"
    : null;

  return {
    premium: paid || comp || onTrial,
    paid,
    comp,
    onTrial,
    trialEndsAt,
    plan,
    cancelAtPeriodEnd: !!active?.cancel_at_period_end,
    currentPeriodEnd: (active?.current_period_end as string | null) ?? null,
  };
}

export async function startCheckout(
  plan: PlanInterval,
  source: "profile" | "onboarding" = "profile",
): Promise<{ url?: string; error?: string }> {
  try {
    const { uid } = await getUid();
    if (!uid) return { error: "not signed in" };
    const admin = createAdminClient();
    const coupleId = await coupleOf(admin, uid);
    if (!coupleId) return { error: "no space yet" };

    const { data: existing } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, activation_state, status")
      .eq("couple_id", coupleId);

    // Double-subscribe guard: one active paid subscription per couple.
    if ((existing ?? []).some(isActivePaid)) return { error: "already subscribed" };

    const price = priceFor(plan);
    if (!price) return { error: "pricing not configured (missing price env var)" };

    // Reuse an existing Stripe customer (e.g. a lapsed sub) so we don't fork billing.
    const reuse = (existing ?? []).find((s) => s.stripe_customer_id)?.stripe_customer_id as string | undefined;
    const meta = { couple_id: coupleId, payer_user_id: uid, plan_kind: "single" };
    const base = await origin();
    // Onboarding checkouts return into the app; settings checkouts return to profile.
    const successUrl = source === "onboarding" ? `${base}/home?welcome=premium` : `${base}/profile?billing=success`;
    const cancelUrl = source === "onboarding" ? `${base}/home` : `${base}/profile?billing=cancel`;

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      ...(reuse ? { customer: reuse } : {}),
      metadata: meta,
      subscription_data: { metadata: meta },
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return session.url ? { url: session.url } : { error: "could not start checkout" };
  } catch (e) {
    console.error("startCheckout failed", e);
    return { error: (e as Error)?.message ?? "checkout failed" };
  }
}

// Redeem a beta/comp code → grants the couple free Premium (no Stripe). Runs on
// the authed client so the RPC's auth.uid() resolves to the caller.
export async function redeemBetaCode(code: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { supabase, uid } = await getUid();
    if (!uid) return { error: "not signed in" };
    const { data, error } = await supabase.rpc("redeem_beta_code", { p_code: code });
    if (error) return { error: error.message };
    switch (data as string) {
      case "ok": return { ok: true };
      case "no_couple": return { error: "finish setting up your space first" };
      case "exhausted": return { error: "this code has been fully used" };
      default: return { error: "that code isn't valid" };
    }
  } catch (e) {
    console.error("redeemBetaCode failed", e);
    return { error: (e as Error)?.message ?? "could not redeem code" };
  }
}

export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  try {
    const { uid } = await getUid();
    if (!uid) return { error: "not signed in" };
    const admin = createAdminClient();
    const coupleId = await coupleOf(admin, uid);
    if (!coupleId) return { error: "no space yet" };

    const { data: subs } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("couple_id", coupleId)
      .not("stripe_customer_id", "is", null)
      .limit(1);

    const customer = subs?.[0]?.stripe_customer_id as string | undefined;
    if (!customer) return { error: "no subscription to manage" };

    const base = await origin();
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${base}/profile`,
    });
    return { url: session.url };
  } catch (e) {
    console.error("openBillingPortal failed", e);
    return { error: (e as Error)?.message ?? "could not open portal" };
  }
}
