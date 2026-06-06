-- ════════════════════════════════════════════════════════════════════════════
-- Vault Photos — Phase 5: albums + retention-on-leave.
--
-- Albums (boards) are optional grouping; a photo with album_id null is "unsorted"
-- and always shows on the wall. archived_at gives photos the same partner-change
-- privacy as the daily: on leave, the couple's photos are soft-archived so a new
-- partner filling the same slot never sees the previous partner's photos.
--
-- Idempotent. Run after vault_photos.sql.
-- ════════════════════════════════════════════════════════════════════════════

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

-- ── leave_couple_for_user — re-defined to also archive the couple's photos ────
-- (Keeps the existing vault/event reassignment + daily archive.)
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

    -- Intimate shared content → archive so a new partner starts fresh.
    update daily_moments set archived_at = now() where couple_id = v_couple and archived_at is null;
    update vault_photos  set archived_at = now() where couple_id = v_couple and archived_at is null;
  end if;

  update profiles set couple_id = null where id = p_user_id;
end; $$;
