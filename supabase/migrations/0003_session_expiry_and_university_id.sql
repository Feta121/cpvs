-- ============================================================================
-- Migration 0003 — configurable session-expiry time + university ID field
--
-- SAFETY: additive only. No column is dropped or renamed. Existing rows get
-- sensible defaults so nothing already in the database is invalidated.
--
-- NOTE ON NAMING: the app now displays `students.student_id` as "CPVS ID"
-- and this new `university_id` column as "Student ID" — but the physical
-- column name `student_id` is intentionally left unchanged to avoid renaming
-- an existing column (which could break saved queries, exports, or anything
-- else referencing it directly). Only the UI label changed.
-- ============================================================================

-- Per-hospital, coordinator-editable cutoff after which check-in closes and
-- the student is eligible to be auto-marked absent. Defaults to 15:00 (3 PM)
-- to match existing behavior exactly — no hospital's behavior changes until
-- a coordinator edits it.
alter table hospitals add column if not exists session_expires_at time not null default '15:00';

-- The student's actual university-issued ID (e.g. "UGR/3152/15"), distinct
-- from the CPVS-generated code that already lives in `student_id`. Nullable
-- so existing student rows (which predate this field) remain valid; new
-- signups via the create-student function will always populate it.
alter table students add column if not exists university_id text;

-- Multiple NULLs are allowed under a unique constraint in Postgres, so this
-- is safe to add even though older rows have no value yet.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_university_id_key'
  ) then
    alter table students add constraint students_university_id_key unique (university_id);
  end if;
end $$;

-- Verification queries:
--   select name, session_expires_at from hospitals;              -- all '15:00:00' unless edited
--   select count(*) from students where university_id is null;   -- existing students, expected > 0
--   select count(*) from students;                                -- unchanged row count
