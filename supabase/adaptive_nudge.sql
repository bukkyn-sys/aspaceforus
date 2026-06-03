-- ════════════════════════════════════════════════════════════════════════════
-- Task 5 — adaptive engagement nudges.
--
-- profiles.activity_at ALREADY tracks user recency: it's a jsonb {section:
-- timestamp} updated by mark_section_activity() on every user action, so the
-- max value is "when the user was last active". We therefore do NOT add a
-- redundant last_active_at column — the cron derives recency from activity_at.
--
-- We DO add a per-day engagement-nudge counter to push_subscriptions so the cron
-- can enforce the "max N nudges today" tiers precisely. last_notified_at can't:
-- it is a single timestamp AND is shared with partner-activity pushes, so it
-- can't tell us how many *engagement* nudges have gone out today.
-- ════════════════════════════════════════════════════════════════════════════

alter table push_subscriptions add column if not exists nudge_date  date;
alter table push_subscriptions add column if not exists nudge_count int not null default 0;
