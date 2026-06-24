-- ════════════════════════════════════════════════════════════════════════════
-- RLS TIGHTENING — remove broad direct-write policies on couples/profiles
-- (security review 2026-06).
--
-- The live DB had table-level UPDATE policies that let any authenticated couple
-- member mutate these tables directly via PostgREST, bypassing the hardened
-- SECURITY DEFINER RPCs the app actually uses:
--
--   🔴 couples_update  (USING is_couple_member(id))  → a member could
--      PATCH /rest/v1/couples?id=eq.<own couple> and set lifetime_at /
--      premium_override_until / trial_ends_at themselves = FREE PREMIUM.
--      (A second free-premium path the RPC execute-lockdown did not cover.)
--
--   🟠 profiles_update (USING id = auth.uid(), no couple_id guard) → a user
--      could PATCH their own profile and set couple_id to ANY couple's UUID,
--      joining it directly and bypassing the confirmation + rate-limit +
--      2-member-cap flow; also self-edit trial_consumed_at (trial anti-farming).
--
-- VERIFIED SAFE: the app performs NO direct user-client writes to couples or
-- profiles — every mutation goes through update_couple_* / update_my_* /
-- set_dashboard_layout / set_priority_todo_list etc. (all SECURITY DEFINER,
-- which bypass RLS), or the service-role admin client (Stripe/billing). So
-- removing these policies removes the abuse path without touching any feature.
--
-- Idempotent. Run in the Supabase SQL editor. REVERT block at the bottom.
-- ════════════════════════════════════════════════════════════════════════════

-- 🔴 CRITICAL — free-premium via direct couple update.
drop policy if exists couples_update on couples;

-- 🟠 HIGH — couple_id self-reassignment / trial anti-farming bypass.
drop policy if exists profiles_update on profiles;

-- 🔵 Defence-in-depth: the client never reads subscriptions directly (billing
-- uses the service role), so this policy only risked exposing stripe_customer_id
-- to couple members. Remove it.
drop policy if exists subscriptions_select on subscriptions;

-- 🔵 Anti-bloat: couples are only ever created by create_couple_for_user
-- (SECURITY DEFINER, bypasses RLS), so the open INSERT policy is unneeded and
-- let any user spam-insert empty couple rows.
drop policy if exists couples_insert on couples;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Expect: couples → couples_select only; profiles → profiles_select,
-- profiles_insert only; subscriptions → (no policies).
-- select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename in ('couples','profiles','subscriptions')
--   order by tablename, cmd;

-- ── REVERT (only if a direct-write feature is later added) ────────────────────
-- create policy couples_update on couples for update using (is_couple_member(id));
-- create policy profiles_update on profiles for update using (id = auth.uid());
-- create policy subscriptions_select on subscriptions for select using (is_couple_member(couple_id));
-- create policy couples_insert on couples for insert with check (true);
