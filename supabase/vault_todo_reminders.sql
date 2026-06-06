-- ════════════════════════════════════════════════════════════════════════════
-- Vault to-dos — due reminders.
-- last_reminded dedupes the daily cron so a due/overdue item is reminded at most
-- once per day. (The `remind` flag already exists from vault_todos.sql.)
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

alter table vault_todos add column if not exists last_reminded date;
