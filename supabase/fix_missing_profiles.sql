-- ════════════════════════════════════════════════════════════════════════════
-- FIX MISSING PROFILES — run once in the Supabase SQL editor.
--
-- Root cause of the onboarding "completion loop": some auth.users had no row in
-- public.profiles (the handle_new_user trigger swallows errors with
-- `exception when others then return new`, so a failed insert is silent). With
-- no profile row, create_couple_for_user created a couple and returned an invite
-- code, but its `update profiles set couple_id ... where id = p_user_id` matched
-- 0 rows — so couple_id was never stored and /home bounced back to onboarding.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Backfill a profile for any auth user missing one.
insert into profiles (id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- 2) Make couple creation / join self-healing: ensure the profile row exists
--    before linking, so a missing/late profile can never silently break this.
create or replace function create_couple_for_user(p_user_id uuid)
returns text language plpgsql security definer
set search_path = public as $$
declare v_couple_id uuid; v_code text;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
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
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
  select id into v_couple_id from couples where invite_code = p_code;
  if not found then return 'not_found'; end if;
  update profiles set couple_id = v_couple_id where id = p_user_id;
  return 'ok';
end; $$;

-- 3) (optional cleanup) remove orphan couples that no profile points at.
-- delete from couples c
-- where not exists (select 1 from profiles p where p.couple_id = c.id);
