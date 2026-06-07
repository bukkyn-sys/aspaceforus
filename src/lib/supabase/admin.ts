import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS. **Server only.** Use exclusively
 * for the Stripe webhook (no authenticated user) and for billing server actions
 * that have already authenticated the caller and scoped every query to *their
 * own* couple. Never import this into client code or trust client-supplied ids.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
