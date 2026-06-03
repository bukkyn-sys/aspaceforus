-- ════════════════════════════════════════════════════════════════════════════
-- Tighten storage WRITES to the caller's own folder (defence-in-depth).
--
-- Today insert/update/delete only check bucket_id, so any authenticated user
-- could write to / overwrite any path. This scopes writes:
--   avatars  -> your own user folder   (<user_id>/...)              [starts with auth.uid()]
--   banners  -> your couple folder     (<couple_id>/...)            [shared banner]
--   vault    -> your couple + user dir (<couple_id>/<user_id>/...)  [per-user within the couple]
--
-- READS stay broad (a couple-scoped read policy previously blocked
-- createSignedUrl; privacy holds because paths are unguessable UUIDs that only
-- appear behind table RLS). This file only touches WRITE policies, so signed-URL
-- reads of existing objects (incl. old vault/<couple_id>/<file> paths) are
-- unaffected. New vault uploads go to vault/<couple_id>/<user_id>/<file>.
--
-- ⚠️ TEST AFTER RUNNING: upload a new avatar, banner, and vault photo. The app
-- writes to <user_id>/…, <couple_id>/…, and <couple_id>/<user_id>/… so these
-- should all still work. If any upload fails, run the REVERT block at the bottom.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists "storage_insert" on storage.objects;
drop policy if exists "storage_update" on storage.objects;
drop policy if exists "storage_delete" on storage.objects;
-- (idempotent: also drop the earlier draft policy names if this is re-run)
drop policy if exists "couple_media_insert" on storage.objects;
drop policy if exists "couple_media_update" on storage.objects;
drop policy if exists "couple_media_delete" on storage.objects;

-- AVATARS: only your own folder — path starts with auth.uid().
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- BANNERS: your couple's folder (the banner is shared, so couple-level is correct).
create policy "banners_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "banners_update" on storage.objects for update to authenticated
  using      (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "banners_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));

-- VAULT: scoped to vault/<couple_id>/<user_id>/… — path[1] is the couple,
-- path[2] is the uploading user (auth.uid()).
create policy "vault_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault'
    and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid())
    and (storage.foldername(name))[2] = auth.uid()::text);
create policy "vault_update" on storage.objects for update to authenticated
  using      (bucket_id = 'vault'
    and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid())
    and (storage.foldername(name))[2] = auth.uid()::text);
create policy "vault_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'vault'
    and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid())
    and (storage.foldername(name))[2] = auth.uid()::text);

-- ── REVERT (run only if uploads break) ──────────────────────────────────────
-- drop policy if exists "avatars_insert" on storage.objects;
-- drop policy if exists "avatars_update" on storage.objects;
-- drop policy if exists "avatars_delete" on storage.objects;
-- drop policy if exists "banners_insert" on storage.objects;
-- drop policy if exists "banners_update" on storage.objects;
-- drop policy if exists "banners_delete" on storage.objects;
-- drop policy if exists "vault_insert" on storage.objects;
-- drop policy if exists "vault_update" on storage.objects;
-- drop policy if exists "vault_delete" on storage.objects;
-- create policy "storage_insert" on storage.objects for insert to authenticated with check (bucket_id in ('avatars','banners','vault'));
-- create policy "storage_update" on storage.objects for update to authenticated using (bucket_id in ('avatars','banners','vault'));
-- create policy "storage_delete" on storage.objects for delete to authenticated using (bucket_id in ('avatars','banners','vault'));
