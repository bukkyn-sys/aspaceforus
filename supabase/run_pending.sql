-- ════════════════════════════════════════════════════════════════════════════
-- CONSOLIDATED PENDING MIGRATIONS — run this once, top to bottom.
-- Bundles, in dependency order:
--   1. vault_albums.sql            — albums + photo archived_at (retention)
--   2. photo_fav_and_plan_block.sql— photo favourites + clear_couple_availability
--   3. realtime_vault.sql          — live photo/to-do updates
--   4. events_countdowns_merge.sql — countdowns → events (one concept)
-- Every block is idempotent / re-runnable. Supabase runs the whole script as one
-- transaction, so if anything fails nothing is left half-applied.
-- Requires the base vault_photos table to already exist.
-- ════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. ALBUMS + PHOTO RETENTION (archived_at)                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table if not exists vault_albums (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz default now()
);

alter table vault_albums enable row level security;
drop policy if exists vault_albums_all on vault_albums;
create policy vault_albums_all on vault_albums for all using (is_couple_member(couple_id));

-- album_id FK + retention column on photos.
alter table vault_photos add column if not exists archived_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vault_photos_album_fk') then
    alter table vault_photos add constraint vault_photos_album_fk
      foreign key (album_id) references vault_albums(id) on delete set null;
  end if;
end $$;

-- leave_couple_for_user — also archive the couple's photos (privacy on partner change).
create or replace function leave_couple_for_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple  uuid;
  v_partner uuid;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;

  select couple_id into v_couple from profiles where id = p_user_id;

  if v_couple is not null then
    select id into v_partner from profiles where couple_id = v_couple and id <> p_user_id limit 1;

    if v_partner is not null then
      update vault_items set created_by = v_partner where couple_id = v_couple and created_by = p_user_id;
      update events set created_by = v_partner where couple_id = v_couple and created_by = p_user_id;
    end if;

    update daily_moments set archived_at = now() where couple_id = v_couple and archived_at is null;
    update vault_photos  set archived_at = now() where couple_id = v_couple and archived_at is null;
  end if;

  update profiles set couple_id = null where id = p_user_id;
end; $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. PHOTO FAVOURITES + PLAN-FREE-TIME BLOCKING                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
alter table vault_photos add column if not exists favorite boolean not null default false;

create or replace function clear_couple_availability(p_couple_id uuid, p_date date, p_part text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  delete from availability where couple_id = p_couple_id and date = p_date and part = p_part;
end; $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. REALTIME — add the new vault tables to the publication                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
do $$
declare t text;
begin
  foreach t in array array['vault_photos','vault_todos','vault_todo_lists','vault_albums'] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t)
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. AMALGAMATE COUNTDOWNS INTO EVENTS (one concept, labelled "events")     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- get_home_data: the home "events" module now reads from `events` (returned under
-- the existing `countdowns` key, shaped with target_date/end_date so the client's
-- days-until badge keeps working untouched).
create or replace function get_home_data(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid; v_partner uuid; v_today date := current_date;
  v_day_key date := (current_timestamp - interval '4 hours')::date;
  v_me json; v_partner_j json; v_couple_j json; v_countdowns json; v_events json;
  v_free json; v_balance numeric; v_pots json; v_action json; v_daily jsonb;
  v_priority_list uuid; v_priority json;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'forbidden'; end if;
  select couple_id into v_couple from profiles where id = p_user_id;
  if v_couple is null then return json_build_object('me', null, 'partner', null, 'couple', null); end if;
  select id into v_partner from profiles where couple_id = v_couple and id <> p_user_id limit 1;

  select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
    into v_me from profiles where id = p_user_id;
  if v_partner is not null then
    select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
      into v_partner_j from profiles where id = v_partner;
  end if;

  select json_build_object('shared_note', shared_note, 'started_at', started_at, 'invite_code', invite_code,
    'banner_url', banner_url, 'banner_focus', banner_focus, 'currency', coalesce(currency,'£'),
    'dashboard_layout', dashboard_layout)
    into v_couple_j from couples where id = v_couple;

  -- Home "events" module: every upcoming event (calendar events ARE the
  -- countdowns now), soonest first. Ongoing multi-day events stay until they end.
  select coalesce(json_agg(row_to_json(c) order by c.target_date), '[]'::json) into v_countdowns
  from (
    select id, title,
           start_at::date as target_date,
           case when end_at is not null then end_at::date else null end as end_date,
           emoji, created_by
    from events
    where couple_id = v_couple
      and coalesce(end_at, start_at)::date >= v_today
    order by start_at
  ) c;

  select coalesce(json_agg(row_to_json(e) order by e.start_at), '[]'::json) into v_events
  from (select id, title, start_at, end_at, emoji, created_by from events
        where couple_id = v_couple and start_at >= v_today and start_at < v_today + interval '30 days') e;

  select coalesce(json_agg(json_build_object('date', g.d, 'parts', g.parts) order by g.d), '[]'::json) into v_free
  from (
    select dp.d, array_agg(dp.prt order by dp.ord) as parts
    from (
      select a.date as d, a.part as prt,
             case a.part when 'morning' then 1 when 'afternoon' then 2 when 'evening' then 3 else 4 end as ord
      from availability a
      where a.couple_id = v_couple and a.date >= v_today and a.date <= v_today + 60
      group by a.date, a.part having count(distinct a.user_id) = 2
    ) dp group by dp.d order by dp.d limit 3
  ) g;

  select coalesce(sum(case when paid_by = p_user_id then amount * (1 - coalesce(split_ratio,0.5))
         else - (amount * coalesce(split_ratio,0.5)) end), 0) into v_balance
  from ledger_entries where couple_id = v_couple and settled = false;

  select coalesce(json_agg(json_build_object('id', id, 'title', title,
    'saved', coalesce(his_amount,0)+coalesce(hers_amount,0), 'goal', goal_amount,
    'currency', coalesce(currency,'£'),
    'progress', case when goal_amount > 0
      then least(100, round(((coalesce(his_amount,0)+coalesce(hers_amount,0)) / goal_amount) * 100)) else 0 end
  ) order by created_at desc), '[]'::json) into v_pots
  from savings_pots where couple_id = v_couple;

  if v_partner is not null then
    select row_to_json(x) into v_action from (
      select text, at from (
        (select e.created_at as at, 'added to the calendar'::text as text from events e
           where e.couple_id = v_couple and e.created_by = v_partner order by e.created_at desc limit 1)
        union all
        (select a.created_at, 'updated their calendar'::text from availability a
           where a.couple_id = v_couple and a.user_id = v_partner order by a.created_at desc limit 1)
        union all
        (select vi.created_at, (case when vi.type='wishlist' then 'added to the wishlist' else 'added to date ideas' end)::text
           from vault_items vi where vi.couple_id = v_couple and vi.created_by = v_partner order by vi.created_at desc limit 1)
        union all
        (select le.created_at, 'logged an expense'::text from ledger_entries le
           where le.couple_id = v_couple and le.paid_by = v_partner order by le.created_at desc limit 1)
        union all
        (select p.mood_updated_at, 'updated their mood'::text from profiles p
           where p.id = v_partner and p.mood_updated_at is not null)
      ) cand where at is not null order by at desc limit 1
    ) x;
  end if;

  v_daily := daily_build(v_couple, v_partner, p_user_id, v_day_key);

  select priority_todo_list_id into v_priority_list from couples where id = v_couple;
  if v_priority_list is not null then
    select json_build_object('list_id', tl.id, 'title', tl.title, 'emoji', tl.emoji,
      'remaining', (select count(*) from vault_todos where list_id = tl.id and done = false),
      'items', coalesce((
        select json_agg(json_build_object('id', t.id, 'title', t.title, 'due_date', t.due_date, 'assignee', t.assignee) order by t.created_at)
        from (select id, title, due_date, assignee, created_at from vault_todos
              where list_id = tl.id and done = false order by created_at limit 6) t), '[]'::json)
    ) into v_priority from vault_todo_lists tl where tl.id = v_priority_list;
  end if;

  return json_build_object('me', v_me, 'partner', v_partner_j, 'couple', v_couple_j,
    'countdowns', coalesce(v_countdowns,'[]'::json), 'events', coalesce(v_events,'[]'::json),
    'free_days', coalesce(v_free,'[]'::json), 'balance', coalesce(v_balance,0),
    'pots', coalesce(v_pots,'[]'::json), 'partner_action', v_action, 'daily', v_daily,
    'priority_todo', v_priority);
end; $$;

-- Migrate countdowns → events, then drop the retired table.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'countdowns') then
    -- Carry every (non-archived) countdown over as an all-day event. The noon
    -- anchor matches how the calendar already stores all-day events, so local-date
    -- placement is stable across timezones; an end_date becomes an inclusive span.
    insert into events (couple_id, created_by, title, start_at, end_at, emoji, all_day)
    select couple_id, created_by, title,
           (target_date::timestamp + interval '12 hours'),
           case when end_date is not null then (end_date::timestamp + interval '12 hours') else null end,
           coalesce(emoji, '📅'), true
    from countdowns
    where coalesce(archived, false) = false;

    drop table countdowns cascade;
  end if;
end $$;
