-- ════════════════════════════════════════════════════════════════════════════
-- aspaceforus — CONSOLIDATED DB hardening + migrations
-- Run once, top-to-bottom, in the Supabase SQL editor. Idempotent (safe to re-run).
-- Closes the IDOR (auth.uid guards), fixes push, backfills profiles, adds columns.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Columns the app/RPCs depend on (no-op if already present) ──────────────
alter table couples add column if not exists currency     text not null default '£';
alter table couples add column if not exists banner_focus int  not null default 50;

-- ── 2) IDOR hardening + push fix — every security-definer RPC asserts auth.uid()

create or replace function is_couple_member(target_couple_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and couple_id = target_couple_id);
$$;

create or replace function get_my_profile(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  return (select row_to_json(p) from (
    select id, couple_id, display_name, avatar_url, current_mood
    from profiles where id = p_user_id) p);
end; $$;

create or replace function get_session_data(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_couple_id uuid; v_me json; v_partner json;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  select row_to_json(p) into v_me from (
    select id, couple_id, display_name, avatar_url, accent_color from profiles where id = p_user_id) p;
  select couple_id into v_couple_id from profiles where id = p_user_id;
  if v_couple_id is not null then
    select row_to_json(p) into v_partner from (
      select id, couple_id, display_name, avatar_url, accent_color
      from profiles where couple_id = v_couple_id and id != p_user_id limit 1) p;
  end if;
  return json_build_object('me', v_me, 'partner', v_partner);
end; $$;

create or replace function update_my_mood(p_user_id uuid, p_mood int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set current_mood = p_mood where id = p_user_id;
end; $$;

create or replace function update_my_display_name(p_user_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set display_name = p_name where id = p_user_id;
end; $$;

create or replace function update_my_accent_color(p_user_id uuid, p_color text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set accent_color = p_color where id = p_user_id;
end; $$;

create or replace function update_my_avatar(p_user_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set avatar_url = p_url where id = p_user_id;
end; $$;

create or replace function leave_couple_for_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set couple_id = null where id = p_user_id;
end; $$;

-- create/join: hardened + self-healing (ensure profile row exists before linking)
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

create or replace function join_couple_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_couple_id uuid;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
  select id into v_couple_id from couples where invite_code = p_code;
  if not found then return 'not_found'; end if;
  update profiles set couple_id = v_couple_id where id = p_user_id;
  return 'ok';
end; $$;

create or replace function mark_section_activity(p_user_id uuid, p_section text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set activity_at = coalesce(activity_at, '{}'::jsonb)
    || jsonb_build_object(p_section, now()::text) where id = p_user_id;
end; $$;

create or replace function get_partner_profile(p_couple_id uuid, p_my_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_my_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  return (select row_to_json(p) from (
    select id, couple_id, display_name, avatar_url, accent_color, current_mood, mood_updated_at, activity_at
    from profiles where couple_id = p_couple_id and id <> p_my_id limit 1) p);
end; $$;

create or replace function update_shared_note(p_couple_id uuid, p_user_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  update couples set shared_note = p_note where id = p_couple_id;
end; $$;

create or replace function update_couple_started_at(p_couple_id uuid, p_user_id uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  update couples set started_at = p_date where id = p_couple_id;
end; $$;

create or replace function update_couple_banner(p_couple_id uuid, p_user_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  update couples set banner_url = p_url where id = p_couple_id;
end; $$;

create or replace function update_couple_currency(p_couple_id uuid, p_user_id uuid, p_currency text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  update couples set currency = p_currency where id = p_couple_id;
end; $$;

create or replace function update_couple_banner_focus(p_couple_id uuid, p_user_id uuid, p_focus int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  update couples set banner_focus = greatest(0, least(100, p_focus)) where id = p_couple_id;
end; $$;

create or replace function set_availability(p_couple_id uuid, p_user_id uuid, p_date date, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  if p_status is null then
    delete from availability where couple_id = p_couple_id and user_id = p_user_id and date = p_date;
  else
    insert into availability (couple_id, user_id, date, status)
      values (p_couple_id, p_user_id, p_date, p_status)
    on conflict (couple_id, user_id, date) do update set status = excluded.status;
  end if;
end; $$;

-- push: use the real push_subscriptions table (NOT a profiles column)
create or replace function save_push_subscription(p_user_id uuid, p_couple_id uuid, p_subscription jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (p_user_id, p_subscription->>'endpoint', p_subscription->'keys'->>'p256dh', p_subscription->'keys'->>'auth')
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end; $$;

create or replace function get_partner_push_subscription(p_couple_id uuid, p_my_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_my_id <> auth.uid() or not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  return (select jsonb_build_object('endpoint', ps.endpoint,
            'keys', jsonb_build_object('p256dh', ps.p256dh, 'auth', ps.auth))
    from push_subscriptions ps join profiles pr on pr.id = ps.user_id
    where pr.couple_id = p_couple_id and ps.user_id <> p_my_id
    order by ps.created_at desc nulls last limit 1);
end; $$;

-- ── 3) Backfill a profile for any auth user missing one ───────────────────────
insert into profiles (id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- ── 4) VERIFICATION — should return only legacy/unused functions (or nothing) ──
-- Any function listed here is a SECURITY DEFINER function whose body does NOT
-- reference auth.uid(). handle_new_user is expected (signup trigger). The legacy
-- add_*/delete_*/settle_all/contribute_to_pot/update_my_role/etc. will appear —
-- those are unused by the app and slated to be dropped next. Anything ELSE here
-- is a gap to fix.
select p.proname as unguarded_security_definer_function
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
order by p.proname;
