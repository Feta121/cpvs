-- ============================================================================
-- Migration 0009 — track last backfill date for auto-gap-detection
--
-- The coordinator dashboard's "Backfill" button used to require manually
-- picking a single date. This makes it self-directing instead: it tracks
-- the last date a backfill successfully ran through, and next time simply
-- walks forward from the day after that through today, checking every day
-- in between — so a coordinator who missed a week of checks can just click
-- one button rather than picking each date individually.
--
-- SAFETY: additive — one new nullable column, nothing else touched.
-- ============================================================================

alter table system_status add column if not exists last_backfill_date date;

-- Verification:
--   select last_backfill_date from system_status;  -- null until first backfill run
