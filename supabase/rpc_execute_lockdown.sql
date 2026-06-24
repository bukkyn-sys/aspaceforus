-- ════════════════════════════════════════════════════════════════════════════
-- RPC EXECUTE LOCKDOWN — close the "any public function is a callable REST RPC"
-- hole (security review, 2026-06-24).
--
-- Supabase exposes every public-schema function to the `anon`/`authenticated`
-- roles by default. SECURITY DEFINER functions that DON'T self-check the caller
-- (no auth.uid() / is_couple_member()) are therefore callable by any logged-in
-- user against any couple UUID. The worst is claim_lifetime() → free lifetime
-- premium for anyone. This revokes EXECUTE from end-user roles on the functions
-- that are meant to be internal (called by triggers, by other definer functions,
-- or by the service-role Stripe webhook) and never directly by a client.
--
-- SAFE: the Stripe webhook uses the service_role key (keeps execute as owner),
-- and internal calls (e.g. get_home_data → daily_build) run as the function
-- OWNER, not as `authenticated`, so revoking from authenticated does not break
-- them. lifetime_spots_remaining is intentionally LEFT callable (the paywall
-- reads it via the user client).
--
-- Idempotent. Run in the Supabase SQL editor. Verify with the query at the end.
-- ════════════════════════════════════════════════════════════════════════════

-- 🔴 CRITICAL — free-premium bypass. Only the service-role webhook may call this.
revoke execute on function claim_lifetime(uuid) from anon, authenticated;

-- 🟡 trial granter — only the join RPCs (definer-owned) call it internally.
revoke execute on function grant_couple_trial(uuid) from anon, authenticated;

-- 🟠 / 🔵 internal helpers — only ever called by other definer functions, never
-- directly by a client. Revoking keeps internal (owner-context) calls working.
revoke execute on function daily_build(uuid, uuid, uuid, date) from anon, authenticated;
revoke execute on function daily_pick_prompt(uuid, date)        from anon, authenticated;
revoke execute on function daily_shared_count(uuid)             from anon, authenticated;
revoke execute on function priority_todo_json(uuid)             from anon, authenticated;
revoke execute on function is_premium(uuid)                     from anon, authenticated;
revoke execute on function free_history_cutoff(uuid)            from anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Lists every SECURITY DEFINER public function and whether `authenticated` can
-- still call it. After running the above, the only `true` rows should be ones a
-- client is SUPPOSED to call directly (get_home_data, get_daily, get_session_data,
-- update_my_*, *_couple_for_user, request/respond/pending_join_request,
-- set_dashboard_layout, set_priority_todo_list, clear_couple_availability,
-- submit_daily_response, get_daily_history, lifetime_spots_remaining, etc.).
-- Anything unexpectedly `true` with no internal auth.uid()/is_couple_member()
-- guard is a finding.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by authed_can_call desc, p.proname;
