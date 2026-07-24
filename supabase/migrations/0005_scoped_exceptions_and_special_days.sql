-- ============================================================================
-- Migration 0005 — batch/student-scoped exceptions + special practice days
--
-- SAFETY: additive only. New nullable columns on practice_exceptions (every
-- existing row keeps working exactly as before — null means "applies to
-- everyone", same as today), and one new table. No drops, no renames, no
-- data touched.
-- ============================================================================

-- --------------------------------------------------------------------------
-- practice_exceptions: narrow targeting beyond just "this hospital / all
-- hospitals" — a coordinator can now scope a holiday/closure/cancellation to
-- a specific batch or even a single student.
-- --------------------------------------------------------------------------
alter table practice_exceptions add column if not exists batch text;
alter table practice_exceptions add column if not exists student_id uuid references students(id) on delete cascade;

-- --------------------------------------------------------------------------
-- special_practice_days: the inverse of an exception — adds an EXTRA
-- clinical practice day on a date that wouldn't otherwise count (practice
-- normally only runs Mon/Tue/Wed). Also scopable to a hospital, batch,
-- and/or specific student. When one of these matches, mark-absences treats
-- that date as an expected day for that student regardless of the day of
-- week.
-- --------------------------------------------------------------------------
create table if not exists special_practice_days (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  hospital_id uuid references hospitals(id), -- null = any hospital
  batch text,                                 -- null = any batch
  student_id uuid references students(id) on delete cascade, -- null = any student
  reason text,
  created_by uuid references coordinators(id),
  created_at timestamptz not null default now()
);

alter table special_practice_days enable row level security;

create policy "special_practice_days_select" on special_practice_days
  for select using (auth.uid() is not null);
create policy "special_practice_days_write_coordinator" on special_practice_days
  for all using (is_coordinator()) with check (is_coordinator());

-- Verification:
--   select column_name from information_schema.columns
--   where table_name = 'practice_exceptions' and column_name in ('batch', 'student_id');
--   select count(*) from special_practice_days;  -- 0 on a fresh install, fine
