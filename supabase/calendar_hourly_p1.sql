-- ════════════════════════════════════════════════════════════════════════════
-- Calendar overhaul — Phase 1: timed events.
--
-- events.start_at/end_at are already timestamptz; the old UI pinned everything to
-- noon and rendered by day. Phase 1 unlocks real times in the UI. This migration
-- only adds the all_day flag and backfills existing (noon-pinned) events as
-- all-day so they keep rendering as date-only rather than showing "12:00".
--
-- Idempotent / re-runnable. No availability changes (that's Phase 2).
-- ════════════════════════════════════════════════════════════════════════════

alter table events add column if not exists all_day boolean not null default false;

-- Existing events were always written at T12:00:00 by the old UI → treat them as
-- all-day so they don't suddenly display a spurious time.
update events set all_day = true
  where all_day = false and start_at::time = time '12:00:00';
