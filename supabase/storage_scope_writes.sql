-- ════════════════════════════════════════════════════════════════════════════
-- Tighten storage WRITES to the caller's own folder (defence-in-depth).  [v2]
--
-- v1 used an inline sub-query `(select couple_id from profiles where id =
-- auth.uid())` inside the storage policy. That is a NON-security-definer read of
-- `profiles`, which trips RLS evaluation in the storage context and BROKE banner
-- uploads. v2 instead reuses the existing, proven SECURITY DEFINER helper
-- `is_couple_member(uuid)` (it bypasses profiles RLS), which avoids the issue.
--
--   avatars  -> your own user folder   (<user_id>/...)              [path starts with auth.uid()]
--   banners  -> a couple you belong to (<couple_id>/...)            [is_couple_member(path[1])]
--   vault    -> your dir in your couple (<couple_id>/<user_id>/...) [is_couple_member(path[1]) + path[2]=auth.uid()]
--
-- READS are untouched (broad storage_read + signed URLs); existing objects,
-- including legacy vault/<couple_id>/<file> paths, stay readable.
--
-- ⚠️ STATUS: NOT applied in production. Beta runs on the permissive write policy.
-- Before applying: deploy to a Vercel PREVIEW, run this there, and upload a new
-- AVATAR, BANNER, and VAULT photo. Only promote if all three succeed. The REVERT
-- block at the bottom restores the permissive policy if anything fails.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists "storage_insert" on storage.objects;
drop policy if exists "storage_update" on storage.objects;
drop policy if exists "storage_delete" on storage.objects;
-- idempotent: drop any earlier-draft policy names too
drop policy if exists "couple_media_insert" on storage.objects;
drop policy if exists "couple_media_update" on storage.objects;
drop policy if exists "couple_media_delete" on storage.objects;
drop policy if exists "avatars_insert" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
drop policy if exists "avatars_delete" on storage.objects;
drop policy if exists "banners_insert" on storage.objects;
drop policy if exists "banners_update" on storage.objects;
drop policy if exists "banners_delete" on storage.objects;
drop policy if exists "vault_insert" on storage.objects;
drop policy if exists "vault_update" on storage.objects;
drop policy if exists "vault_delete" on storage.objects;

-- AVATARS: only your own folder — path starts with auth.uid().
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- BANNERS: a couple you belong to (banner is shared, so couple-level is correct).
create policy "banners_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and is_couple_member(((storage.foldername(name))[1])::uuid));
create policy "banners_update" on storage.objects for update to authenticated
  using      (bucket_id = 'banners' and is_couple_member(((storage.foldername(name))[1])::uuid));
create policy "banners_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'banners' and is_couple_member(((storage.foldername(name))[1])::uuid));

-- VAULT: vault/<couple_id>/<user_id>/… — couple you belong to, your own subfolder.
create policy "vault_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault'
    and is_couple_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);
create policy "vault_update" on storage.objects for update to authenticated
  using      (bucket_id = 'vault'
    and is_couple_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);
create policy "vault_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'vault'
    and is_couple_member(((storage.foldername(name))[1])::uuid)
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
