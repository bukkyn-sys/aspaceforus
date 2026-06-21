-- ════════════════════════════════════════════════════════════════════════════
-- Trial model: the 60-day premium trial starts on PAIRING, not at space creation.
--
-- A solo space stays free until the partner joins; the moment they do,
-- grant_couple_trial fires from the join paths (join_couple_for_user /
-- respond_join_request) and the 60 days begin. The trial is per-couple, so the
-- only way to "farm" another is to abandon the space and build a brand-new one
-- from scratch — enough friction to deter abuse without punishing real couples.
--
-- SELF-CONTAINED: this is the only trial migration you need to run now (it folds
-- in the relaxed grant_couple_trial, so you do NOT need fix_trial_grant.sql
-- separately). Idempotent. Run AFTER monetization_v2.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- One 60-day trial per couple, granted whenever the couple has none. No
-- per-person gate (that blocked legitimate new spaces / re-tests).
create or replace function grant_couple_trial(p_couple_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select trial_ends_at from couples where id = p_couple_id) is null then
    update couples set paired_at = coalesce(paired_at, now()),
                       trial_ends_at = now() + interval '60 days'
      where id = p_couple_id;
    update profiles set trial_consumed_at = coalesce(trial_consumed_at, now())
      where couple_id = p_couple_id;
  end if;
end; $$;

-- No trial at creation — a solo space stays free until the partner joins (the
-- join paths call grant_couple_trial).
create or replace function create_couple_for_user(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_couple_id uuid; v_code text;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
  insert into couples default values returning id, invite_code into v_couple_id, v_code;
  update profiles set couple_id = v_couple_id where id = p_user_id;
  return v_code;
end; $$;

-- Backfill ONLY existing paired couples that never got a trial (solo spaces stay
-- free until they pair, per the model). One-time, generous to early real pairs.
do $$
declare c uuid;
begin
  for c in
    select id from couples
    where trial_ends_at is null
      and (select count(*) from profiles where couple_id = couples.id) = 2
  loop
    perform grant_couple_trial(c);
  end loop;
end $$;
