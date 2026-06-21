-- ════════════════════════════════════════════════════════════════════════════
-- MONETIZATION v2 — tighter free tier, 60-day trial, lifetime tier, history gate.
--
-- Free (per couple): 25 photos · 0 albums · 1 to-do list · 1 pot · starter
-- folders only · current-month calendar · ~30-day history. Daily core stays free.
-- Premium: unlimited + full history + planning + customization.
--
-- Changes here (the un-bypassable DB layer):
--   1. Quota triggers: photos 50→25, albums premium-only, lists 2→1.
--   2. grant_couple_trial() — single source of trial length (now 60 days); both
--      join paths call it so they can never drift apart again.
--   3. Lifetime entitlement: couples.lifetime_at + a 5,000-purchase cap, folded
--      into is_premium(). claim_lifetime() (for the Stripe webhook) + a spots-
--      remaining read for the paywall.
--   4. free_history_cutoff() — 30-day window helper for history gating.
--
-- Idempotent. Run AFTER monetization_phase1.sql, monetization_beta_codes.sql,
-- monetization_quota_enforcement.sql, and join_confirmation.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Tighter quota triggers ─────────────────────────────────────────────────
create or replace function enforce_photo_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(NEW.couple_id)
     and (select count(*) from vault_photos where couple_id = NEW.couple_id and archived_at is null) >= 25 then
    raise exception 'free plan allows 25 photos' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;

-- Albums are premium-only now (free = the shared wall, no albums).
create or replace function enforce_album_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(NEW.couple_id) then
    raise exception 'albums are a premium feature' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;

create or replace function enforce_list_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(NEW.couple_id)
     and (select count(*) from vault_todo_lists where couple_id = NEW.couple_id) >= 1 then
    raise exception 'free plan allows 1 to-do list' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;
-- (pot quota stays 1, folder quota stays premium-only — unchanged.)

-- ── 2. Trial — 60 days, granted from one place ────────────────────────────────
-- Anti-farming: a trial is granted once per couple, and only if NEITHER partner
-- has ever consumed one (starting it stamps both partners' lifetime eligibility).
create or replace function grant_couple_trial(p_couple_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select trial_ends_at from couples where id = p_couple_id) is null then
    if not exists (
      select 1 from profiles where couple_id = p_couple_id and trial_consumed_at is not null
    ) then
      update couples set paired_at = coalesce(paired_at, now()),
                         trial_ends_at = now() + interval '60 days'
        where id = p_couple_id;
      update profiles set trial_consumed_at = now()
        where couple_id = p_couple_id and trial_consumed_at is null;
    else
      update couples set paired_at = coalesce(paired_at, now()) where id = p_couple_id;
    end if;
  end if;
end; $$;

-- Re-point the direct join path at the helper.
create or replace function join_couple_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple_id uuid;
  v_count     int;
  v_attempts  int;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;

  select count(*) into v_attempts from join_attempts
    where user_id = p_user_id and attempted_at > now() - interval '15 minutes';
  if v_attempts >= 10 then return 'rate_limited'; end if;

  select id into v_couple_id from couples where invite_code = p_code;
  if not found then
    insert into join_attempts (user_id) values (p_user_id);
    return 'not_found';
  end if;

  if exists (select 1 from profiles where id = p_user_id and couple_id = v_couple_id) then
    return 'ok';
  end if;

  select count(*) into v_count from profiles where couple_id = v_couple_id;
  if v_count >= 2 then return 'full'; end if;

  update profiles set couple_id = v_couple_id where id = p_user_id;
  perform grant_couple_trial(v_couple_id);
  return 'ok';
end; $$;

-- Re-point the confirmation flow's accept path at the helper too.
create or replace function respond_join_request(p_request_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple_id uuid;
  v_requester uuid;
  v_status    text;
  v_count     int;
begin
  select couple_id, requester_id, status into v_couple_id, v_requester, v_status
    from join_requests where id = p_request_id;
  if not found then return 'gone'; end if;
  if not is_couple_member(v_couple_id) then raise exception 'forbidden'; end if;
  if v_status <> 'pending' then return 'gone'; end if;

  if not p_accept then
    update join_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return 'rejected';
  end if;

  select count(*) into v_count from profiles where couple_id = v_couple_id;
  if v_count >= 2 then
    update join_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return 'full';
  end if;
  if exists (select 1 from profiles where id = v_requester and couple_id is not null) then
    update join_requests set status = 'cancelled', responded_at = now() where id = p_request_id;
    return 'gone';
  end if;

  update profiles set couple_id = v_couple_id where id = v_requester;
  update join_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  update join_requests set status = 'cancelled', responded_at = now()
    where couple_id = v_couple_id and status = 'pending';

  perform grant_couple_trial(v_couple_id);
  return 'accepted';
end; $$;

-- ── 3. Lifetime tier (one-time purchase, capped at the first 5,000) ───────────
alter table couples add column if not exists lifetime_at timestamptz;

-- is_premium now also passes lifetime members. (Re-stated from
-- monetization_beta_codes.sql with the lifetime clause added.)
create or replace function is_premium(p_couple_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from couples c where c.id = p_couple_id and c.lifetime_at is not null)
    or exists (
      select 1 from couples c
      where c.id = p_couple_id
        and (
          (c.trial_ends_at is not null and c.trial_ends_at > now())
          or (c.premium_override_until is not null and c.premium_override_until > now())
        )
    )
    or exists (
      select 1 from subscriptions s
      where s.couple_id = p_couple_id
        and s.plan_kind = 'single'
        and s.activation_state = 'active'
        and s.status in ('active', 'trialing')
    )
    or (
      select count(*) from subscriptions s
      where s.couple_id = p_couple_id
        and s.plan_kind = 'split'
        and s.activation_state = 'active'
        and s.status in ('active', 'trialing')
    ) >= 2;
$$;

-- Founding lifetime spots left (for the paywall's scarcity counter).
create or replace function lifetime_spots_remaining()
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, 5000 - (select count(*)::int from couples where lifetime_at is not null));
$$;

-- Grant a lifetime entitlement (called by the Stripe webhook on a successful
-- one-time payment). Honours the 5,000 cap; idempotent on retries. Returns true
-- if the couple holds lifetime afterwards.
create or replace function claim_lifetime(p_couple_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update couples set lifetime_at = now()
    where id = p_couple_id and lifetime_at is null
      and (select count(*) from couples where lifetime_at is not null) < 5000;
  get diagnostics n = row_count;
  if n > 0 then return true; end if;
  -- Already lifetime (retry) → success; otherwise the cap was hit.
  return exists (select 1 from couples where id = p_couple_id and lifetime_at is not null);
end; $$;

-- ── 4. History window — null = unlimited (premium), else 30-day cutoff ─────────
create or replace function free_history_cutoff(p_couple_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when is_premium(p_couple_id) then null else now() - interval '30 days' end;
$$;
