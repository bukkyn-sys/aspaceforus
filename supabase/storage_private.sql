-- ════════════════════════════════════════════════════════════════════════════
-- C4 — make avatars / banners / vault buckets PRIVATE + couple-scoped RLS.
--
-- ⚠️⚠️  DO NOT RUN YET.  ⚠️⚠️
-- The app currently stores & renders PUBLIC storage URLs. The moment these
-- buckets go private, every existing public URL returns 403 and ALL images
-- (avatars, banner, vault photos) break. Run this ONLY together with the app
-- change that renders images via signed URLs (or an authenticated media route),
-- and verify on a Vercel PREVIEW deployment first.
--
-- Paths today: avatars = <user_id>/...,  banners = <couple_id>/...,  vault = <couple_id>/...
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Flip buckets to private
update storage.buckets set public = false where id in ('avatars', 'banners', 'vault');

-- 2) Replace the over-permissive policies with couple/owner-scoped ones.
drop policy if exists "vault_read"   on storage.objects;
drop policy if exists "vault_insert" on storage.objects;
drop policy if exists "vault_update" on storage.objects;
drop policy if exists "vault_delete" on storage.objects;

-- VAULT + BANNERS: object lives under the couple's id; only that couple can touch it.
create policy "vault_couple_all" on storage.objects for all to authenticated
  using      (bucket_id = 'vault'  and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()))
  with check (bucket_id = 'vault'  and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));

create policy "banners_couple_all" on storage.objects for all to authenticated
  using      (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()))
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));

-- AVATARS: you write only your own folder; you + your partner can read both.
create policy "avatars_owner_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_couple_read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] in (
    select id::text from profiles where couple_id = (select couple_id from profiles where id = auth.uid())
    union select auth.uid()::text));
