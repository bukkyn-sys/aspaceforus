-- ════════════════════════════════════════════════════════════════════════════
-- MONETIZATION — Beta / comp codes
--
-- A redeemable code that grants a couple free Premium without Stripe (for beta
-- testers, friends, support comps). Runs after monetization_phase1.sql.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- Comped-premium window on the couple — independent of trial + subscription.
alter table couples add column if not exists premium_override_until timestamptz;

-- The codes themselves. No client RLS policies: only the SECURITY DEFINER
-- redeem function below touches this table, so codes can't be enumerated.
create table if not exists beta_codes (
  code         text primary key,
  note         text,                       -- free-text label (who it's for)
  premium_days int     not null default 365,
  max_uses     int,                         -- null = unlimited
  used_count   int     not null default 0,
  active       boolean not null default true,
  created_at   timestamptz default now()
);
alter table beta_codes enable row level security;

-- is_premium now also honours a comp override (trial OR override OR active sub).
create or replace function is_premium(p_couple_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select
    exists (
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

-- Redeem a code for the caller's couple. Returns:
--   'ok' | 'no_couple' | 'not_found' | 'exhausted'
create or replace function redeem_beta_code(p_code text)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_couple_id uuid;
  v_code      beta_codes%rowtype;
begin
  select couple_id into v_couple_id from profiles where id = auth.uid();
  if v_couple_id is null then return 'no_couple'; end if;

  select * into v_code from beta_codes
    where lower(code) = lower(trim(p_code)) and active;
  if not found then return 'not_found'; end if;

  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    return 'exhausted';
  end if;

  -- Extend (never shorten) the comp window from now.
  update couples
    set premium_override_until = greatest(
          coalesce(premium_override_until, now()),
          now() + make_interval(days => v_code.premium_days)
        )
    where id = v_couple_id;

  update beta_codes set used_count = used_count + 1 where code = v_code.code;
  return 'ok';
end;
$$;

-- ── Seed one code so testing works out of the box ────────────────────────────
-- A year of free Premium, capped at 500 redemptions. Edit / add your own:
--   insert into beta_codes (code, note, premium_days, max_uses)
--   values ('YOURCODE', 'who it's for', 365, 100) on conflict (code) do nothing;
-- Deactivate later with: update beta_codes set active = false where code = '…';
insert into beta_codes (code, note, premium_days, max_uses)
values ('BETALOVE', 'early beta testers', 365, 500)
on conflict (code) do nothing;
