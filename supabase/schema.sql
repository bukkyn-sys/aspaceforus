-- "us." database schema
-- Run in Supabase SQL editor

-- ── Couples ──────────────────────────────────────────────────────────────────
create table if not exists couples (
  id          uuid primary key default gen_random_uuid(),
  invite_code text unique default substring(gen_random_uuid()::text, 1, 8),
  created_at  timestamptz default now()
);

-- ── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  couple_id    uuid references couples(id) on delete set null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz default now()
);

-- Auto-create profile on signup (ON CONFLICT so it never fails)
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, profiles.display_name),
    avatar_url   = coalesce(excluded.avatar_url,   profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Availability (Overlap Calendar) ─────────────────────────────────────────
create table if not exists availability (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('free', 'busy')),
  created_at timestamptz default now(),
  unique (couple_id, user_id, date)
);

-- ── Countdowns / Getaways ─────────────────────────────────────────────────────
create table if not exists countdowns (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  title       text not null,
  target_date date not null,
  emoji       text default '✈️',
  archived    boolean default false,
  created_at  timestamptz default now()
);

-- ── Events (Calendar) ────────────────────────────────────────────────────────
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  created_by uuid not null references profiles(id),
  title      text not null,
  start_at   timestamptz not null,
  end_at     timestamptz,
  colour_tag text default '#1a1a18',
  created_at timestamptz default now()
);

-- ── Vault Items (Dates & Wishlists) ──────────────────────────────────────────
create table if not exists vault_items (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  type        text not null check (type in ('date_idea', 'wishlist')),
  owner       text check (owner in ('shared', 'his', 'hers')),
  title       text not null,
  url         text,
  og_image    text,
  og_title    text,
  stage       text default 'ideas' check (stage in ('ideas', 'planned', 'completed')),
  tags        text[],
  bought_by   uuid references profiles(id), -- for surprise mode
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Ledger Entries ────────────────────────────────────────────────────────────
create table if not exists ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  paid_by     uuid not null references profiles(id),
  title       text not null,
  amount      numeric(10,2) not null,
  split_ratio numeric(4,3) default 0.5, -- current user's share
  settled     boolean default false,
  created_at  timestamptz default now()
);

-- ── Savings Pots ─────────────────────────────────────────────────────────────
create table if not exists savings_pots (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples(id) on delete cascade,
  title        text not null,
  goal_amount  numeric(10,2) not null,
  his_amount   numeric(10,2) default 0,
  hers_amount  numeric(10,2) default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── Sounding Board ────────────────────────────────────────────────────────────
create table if not exists sounding_board (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  created_by uuid not null references profiles(id),
  url        text,
  og_image   text,
  og_title   text,
  note       text,
  reaction   text, -- 'go_for_it', 'do_you_need_that', null
  created_at timestamptz default now()
);

-- ── RLS: enable on all tables ─────────────────────────────────────────────────
alter table couples         enable row level security;
alter table profiles        enable row level security;
alter table availability    enable row level security;
alter table countdowns      enable row level security;
alter table events          enable row level security;
alter table vault_items     enable row level security;
alter table ledger_entries  enable row level security;
alter table savings_pots    enable row level security;
alter table sounding_board  enable row level security;

-- Helper: is the user in this couple?
create or replace function is_couple_member(target_couple_id uuid)
returns boolean language sql security definer
set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and couple_id = target_couple_id
  );
$$;

-- Profiles: users can read their own couple's profiles
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or couple_id in (
    select couple_id from profiles where id = auth.uid()
  ));
create policy "profiles_update" on profiles for update using (id = auth.uid());

-- Couples: members can read their couple
create policy "couples_select" on couples for select
  using (is_couple_member(id));
create policy "couples_insert" on couples for insert
  with check (true);

-- Generic couple-scoped policies
do $$ declare tbl text; begin
  foreach tbl in array array[
    'availability', 'countdowns', 'events',
    'vault_items', 'ledger_entries', 'savings_pots', 'sounding_board'
  ] loop
    execute format(
      'create policy %I on %I for all using (is_couple_member(couple_id))',
      tbl || '_all', tbl
    );
  end loop;
end $$;

-- ── Security-definer RPCs (bypass RLS, auth.uid() always works) ──────────────

-- Returns a profile row by user id
create or replace function get_my_profile(p_user_id uuid)
returns json language plpgsql security definer
set search_path = public as $$
begin
  -- SECURITY: callers may only read their own profile.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  return (
    select row_to_json(p)
    from (
      select id, couple_id, display_name, avatar_url, current_mood
      from profiles
      where id = p_user_id
    ) p
  );
end;
$$;

-- Returns my profile + partner profile in one round trip
create or replace function get_session_data(p_user_id uuid)
returns json language plpgsql security definer
set search_path = public as $$
declare
  v_couple_id uuid;
  v_me        json;
  v_partner   json;
begin
  -- SECURITY: callers may only read their own session.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  select row_to_json(p) into v_me
  from (
    select id, couple_id, display_name, avatar_url, accent_color
    from profiles where id = p_user_id
  ) p;

  select couple_id into v_couple_id from profiles where id = p_user_id;

  if v_couple_id is not null then
    select row_to_json(p) into v_partner
    from (
      select id, couple_id, display_name, avatar_url, accent_color
      from profiles
      where couple_id = v_couple_id and id != p_user_id
      limit 1
    ) p;
  end if;

  return json_build_object('me', v_me, 'partner', v_partner);
end;
$$;

-- Updates mood for a user (security definer bypasses RLS)
create or replace function update_my_mood(p_user_id uuid, p_mood int)
returns void language plpgsql security definer
set search_path = public as $$
begin
  -- SECURITY: callers may only update their own mood.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set current_mood = p_mood where id = p_user_id;
end;
$$;

-- Creates a couple and links the given user to it; returns the invite code
create or replace function create_couple_for_user(p_user_id uuid)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_couple_id uuid;
  v_code      text;
begin
  -- SECURITY: callers may only create a couple for themselves.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  -- Self-healing: ensure the profile exists so the couple link can't no-op.
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
  insert into couples default values
  returning id, invite_code into v_couple_id, v_code;

  update profiles set couple_id = v_couple_id where id = p_user_id;

  return v_code;
end;
$$;

-- Joins an existing couple by invite code; returns 'ok' or 'not_found'
create or replace function join_couple_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_couple_id uuid;
begin
  -- SECURITY: callers may only join a couple as themselves.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  -- Self-healing: ensure the profile exists so the couple link can't no-op.
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
  select id into v_couple_id from couples where invite_code = p_code;
  if not found then return 'not_found'; end if;

  update profiles set couple_id = v_couple_id where id = p_user_id;
  return 'ok';
end;
$$;

-- Updates a user's display name
create or replace function update_my_display_name(p_user_id uuid, p_name text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  -- SECURITY: callers may only rename themselves.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set display_name = p_name where id = p_user_id;
end;
$$;

-- Leaves the current couple (clears the user's couple link). The couple and its
-- data remain for the partner.
create or replace function leave_couple_for_user(p_user_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  -- SECURITY: callers may only remove themselves from a couple.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set couple_id = null where id = p_user_id;
end;
$$;

-- ── Vault Folders ─────────────────────────────────────────────────────────────
-- Run this block to upgrade the vault to the folder system.

create table if not exists vault_folders (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  name        text not null,
  emoji       text not null default '📁',
  kind        text not null default 'general' check (kind in ('date_idea', 'wishlist', 'general')),
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

alter table vault_folders enable row level security;

create policy "vault_folders_all" on vault_folders
  for all using (is_couple_member(couple_id));

-- Add missing columns to vault_items
alter table vault_items add column if not exists folder_id    uuid references vault_folders(id) on delete cascade;
alter table vault_items add column if not exists notes        text;
alter table vault_items add column if not exists price_range  text;
alter table vault_items add column if not exists item_emoji   text;

-- Widen type to include 'general' (for custom folders)
alter table vault_items drop constraint if exists vault_items_type_check;
alter table vault_items add constraint vault_items_type_check
  check (type in ('date_idea', 'wishlist', 'general'));

-- Drop old 'his'/'hers' owner constraint — owner now stores 'shared' or a profile UUID
alter table vault_items drop constraint if exists vault_items_owner_check;

-- ── Migration: seed default folders + link existing items ─────────────────────
-- Run once to migrate existing data. Safe to re-run (on conflict do nothing).

do $$
declare
  c record;
  date_folder_id uuid;
  wish_folder_id uuid;
begin
  for c in
    select distinct couple_id, min(created_by) as created_by
    from vault_items
    group by couple_id
  loop
    if not exists (select 1 from vault_folders where couple_id = c.couple_id) then
      insert into vault_folders (couple_id, created_by, name, emoji, kind, is_default, sort_order)
      values
        (c.couple_id, c.created_by, 'date ideas', '🌹', 'date_idea', true, 0),
        (c.couple_id, c.created_by, 'wishlist',   '🎁', 'wishlist',  true, 1);
    end if;

    select id into date_folder_id from vault_folders
      where couple_id = c.couple_id and kind = 'date_idea' limit 1;
    select id into wish_folder_id from vault_folders
      where couple_id = c.couple_id and kind = 'wishlist'  limit 1;

    update vault_items set folder_id = date_folder_id
      where couple_id = c.couple_id and type = 'date_idea' and folder_id is null;
    update vault_items set folder_id = wish_folder_id
      where couple_id = c.couple_id and type = 'wishlist'  and folder_id is null;
  end loop;
end $$;

-- ── Pot Folders (Savings pot organisation) ────────────────────────────────────
-- Run this block to add the folder system to savings pots.

create table if not exists pot_folders (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  name        text not null,
  emoji       text not null default '🫙',
  is_default  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

alter table pot_folders enable row level security;

create policy "pot_folders_all" on pot_folders
  for all using (is_couple_member(couple_id));

-- savings_pots needs created_by (referenced by the client) + folder_id
alter table savings_pots add column if not exists created_by uuid references profiles(id);
alter table savings_pots add column if not exists folder_id  uuid references pot_folders(id) on delete cascade;

-- Migration: seed a default folder per couple + link existing pots
do $$
declare
  c record;
  v_folder_id uuid;
  v_creator   uuid;
begin
  for c in select distinct couple_id from savings_pots loop
    select id into v_creator from profiles where couple_id = c.couple_id limit 1;

    if not exists (select 1 from pot_folders where couple_id = c.couple_id) then
      insert into pot_folders (couple_id, created_by, name, emoji, is_default, sort_order)
      values (c.couple_id, v_creator, 'savings', '🫙', true, 0);
    end if;

    select id into v_folder_id from pot_folders
      where couple_id = c.couple_id and is_default limit 1;

    update savings_pots set folder_id = v_folder_id
      where couple_id = c.couple_id and folder_id is null;
  end loop;
end $$;

-- ── Ledger enhancements: categories, recurrence, pot targets/currency ─────────

alter table ledger_entries add column if not exists category   text;
alter table ledger_entries add column if not exists recurrence text not null default 'none'
  check (recurrence in ('none', 'weekly', 'monthly'));
alter table ledger_entries add column if not exists settled_at timestamptz; -- groups a settle-up batch into one receipt

alter table savings_pots add column if not exists target_date date;
alter table savings_pots add column if not exists currency    text not null default '£';

-- ── Couple-level default currency (expenses + new pots) ───────────────────────
alter table couples add column if not exists currency text not null default '£';

-- Banner focal point (vertical crop %) for the collapsed home header.
alter table couples add column if not exists banner_focus int not null default 50;

create or replace function update_couple_banner_focus(p_couple_id uuid, p_user_id uuid, p_focus int)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  update couples set banner_focus = greatest(0, least(100, p_focus)) where id = p_couple_id;
end; $$;

create or replace function update_couple_currency(p_couple_id uuid, p_user_id uuid, p_currency text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  update couples set currency = p_currency where id = p_couple_id;
end; $$;

-- ── Storage buckets ───────────────────────────────────────────────────────────
-- Run this block so vault photo uploads work (avatars/banners already exist).
-- Creates the public "vault" bucket and policies allowing any authenticated user
-- to upload/read/update/delete. (App scopes paths by couple id at write time.)

insert into storage.buckets (id, name, public)
values ('vault', 'vault', true)
on conflict (id) do update set public = true;

drop policy if exists "vault_read"   on storage.objects;
drop policy if exists "vault_insert" on storage.objects;
drop policy if exists "vault_update" on storage.objects;
drop policy if exists "vault_delete" on storage.objects;

create policy "vault_read" on storage.objects
  for select using (bucket_id = 'vault');

create policy "vault_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'vault');

create policy "vault_update" on storage.objects
  for update to authenticated using (bucket_id = 'vault');

create policy "vault_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'vault');

-- ════════════════════════════════════════════════════════════════════════════
-- PRODUCTION REALITY CAPTURE (2026-06-02)
-- Captured from the live DB to close schema drift (APP_REVIEW item #2). The
-- blocks above were the historical migration record; the statements below
-- reconcile this file with what actually exists in production.
-- ════════════════════════════════════════════════════════════════════════════

-- Real columns added over time to profiles / couples (idempotent).
alter table profiles add column if not exists current_mood    integer;
alter table profiles add column if not exists mood_updated_at  timestamptz;
alter table profiles add column if not exists activity_at      jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists accent_color     text default 'sage';
alter table profiles add column if not exists role             text; -- legacy, unused by the app

alter table couples  add column if not exists shared_note text;
alter table couples  add column if not exists started_at  date;
alter table couples  add column if not exists banner_url  text;
-- couples.currency added above.

-- Web-push subscriptions (one row per device). Push functions live in push_fix.sql.
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;

-- NOTE — security definer functions NOT used by the app (legacy; superseded by
-- direct table access + RLS). They are unhardened (no auth.uid() guard). Because
-- they are unreachable from the client UI and couple ids are unguessable UUIDs,
-- risk is low — but consider DROPPING them to shrink attack surface:
--   add_countdown, add_event, add_ledger_entry, add_savings_pot,
--   add_vault_item(x2), contribute_to_pot, delete_countdown, delete_event,
--   delete_savings_pot, delete_vault_item, settle_all, update_vault_item(x2),
--   update_vault_stage, update_my_role, my_couple_id,
--   save_push_subscription(p_user_id, p_endpoint, p_p256dh, p_auth)  -- old 4-arg overload
-- See APP_REVIEW item #20.

-- NOTE — legacy TABLES not used by the current app (safe to ignore / drop later):
--   expenses, mood_checkins, mood_reveal, notes, tasks
-- (The app uses ledger_entries, profiles.current_mood, couples.shared_note, etc.)
