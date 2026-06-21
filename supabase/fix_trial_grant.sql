-- ════════════════════════════════════════════════════════════════════════════
-- Fix: trials weren't actually being granted → new spaces landed on free.
--
-- grant_couple_trial had a per-PERSON anti-farming gate ("only if neither partner
-- has ever consumed a trial"). Once anyone had consumed one (easy to hit while
-- testing, and a real risk for anyone starting a genuine new space), every later
-- space — and the backfill — silently skipped the grant, leaving trial_ends_at
-- null → is_premium false → free during what should be a premium trial.
--
-- New rule: ONE 60-day trial per couple, granted whenever the couple has none.
-- Simple, predictable, and every new space gets its trial. Then re-backfill all
-- trial-less couples so existing spaces (incl. the dev's) get premium now.
--
-- Idempotent. Run AFTER grant_trial_on_create.sql.
-- ════════════════════════════════════════════════════════════════════════════

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

-- Re-backfill now that the gate is gone: every couple without a trial gets one.
do $$
declare c uuid;
begin
  for c in select id from couples where trial_ends_at is null loop
    perform grant_couple_trial(c);
  end loop;
end $$;
