-- ════════════════════════════════════════════════════════════════════════════
-- Fix: grant the 60-day premium trial at couple CREATION, not just at pairing.
--
-- The trial was only granted when a second person joined, so a solo creator who
-- finished onboarding ("start your 60 days free") had trial_ends_at = null and
-- was silently dropped to the free tier — premium features locked during what is
-- meant to be a trial OF premium.
--
-- create_couple_for_user now grants the trial immediately. grant_couple_trial is
-- idempotent (only fires when trial_ends_at is null), so the later join no-ops.
-- Also backfills any existing trial-less couples so current testers get premium.
--
-- Idempotent. Run AFTER monetization_v2.sql (which defines grant_couple_trial).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function create_couple_for_user(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_couple_id uuid; v_code text;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  -- Self-heal: ensure the profile exists so the couple link can't no-op.
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
  insert into couples default values returning id, invite_code into v_couple_id, v_code;
  update profiles set couple_id = v_couple_id where id = p_user_id;
  -- Every new space starts on the 60-day premium trial.
  perform grant_couple_trial(v_couple_id);
  return v_code;
end; $$;

-- Backfill: any couple that never received a trial gets one now (covers early
-- testers + anyone who created a space before this fix).
do $$
declare c uuid;
begin
  for c in select id from couples where trial_ends_at is null loop
    perform grant_couple_trial(c);
  end loop;
end $$;
