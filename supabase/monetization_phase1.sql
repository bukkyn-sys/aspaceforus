-- ════════════════════════════════════════════════════════════════════════════
-- MONETIZATION — Phase 1: entitlement plumbing (DARK)
--
-- Adds the trial + subscription scaffolding the rest of monetization builds on.
-- Nothing in the app READS this yet, so applying it has ZERO user-visible effect
-- and no enforcement. Safe to run anytime. See docs/MONETIZATION_SPEC.md.
--
-- What it does:
--   • profiles.trial_consumed_at  — once-ever-per-person trial eligibility (anti-farm)
--   • profiles.email_normalized   — gmail-canonicalised email (anti-farm signal)
--   • couples.paired_at / trial_ends_at — 30-day trial window, granted at pairing
--   • subscriptions table         — built for single now, split (2 rows) later
--   • is_premium(couple_id)        — single source of truth for entitlement
--   • join_couple_for_user(...)    — now grants the trial when a couple becomes a pair
--
-- The SQL editor runs this whole file as one transaction; every statement is
-- idempotent, so it's safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Email normalisation ──────────────────────────────────────────────────────
-- Lowercase; strip a +tag from the local part; for gmail/googlemail also drop
-- dots and canonicalise the domain. Used only as an anti-farming signal, never
-- for auth. Non-gmail dots are significant, so they're preserved.
create or replace function normalize_email(p_email text)
returns text language sql immutable as $$
  select case
    when p_email is null or position('@' in p_email) = 0
      then lower(p_email)
    else (
      select case
        when dom in ('gmail.com', 'googlemail.com')
          then replace(split_part(loc, '+', 1), '.', '') || '@gmail.com'
        else split_part(loc, '+', 1) || '@' || dom
      end
      from (
        select lower(split_part(p_email, '@', 1)) as loc,
               lower(split_part(p_email, '@', 2)) as dom
      ) s
    )
  end;
$$;

-- ── New columns ──────────────────────────────────────────────────────────────
alter table profiles add column if not exists trial_consumed_at timestamptz;
alter table profiles add column if not exists email_normalized   text;
create index if not exists profiles_email_normalized_idx on profiles (email_normalized);

alter table couples  add column if not exists paired_at     timestamptz;
alter table couples  add column if not exists trial_ends_at timestamptz;

-- ── Signup trigger now records the normalised email ──────────────────────────
-- (Same as schema.sql's handle_new_user, plus email_normalized. The existing
-- on_auth_user_created trigger keeps pointing here — create-or-replace is enough.)
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_url, email_normalized)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    normalize_email(new.email)
  )
  on conflict (id) do update set
    display_name     = coalesce(excluded.display_name,     profiles.display_name),
    avatar_url       = coalesce(excluded.avatar_url,       profiles.avatar_url),
    email_normalized = coalesce(excluded.email_normalized, profiles.email_normalized);
  return new;
end;
$$;

-- Backfill the normalised email for existing users (one-off; idempotent).
update profiles p
set email_normalized = normalize_email(u.email)
from auth.users u
where u.id = p.id and p.email_normalized is null;

-- ── Subscriptions ────────────────────────────────────────────────────────────
-- A couple has 0 rows (free/trial), 1 'single' row, or 2 'split' rows. Entitlement
-- is "fully funded" (see is_premium), never "has a row". Written by the Stripe
-- webhook via the service role only — there is deliberately NO client write policy.
create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  couple_id              uuid not null references couples(id) on delete cascade,
  payer_user_id          uuid references profiles(id) on delete set null,
  plan_kind              text not null default 'single' check (plan_kind in ('single', 'split')),
  -- 'waiting_partner' = a split half paid first; not billed/entitling until the
  -- partner also subscribes and both are resumed together.
  activation_state       text not null default 'active'  check (activation_state in ('waiting_partner', 'active', 'canceled')),
  status                 text,           -- mirrors Stripe: trialing|active|past_due|canceled|…
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
create index if not exists subscriptions_couple_idx on subscriptions (couple_id);

alter table subscriptions enable row level security;
-- Members may READ their couple's subscription state (for the upgrade UI). No
-- insert/update/delete policy: only the service-role webhook mutates this table,
-- so clients can never forge entitlement.
drop policy if exists "subscriptions_select" on subscriptions;
create policy "subscriptions_select" on subscriptions for select
  using (is_couple_member(couple_id));

-- ── Entitlement: the one source of truth ─────────────────────────────────────
-- Premium if: an active trial window, OR an active single-payer sub, OR BOTH
-- split halves active ("fully funded"). Grace handling for past_due lands with
-- the webhook in Phase 2; for now only active/trialing entitle.
create or replace function is_premium(p_couple_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select
    exists (
      select 1 from couples c
      where c.id = p_couple_id
        and c.trial_ends_at is not null
        and c.trial_ends_at > now()
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

-- ── Pairing now grants the one-time 30-day Premium trial ─────────────────────
-- Extends the current join RPC (join_rate_limit.sql) — keeps the rate-limit, the
-- 2-person cap, and idempotency exactly as they are, and adds the trial grant.
create or replace function join_couple_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple_id  uuid;
  v_count      int;
  v_attempts   int;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;

  -- Rate-limit: count failed attempts in the last 15 minutes.
  select count(*) into v_attempts
    from join_attempts
    where user_id = p_user_id
      and attempted_at > now() - interval '15 minutes';
  if v_attempts >= 10 then
    return 'rate_limited';
  end if;

  select id into v_couple_id from couples where invite_code = p_code;
  if not found then
    insert into join_attempts (user_id) values (p_user_id);
    return 'not_found';
  end if;

  -- Already a member of this space → idempotent success (don't count as attempt).
  if exists (select 1 from profiles where id = p_user_id and couple_id = v_couple_id) then
    return 'ok';
  end if;

  -- Couple full?
  select count(*) into v_count from profiles where couple_id = v_couple_id;
  if v_count >= 2 then return 'full'; end if;

  update profiles set couple_id = v_couple_id where id = p_user_id;

  -- ── Premium trial grant ────────────────────────────────────────────────────
  -- The couple has just become a pair. Grant the one-time 30-day trial, but only
  -- if NEITHER partner has ever consumed one (anti-farming). The trial is keyed
  -- to the *person*: starting it consumes both partners' lifetime eligibility, so
  -- re-pairing existing accounts can never mint a fresh trial. Granting requires
  -- two brand-new identities every time.
  if (select trial_ends_at from couples where id = v_couple_id) is null then
    if not exists (
      select 1 from profiles
      where couple_id = v_couple_id and trial_consumed_at is not null
    ) then
      update couples
        set paired_at     = coalesce(paired_at, now()),
            trial_ends_at = now() + interval '30 days'
        where id = v_couple_id;
      update profiles
        set trial_consumed_at = now()
        where couple_id = v_couple_id and trial_consumed_at is null;
    else
      -- No trial (someone already used theirs), but still record the pairing.
      update couples set paired_at = coalesce(paired_at, now())
        where id = v_couple_id;
    end if;
  end if;

  return 'ok';
end; $$;

-- ── Verify (optional) ────────────────────────────────────────────────────────
-- select normalize_email('First.Last+spam@googlemail.com');  -- → firstlast@gmail.com
-- select normalize_email('a.b+x@outlook.com');               -- → a.b@outlook.com
-- select is_premium('<a-couple-id>');
