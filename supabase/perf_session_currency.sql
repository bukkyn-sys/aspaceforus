-- ════════════════════════════════════════════════════════════════════════════
-- PERF: fold the couple's currency into get_session_data so the app layout
-- doesn't need a separate `couples` query on every single page load.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function get_session_data(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_couple_id uuid; v_me json; v_partner json; v_currency text;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  select row_to_json(p) into v_me from (
    select id, couple_id, display_name, avatar_url, accent_color from profiles where id = p_user_id) p;
  select couple_id into v_couple_id from profiles where id = p_user_id;
  if v_couple_id is not null then
    select row_to_json(p) into v_partner from (
      select id, couple_id, display_name, avatar_url, accent_color
      from profiles where couple_id = v_couple_id and id != p_user_id limit 1) p;
    select currency into v_currency from couples where id = v_couple_id;
  end if;
  return json_build_object('me', v_me, 'partner', v_partner, 'currency', coalesce(v_currency, '£'));
end; $$;
