import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, periodEndISO } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

// Stripe is the source of truth; this mirrors a subscription's current state into
// our `subscriptions` table (keyed by stripe_subscription_id). Writes use the
// service role — the webhook has no authenticated user.
async function upsertSub(admin: Admin, sub: Stripe.Subscription) {
  const coupleId = sub.metadata?.couple_id;
  if (!coupleId) return; // not one of ours (no metadata) — ignore

  const row = {
    couple_id: coupleId,
    payer_user_id: sub.metadata?.payer_user_id ?? null,
    plan_kind: sub.metadata?.plan_kind ?? "single",
    activation_state: "active",
    status: sub.status,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_subscription_id: sub.id,
    price_id: sub.items?.data?.[0]?.price?.id ?? null,
    current_period_end: periodEndISO(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  };
  await admin.from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" });
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription as string);
          await upsertSub(admin, sub);
        } else if (session.mode === "payment" && session.metadata?.kind === "lifetime") {
          // One-time founding lifetime purchase — grant it (honours the 5,000 cap).
          const coupleId = session.metadata?.couple_id;
          if (coupleId) await admin.rpc("claim_lifetime", { p_couple_id: coupleId });
        }
        break;
      }
      // status (incl. past_due on a failed payment) and renewals flow through here.
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertSub(admin, event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from("subscriptions")
          .update({ status: "canceled", activation_state: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }
    }
  } catch (e) {
    // 500 → Stripe retries with backoff.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
