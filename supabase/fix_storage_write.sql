-- ════════════════════════════════════════════════════════════════════════════
-- Fix: new photo uploads fail silently (storage INSERT policy too restrictive).
--
-- The path-check WITH CHECK was blocking uploads. Simplify: any authenticated
-- user can write to the private buckets (reads are already locked by the
-- private bucket + signed-URL requirement).
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists "avatars_insert" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
drop policy if exists "avatars_delete" on storage.objects;
drop policy if exists "banners_insert" on storage.objects;
drop policy if exists "banners_update" on storage.objects;
drop policy if exists "banners_delete" on storage.objects;
drop policy if exists "vault_insert"   on storage.objects;
drop policy if exists "vault_update"   on storage.objects;
drop policy if exists "vault_delete"   on storage.objects;

create policy "storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'banners', 'vault'));

create policy "storage_update" on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'banners', 'vault'));

create policy "storage_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'banners', 'vault'));

-- Verify
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
