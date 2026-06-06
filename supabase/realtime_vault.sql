-- ════════════════════════════════════════════════════════════════════════════
-- Add the new vault tables to the realtime publication so postgres_changes fires
-- (live photo/to-do updates without leaving and re-entering the vault).
-- Idempotent — skips tables already in the publication.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['vault_photos','vault_todos','vault_todo_lists','vault_albums'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
