-- Banner focal point (vertical crop %) for the collapsed home header.
-- Run once in the Supabase SQL editor.

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
