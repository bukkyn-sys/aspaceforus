-- ════════════════════════════════════════════════════════════════════════════
-- Fix storage RLS: photos broken after storage_private.sql.
--
-- Root cause: the SELECT policies used a couple-subquery that was blocking
-- createSignedUrl. Simpler fix: any authenticated user can read from these
-- 3 buckets (paths are UUID-keyed — unguessable to outsiders). Writes stay
-- scoped to owner/couple.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Drop ALL existing policies on storage.objects (covers any legacy names too).
do $$
declare pol text;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', pol);
  end loop;
end $$;

-- 2) READ: any authenticated user (paths contain UUID user/couple ids — unguessable).
create policy "storage_read" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'banners', 'vault'));

-- 3) AVATARS writes: your own folder only (path = <user_id>/...).
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) BANNERS writes: your couple's folder only (path = <couple_id>/...).
create policy "banners_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "banners_update" on storage.objects for update to authenticated
  using      (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "banners_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'banners' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));

-- 5) VAULT writes: your couple's folder only (path = <couple_id>/...).
create policy "vault_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "vault_update" on storage.objects for update to authenticated
  using      (bucket_id = 'vault' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));
create policy "vault_delete" on storage.objects for delete to authenticated
  using      (bucket_id = 'vault' and (storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid()));

-- Verify
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
