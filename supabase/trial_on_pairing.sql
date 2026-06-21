-- ════════════════════════════════════════════════════════════════════════════
-- Trial model: the 60-day premium trial starts on PAIRING, not at space creation.
--
-- A solo space stays free until the partner joins; the moment they do,
-- grant_couple_trial fires from the join paths (join_couple_for_user /
-- respond_join_request) and the 60 days begin. The trial is per-couple, so the
-- only way to "farm" another is to abandon the space and start a brand-new one
-- from scratch — enough friction to deter abuse without punishing real couples.
--
-- This reverts the at-creation grant added by grant_trial_on_create.sql. The
-- grant_couple_trial body (per-couple, no per-person gate) from fix_trial_grant
-- stays as-is — it's what the join paths call.
--
-- Idempotent. Run AFTER fix_trial_grant.sql.
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
  -- No trial here — it's granted on pairing (see grant_couple_trial in the join
  -- paths). A solo space stays free until the partner joins.
  return v_code;
end; $$;
