-- ============================================================================
-- Migration 0008 — visible proof the automatic absence check is running
--
-- The mark-absences function itself was already correct — it checks each
-- hospital's own session_expires_at throughout the day rather than waiting
-- for the day to end, and never depended on a coordinator running it
-- manually. What was missing was any way to SEE that it's actually
-- executing on schedule. This adds a one-row status table the function
-- updates on every run (scheduled or manual), which the coordinator
-- dashboard now surfaces as "Last automatic check: N minutes ago" — if that
-- goes stale, it's an immediate, visible sign the cron job isn't actually
-- scheduled/running, rather than a silent mystery.
--
-- SAFETY: purely additive — one new table, nothing else touched.
-- ============================================================================

create table if not exists system_status (
  id boolean primary key default true,
  last_mark_absences_run timestamptz,
  last_mark_absences_marked_count int,
  constraint system_status_singleton check (id = true)
);

insert into system_status (id) values (true) on conflict (id) do nothing;

alter table system_status enable row level security;

create policy "system_status_select" on system_status
  for select using (auth.uid() is not null);

grant select, insert, update on system_status to authenticated;

-- Verification:
--   select * from system_status;  -- one row; last_mark_absences_run updates
--   after every mark-absences call (manual button, backfill, or cron).
