-- ============================================================================
-- Migration 0006 — fix missing GRANT + add clinical_days_config
--
-- PART 1: "permission denied for table special_practice_days"
--
-- This is NOT an RLS violation (which would say "new row violates row-level
-- security policy" or just silently return 0 rows) — "permission denied for
-- table X" means the `authenticated` role never had basic table-level
-- privileges (SELECT/INSERT/UPDATE/DELETE) granted on it at all, which is a
-- separate, more fundamental permission layer that sits underneath RLS.
-- Every other table in this project was created in the original schema.sql,
-- which normally inherits default privileges Supabase sets up for the
-- `public` schema — special_practice_days, created later in migration 0005,
-- apparently didn't pick those up. This grants them explicitly.
--
-- SAFETY: purely additive — grants and a new table, nothing else touched.
-- ============================================================================

grant select, insert, update, delete on special_practice_days to authenticated;

-- ============================================================================
-- PART 2: clinical_days_config — coordinator-toggleable weekly schedule
--
-- Previously "Monday/Tuesday/Wednesday" was hardcoded in the mark-absences
-- function and the student check-in page. This makes it a single editable
-- row instead, defaulting to exactly that (Mon/Tue/Wed on, Thu–Sun off) so
-- nothing changes until a coordinator actually flips a switch.
-- ============================================================================

create table if not exists clinical_days_config (
  id boolean primary key default true, -- always exactly one row (id = true)
  monday boolean not null default true,
  tuesday boolean not null default true,
  wednesday boolean not null default true,
  thursday boolean not null default false,
  friday boolean not null default false,
  saturday boolean not null default false,
  sunday boolean not null default false,
  updated_by uuid references coordinators(id),
  updated_at timestamptz not null default now(),
  constraint clinical_days_config_singleton check (id = true)
);

insert into clinical_days_config (id) values (true) on conflict (id) do nothing;

alter table clinical_days_config enable row level security;

create policy "clinical_days_config_select" on clinical_days_config
  for select using (auth.uid() is not null);
create policy "clinical_days_config_write_coordinator" on clinical_days_config
  for update using (is_coordinator()) with check (is_coordinator());

grant select, insert, update on clinical_days_config to authenticated;

-- Verification:
--   select * from special_practice_days limit 1;  -- should no longer error
--   select * from clinical_days_config;             -- exactly 1 row, Mon/Tue/Wed = true
