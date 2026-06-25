-- ════════════════════════════════════════════════════════════════════════════
-- Drop legacy, unused tables to shrink the attack/maintenance surface.
--
-- The current app uses: ledger_entries (not `expenses`), profiles.current_mood
-- (not `mood_checkins`/`mood_reveal`), couples.shared_note + note_items (not
-- `notes`), and vault_todos (not `tasks`). These five tables are leftovers from
-- the pre-Supabase / early schema and are not referenced anywhere in the app.
--
-- KEEP note_items — it backs the shared note and IS in active use.
--
-- CASCADE also removes the tables' RLS policies. Verify nothing reads them first
-- (grep the app for each name) — done at time of writing. Safe / idempotent.
-- ════════════════════════════════════════════════════════════════════════════

drop table if exists expenses      cascade;
drop table if exists mood_checkins cascade;
drop table if exists mood_reveal   cascade;
drop table if exists notes         cascade;
drop table if exists tasks         cascade;
