-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING PATCH — run once in the Supabase SQL editor.
-- Fixes APP_REVIEW item #1 (IDOR): security-definer RPCs trusted a client-supplied
-- p_user_id instead of auth.uid(), letting any logged-in user act as anyone.
--
-- Every function below is re-created to (a) assert the caller is who they claim
-- (p_user_id = auth.uid()) and (b) pin search_path. Signatures are unchanged, so
-- NO application/server-action code needs to change.
--
-- SAFE TO RE-RUN. Idempotent (create or replace).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Functions whose source lives in supabase/schema.sql ─────────────────────

create or replace function get_my_profile(p_user_id uuid)
returns json language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  return (
    select row_to_json(p)
    from (
      select id, couple_id, display_name, avatar_url, current_mood
      from profiles where id = p_user_id
    ) p
  );
end; $$;

create or replace function get_session_data(p_user_id uuid)
returns json language plpgsql security definer
set search_path = public as $$
declare
  v_couple_id uuid;
  v_me        json;
  v_partner   json;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  select row_to_json(p) into v_me
  from (select id, couple_id, display_name, avatar_url, accent_color
        from profiles where id = p_user_id) p;
  select couple_id into v_couple_id from profiles where id = p_user_id;
  if v_couple_id is not null then
    select row_to_json(p) into v_partner
    from (select id, couple_id, display_name, avatar_url, accent_color
          from profiles where couple_id = v_couple_id and id != p_user_id limit 1) p;
  end if;
  return json_build_object('me', v_me, 'partner', v_partner);
end; $$;

create or replace function update_my_mood(p_user_id uuid, p_mood int)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set current_mood = p_mood where id = p_user_id;
end; $$;

create or replace function create_couple_for_user(p_user_id uuid)
returns text language plpgsql security definer
set search_path = public as $$
declare v_couple_id uuid; v_code text;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into couples default values returning id, invite_code into v_couple_id, v_code;
  update profiles set couple_id = v_couple_id where id = p_user_id;
  return v_code;
end; $$;

create or replace function join_couple_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer
set search_path = public as $$
declare v_couple_id uuid;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  select id into v_couple_id from couples where invite_code = p_code;
  if not found then return 'not_found'; end if;
  update profiles set couple_id = v_couple_id where id = p_user_id;
  return 'ok';
end; $$;

create or replace function update_my_display_name(p_user_id uuid, p_name text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set display_name = p_name where id = p_user_id;
end; $$;

create or replace function leave_couple_for_user(p_user_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set couple_id = null where id = p_user_id;
end; $$;

-- is_couple_member already uses auth.uid(); just pin search_path.
create or replace function is_couple_member(target_couple_id uuid)
returns boolean language sql security definer
set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and couple_id = target_couple_id
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️  DASHBOARD-ONLY FUNCTIONS — source NOT in the repo (APP_REVIEW item #2).
--
-- The functions below are called by the app but were created directly in the
-- Supabase dashboard, so their exact bodies are not in version control. The
-- reconstructions below match the app's usage. BEFORE RUNNING THIS SECTION:
--   1. In Supabase → Database → Functions, click each one and confirm the body
--      matches (especially column names like activity_at / push_subscription).
--   2. If a body differs, paste the real body here and just add the two
--      hardening lines:  set search_path = public   AND the auth.uid() guard.
--
-- If unsure, run ONLY the section above first (that closes the worst holes),
-- then verify+run these one at a time.
-- ════════════════════════════════════════════════════════════════════════════

-- get_partner_profile(p_couple_id, p_my_id) — returns the OTHER member's profile.
-- Guard: caller must be a member of p_couple_id AND p_my_id must be themselves.
-- VERIFY the selected columns (current_mood, mood_updated_at, activity_at) match.
create or replace function get_partner_profile(p_couple_id uuid, p_my_id uuid)
returns json language plpgsql security definer
set search_path = public as $$
begin
  if p_my_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  return (
    select row_to_json(p)
    from (
      select id, couple_id, display_name, avatar_url, accent_color,
             current_mood, mood_updated_at, activity_at
      from profiles
      where couple_id = p_couple_id and id <> p_my_id
      limit 1
    ) p
  );
end; $$;

-- mark_section_activity(p_user_id, p_section) — bumps the caller's activity_at jsonb.
-- VERIFY the activity_at update expression matches your real function.
create or replace function mark_section_activity(p_user_id uuid, p_section text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles
    set activity_at = coalesce(activity_at, '{}'::jsonb)
      || jsonb_build_object(p_section, now()::text)
    where id = p_user_id;
end; $$;

-- save_push_subscription(p_user_id, p_couple_id, p_subscription)
-- VERIFY the target column (push_subscription) matches.
create or replace function save_push_subscription(p_user_id uuid, p_couple_id uuid, p_subscription jsonb)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  update profiles set push_subscription = p_subscription where id = p_user_id;
end; $$;

-- get_partner_push_subscription(p_couple_id, p_my_id) — server-only (push send).
-- Guard: caller must be a member + themselves. VERIFY column name.
create or replace function get_partner_push_subscription(p_couple_id uuid, p_my_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if p_my_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  return (
    select push_subscription from profiles
    where couple_id = p_couple_id and id <> p_my_id and push_subscription is not null
    limit 1
  );
end; $$;

-- update_shared_note(p_couple_id, p_user_id, p_note)
create or replace function update_shared_note(p_couple_id uuid, p_user_id uuid, p_note text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  update couples set shared_note = p_note where id = p_couple_id;
end; $$;

-- update_couple_started_at(p_couple_id, p_user_id, p_date)
create or replace function update_couple_started_at(p_couple_id uuid, p_user_id uuid, p_date date)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  update couples set started_at = p_date where id = p_couple_id;
end; $$;

-- update_couple_currency(p_couple_id, p_user_id, p_currency) — NEW (review item 6).
-- Requires: alter table couples add column if not exists currency text not null default '£';
create or replace function update_couple_currency(p_couple_id uuid, p_user_id uuid, p_currency text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  update couples set currency = p_currency where id = p_couple_id;
end; $$;

-- update_couple_banner(p_couple_id, p_user_id, p_url)
create or replace function update_couple_banner(p_couple_id uuid, p_user_id uuid, p_url text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  update couples set banner_url = p_url where id = p_couple_id;
end; $$;

-- update_my_accent_color(p_user_id, p_color)
create or replace function update_my_accent_color(p_user_id uuid, p_color text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set accent_color = p_color where id = p_user_id;
end; $$;

-- update_my_avatar(p_user_id, p_url)
create or replace function update_my_avatar(p_user_id uuid, p_url text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update profiles set avatar_url = p_url where id = p_user_id;
end; $$;

-- set_availability(p_couple_id, p_user_id, p_date, p_status)
-- VERIFY the upsert/conflict clause matches your real function.
create or replace function set_availability(p_couple_id uuid, p_user_id uuid, p_date date, p_status text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  if p_status is null then
    delete from availability where couple_id = p_couple_id and user_id = p_user_id and date = p_date;
  else
    insert into availability (couple_id, user_id, date, status)
      values (p_couple_id, p_user_id, p_date, p_status)
    on conflict (couple_id, user_id, date) do update set status = excluded.status;
  end if;
end; $$;
