-- ============================================================================
-- Migration 0002 — Hospital management fields + student profile fields
--
-- SAFETY NOTES (read before running):
--   - This migration is ADD-ONLY. It does not drop, rename, or alter the
--     type of any existing column, and it does not delete any rows.
--   - Every new column is added with a default value (or is nullable), so
--     existing rows remain valid and existing INSERT statements elsewhere
--     in the app that don't mention these columns keep working unchanged.
--   - All existing RLS policies on `hospitals` and `students` already use
--     `is_coordinator()` / ownership checks that don't reference specific
--     columns, so they continue to apply unmodified to the new columns.
--   - Safe to run multiple times: every statement uses `if not exists`.
--
-- Run this in Supabase SQL Editor AFTER 0001 (the original schema.sql) has
-- already been applied. Do NOT re-run schema.sql's `create table` statements
-- against a project that already has data — they're `create table if not
-- exists` so they're harmless, but this file is the correct place for
-- incremental changes going forward.
-- ============================================================================

-- --------------------------------------------------------------------------
-- hospitals: address + active/inactive status
-- --------------------------------------------------------------------------
alter table hospitals add column if not exists address text;
alter table hospitals add column if not exists is_active boolean not null default true;

-- Give existing rows an explicit true so nothing reads as "inactive" by
-- surprise after this migration (the column default already covers this for
-- brand-new rows, but we set it explicitly for any rows inserted before the
-- default existed).
update hospitals set is_active = true where is_active is null;

-- --------------------------------------------------------------------------
-- students: institution + program (both nullable / defaulted, no backfill
-- required — existing rows simply show the default until a coordinator
-- edits them)
-- --------------------------------------------------------------------------
alter table students add column if not exists institution text not null default 'Addis Ababa University';
alter table students add column if not exists program text;

-- Backfill `program` from the existing `department` column so nothing shows
-- blank for current students (non-destructive: `department` is untouched).
update students set program = department where program is null;

-- --------------------------------------------------------------------------
-- Verification queries — run these after migrating to confirm nothing broke.
-- (Read-only; safe to run anytime.)
-- --------------------------------------------------------------------------
-- 1. Confirm no existing hospital rows were dropped:
--      select count(*) from hospitals;
-- 2. Confirm every hospital has a boolean is_active (no nulls):
--      select count(*) from hospitals where is_active is null;   -- should be 0
-- 3. Confirm no existing student rows were dropped:
--      select count(*) from students;
-- 4. Confirm RLS is still enabled on both tables:
--      select relname, relrowsecurity from pg_class
--      where relname in ('hospitals', 'students');               -- both true
-- 5. Confirm existing attendance/appeal rows are untouched:
--      select count(*) from attendance;
--      select count(*) from appeals;
