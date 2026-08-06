-- ============================================================================
-- Migration 0010 — enable Realtime on notifications
--
-- The new browser push notification system needs to know the instant a new
-- row is inserted into `notifications` for the current user, so it can fire
-- an OS-level notification while the tab is open but not focused (another
-- tab, or minimized) — this is what makes that possible. Supabase Realtime
-- only streams changes for tables explicitly added to its publication.
--
-- SAFETY: this does not change any table structure, data, or RLS policy —
-- it only makes already-readable rows (per existing RLS) streamable in
-- real time to the same user who could already read them via a normal
-- query. No new data becomes visible to anyone who couldn't see it before.
-- ============================================================================

alter publication supabase_realtime add table notifications;

-- Verification:
--   select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications';
--   (should return one row)
