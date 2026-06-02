-- ════════════════════════════════════════════════════════════════════════════
-- Fix: display name / avatar don't stick from onboarding.
--
-- Root cause: update_my_display_name / update_my_accent_color / update_my_avatar
-- do a bare UPDATE. If handle_new_user hasn't created the profile row yet (it
-- can fire after the onboarding RPCs in some cases), the UPDATE matches 0 rows
-- and the data is silently lost.
--
-- Fix: change all three to UPSERT so the profile row is created if missing.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function update_my_display_name(p_user_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id, display_name)
    values (p_user_id, p_name)
    on conflict (id) do update set display_name = excluded.display_name;
end; $$;

create or replace function update_my_accent_color(p_user_id uuid, p_color text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id, accent_color)
    values (p_user_id, p_color)
    on conflict (id) do update set accent_color = excluded.accent_color;
end; $$;

create or replace function update_my_avatar(p_user_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id, avatar_url)
    values (p_user_id, p_url)
    on conflict (id) do update set avatar_url = excluded.avatar_url;
end; $$;
