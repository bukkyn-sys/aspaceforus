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

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
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
returns boolean language sql security definer as $$
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
