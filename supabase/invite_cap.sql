-- ════════════════════════════════════════════════════════════════════════════
-- C5 — cap a space at 2 people. Run this AFTER the app code that handles a
-- 'full' result is deployed (otherwise a blocked join would mis-route).
-- To allow group spaces later, change the `>= 2` threshold.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function join_couple_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer
set search_path = public as $$
declare v_couple_id uuid; v_count int;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;

  select id into v_couple_id from couples where invite_code = p_code;
  if not found then return 'not_found'; end if;

  -- Already a member of this space → idempotent success.
  if exists (select 1 from profiles where id = p_user_id and couple_id = v_couple_id) then
    return 'ok';
  end if;

  -- A space holds 2 people. (Raise this for group spaces in future.)
  select count(*) into v_count from profiles where couple_id = v_couple_id;
  if v_count >= 2 then return 'full'; end if;

  update profiles set couple_id = v_couple_id where id = p_user_id;
  return 'ok';
end; $$;
