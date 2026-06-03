-- ════════════════════════════════════════════════════════════════════════════
-- Tighten storage WRITES to the caller's own folder (defence-in-depth).
--
-- Today insert/update/delete only check bucket_id, so any authenticated user
-- could write to / overwrite any path. This scopes writes:
--   avatars  -> your own user folder  (<user_id>/...)
--   banners  -> your couple folder    (<couple_id>/...)
--   vault    -> your couple folder    (<couple_id>/...)
-- READS stay broad (a couple-scoped read policy previously blocked
-- createSignedUrl; privacy holds because paths are unguessable UUIDs that only
-- appear behind table RLS).
--
-- ⚠️ TEST AFTER RUNNING: upload a new avatar, a banner, and a vault photo. The
-- app uploads to <user_id>/… and <couple_id>/… so these should all still work.
-- If any upload fails, run the REVERT block at the bottom to restore the
-- permissive policies, and tell me.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists "storage_insert" on storage.objects;
drop policy if exists "storage_update" on storage.objects;
drop policy if exists "storage_delete" on storage.objects;

-- AVATARS: only your own folder.
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- BANNERS + VAULT: only your couple's folder.
create policy "couple_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('banners','vault') and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "couple_media_update" on storage.objects for update to authenticated
  using      (bucket_id in ('banners','vault') and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "couple_media_delete" on storage.objects for delete to authenticated
  using      (bucket_id in ('banners','vault') and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));

-- ── REVERT (run only if uploads break) ──────────────────────────────────────
-- drop policy if exists "avatars_insert" on storage.objects;
-- drop policy if exists "avatars_update" on storage.objects;
-- drop policy if exists "avatars_delete" on storage.objects;
-- drop policy if exists "couple_media_insert" on storage.objects;
-- drop policy if exists "couple_media_update" on storage.objects;
-- drop policy if exists "couple_media_delete" on storage.objects;
-- create policy "storage_insert" on storage.objects for insert to authenticated with check (bucket_id in ('avatars','banners','vault'));
-- create policy "storage_update" on storage.objects for update to authenticated using (bucket_id in ('avatars','banners','vault'));
-- create policy "storage_delete" on storage.objects for delete to authenticated using (bucket_id in ('avatars','banners','vault'));
