-- ════════════════════════════════════════════════════════════════════════════
-- (1) Photo favourites — a couple-shared "loved" flag on a photo.
-- (2) Planning an event from a free window blocks that slot for BOTH partners
--     (clear_couple_availability deletes both members' free mark for a date+part).
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

alter table vault_photos add column if not exists favorite boolean not null default false;

create or replace function clear_couple_availability(p_couple_id uuid, p_date date, p_part text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  delete from availability where couple_id = p_couple_id and date = p_date and part = p_part;
end; $$;
