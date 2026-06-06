-- ════════════════════════════════════════════════════════════════════════════
-- Vault overhaul — Photos (private shared photo wall).
--
-- A private masonry wall of the couple's photos. Stored in a PRIVATE bucket and
-- served via signed URLs. width/height are kept so the masonry lays out without
-- reflow. album_id is reserved for Phase 5 (albums); null = unsorted (always on
-- the wall).
--
-- Idempotent / re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists vault_photos (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  album_id    uuid,                       -- Phase 5; null = unsorted / all
  path        text not null,              -- object path in the private 'photos' bucket
  width       int not null default 0,
  height      int not null default 0,
  caption     text,
  created_at  timestamptz default now()
);

create index if not exists vault_photos_couple_idx on vault_photos (couple_id, created_at desc);

alter table vault_photos enable row level security;
drop policy if exists vault_photos_all on vault_photos;
create policy vault_photos_all on vault_photos for all using (is_couple_member(couple_id));

-- ── Private storage bucket + couple-scoped policies ──────────────────────────
-- Paths are {couple_id}/{uuid}.{ext}; the first folder segment is the couple id.
-- is_couple_member() is SECURITY DEFINER so it is safe inside storage policies
-- (an inline profiles sub-query here would trip RLS and break uploads).
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

drop policy if exists "photos_select" on storage.objects;
drop policy if exists "photos_insert" on storage.objects;
drop policy if exists "photos_update" on storage.objects;
drop policy if exists "photos_delete" on storage.objects;

create policy "photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and is_couple_member((storage.foldername(name))[1]::uuid));
create policy "photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and is_couple_member((storage.foldername(name))[1]::uuid));
create policy "photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and is_couple_member((storage.foldername(name))[1]::uuid));
create policy "photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and is_couple_member((storage.foldername(name))[1]::uuid));
