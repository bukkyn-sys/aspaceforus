import Stripe from "stripe";

// Lazily constructed — env isn't available at build-time module load.
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key); // SDK pins a default apiVersion
  }
  return _stripe;
}

export type PlanInterval = "monthly" | "annual";

// Founding price IDs live in Stripe → injected via env so we can raise prices
// later by swapping the ID (existing subs keep their old price). Monthly may
// rise; annual (£19.99) locks the founding rate for the term.
export function priceFor(plan: PlanInterval): string {
  return (plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY) ?? "";
}
export const PRICE_MONTHLY = () => process.env.STRIPE_PRICE_MONTHLY ?? "";
export const PRICE_ANNUAL = () => process.env.STRIPE_PRICE_ANNUAL ?? "";

// `current_period_end` lives on the subscription item in newer API versions and
// on the subscription itself in older ones — read whichever is present.
export function periodEndISO(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const top = (sub as unknown as { current_period_end?: number }).current_period_end;
  const secs = item?.current_period_end ?? top;
  return secs ? new Date(secs * 1000).toISOString() : null;
}
