-- ============================================================================
-- Migration 0012 — hierarchical coordinator permission system
--
-- WHAT THIS ADDS
--   - A `is_super_coordinator` flag: bypasses every individual permission
--     check below. Only a Super Coordinator can create/edit/deactivate/
--     delete/reset-password other coordinator accounts, or change anyone's
--     permissions (including promoting/demoting Super Coordinator status
--     itself, via the SAME panel as the other toggles).
--   - An `is_active` flag: a deactivated coordinator keeps their account and
--     history, but loses all coordinator-level access — is_coordinator()
--     itself now requires is_active = true, so this one flag automatically
--     locks them out everywhere else in the app without touching every
--     other policy individually.
--   - 15 granular `can_*` permission flags. Three areas (students, hospitals,
--     rotations) are split into create/edit/delete separately since those
--     are the most destructive/high-stakes actions in the app; everything
--     else (attendance, appeals, announcements, schedules) is one flag per
--     area. `can_view_reports` and `can_system_settings` are reserved —
--     there's no page for either yet, added for future use.
--
-- WHY is_super_coordinator/is_active/can_* live as flat boolean columns on
-- `coordinators` rather than a separate normalized permissions table: every
-- RLS policy that needs to check one just references a column directly
-- (or via has_permission() below) — no joins, no per-row EXISTS subqueries
-- against a second table. Simpler to reason about, cheaper to evaluate on
-- every single query these policies gate, and it's a single ALTER TABLE
-- instead of a new table + its own RLS + its own migration-of-existing-data
-- story. That's what "minimal database changes" meant in practice here.
--
-- SELF/LAST-SUPER PROTECTIONS
--   - A coordinator can never change their OWN is_super_coordinator,
--     is_active, or any can_* column — enforced by a BEFORE UPDATE trigger,
--     independent of which code path attempts the change (the RPC below
--     already refuses this before it would even try, but the trigger closes
--     the gap for any other/future code path that updates this table
--     directly).
--   - The last remaining active Super Coordinator can never be demoted
--     (via the RPC) or deleted (via the delete-coordinator Edge Function) —
--     there must always be at least one way back in.
--
-- SAFETY: additive only for every existing table (new nullable-with-
-- defaults columns, new functions, new policies replacing old ones with
-- equivalent-or-broader behavior for the existing single coordinator, who
-- is promoted to Super Coordinator by this same migration and therefore
-- keeps 100% of their current access). No data is deleted, no existing
-- table is dropped, no column is renamed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema: new columns on coordinators
-- ----------------------------------------------------------------------------

alter table coordinators add column if not exists is_super_coordinator boolean not null default false;
alter table coordinators add column if not exists is_active boolean not null default true;

alter table coordinators add column if not exists can_create_students boolean not null default false;
alter table coordinators add column if not exists can_edit_students boolean not null default false;
alter table coordinators add column if not exists can_delete_students boolean not null default false;

alter table coordinators add column if not exists can_create_hospitals boolean not null default false;
alter table coordinators add column if not exists can_edit_hospitals boolean not null default false;
alter table coordinators add column if not exists can_delete_hospitals boolean not null default false;

alter table coordinators add column if not exists can_create_rotations boolean not null default false;
alter table coordinators add column if not exists can_edit_rotations boolean not null default false;
alter table coordinators add column if not exists can_delete_rotations boolean not null default false;

alter table coordinators add column if not exists can_manage_attendance boolean not null default false;
alter table coordinators add column if not exists can_review_appeals boolean not null default false;
alter table coordinators add column if not exists can_send_announcements boolean not null default false;
alter table coordinators add column if not exists can_manage_schedules boolean not null default false;

-- Reserved for future pages — not wired to anything yet.
alter table coordinators add column if not exists can_view_reports boolean not null default false;
alter table coordinators add column if not exists can_system_settings boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. Promote the current (only) coordinator to Super Coordinator, with every
--    flag on. This is a one-time historical bootstrap for whoever exists
--    right now — every coordinator created AFTER this migration starts with
--    every flag false (least privilege) via the column defaults above, and
--    a Super Coordinator grants specific permissions explicitly afterward.
-- ----------------------------------------------------------------------------

update coordinators set
  is_super_coordinator = true,
  is_active = true,
  can_create_students = true, can_edit_students = true, can_delete_students = true,
  can_create_hospitals = true, can_edit_hospitals = true, can_delete_hospitals = true,
  can_create_rotations = true, can_edit_rotations = true, can_delete_rotations = true,
  can_manage_attendance = true, can_review_appeals = true, can_send_announcements = true,
  can_manage_schedules = true, can_view_reports = true, can_system_settings = true
where id = (select id from coordinators order by created_at asc limit 1);

-- ----------------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER, same established pattern as
--    is_coordinator() and get_profiles_by_ids() in earlier migrations —
--    bypasses RLS so these are safe to call from inside RLS policies
--    themselves without recursion, and the authorization logic lives in
--    exactly one place instead of being duplicated across every policy).
-- ----------------------------------------------------------------------------

-- CHANGED: is_coordinator() now also requires is_active = true. This is
-- what makes "deactivate" actually mean something everywhere at once — every
-- existing policy in the whole schema that already calls is_coordinator()
-- (hospitals, announcements, practice_exceptions, profiles, ...) picks up
-- "deactivated coordinators lose access" automatically, with zero changes
-- needed to those individual policies.
create or replace function is_coordinator()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles p
    join coordinators c on c.id = p.id
    where p.id = auth.uid() and p.role = 'coordinator' and c.is_active = true
  );
$$;

create or replace function is_super_coordinator()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from coordinators
    where id = auth.uid() and is_active = true and is_super_coordinator = true
  );
$$;

-- Generic permission check: a Super Coordinator always passes (they
-- implicitly have every permission — that's the point of the role), an
-- inactive coordinator always fails, otherwise reads the named column off
-- their own coordinators row. `to_jsonb(...) ->> perm` looks the column up
-- dynamically by name so this is ONE function instead of fifteen
-- near-identical ones (can_create_students(), can_edit_students(), ...) —
-- callers pass the column name as a string, e.g.
-- has_permission('can_edit_students').
create or replace function has_permission(perm text)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  result boolean;
begin
  if exists (select 1 from coordinators where id = auth.uid() and is_active = true and is_super_coordinator = true) then
    return true;
  end if;

  select (to_jsonb(c) ->> perm)::boolean into result
  from coordinators c
  where c.id = auth.uid() and c.is_active = true;

  return coalesce(result, false);
end;
$$;

grant execute on function is_super_coordinator() to authenticated;
grant execute on function has_permission(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Self-protection trigger — a coordinator (even a Super Coordinator) can
--    never change their OWN elevated/permission columns, regardless of
--    which code path attempts it. Ordinary self-edits (e.g. `department`)
--    are untouched and still allowed by the existing self-update policy.
-- ----------------------------------------------------------------------------

create or replace function prevent_self_permission_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.id and (
    new.is_super_coordinator is distinct from old.is_super_coordinator or
    new.is_active is distinct from old.is_active or
    new.can_create_students is distinct from old.can_create_students or
    new.can_edit_students is distinct from old.can_edit_students or
    new.can_delete_students is distinct from old.can_delete_students or
    new.can_create_hospitals is distinct from old.can_create_hospitals or
    new.can_edit_hospitals is distinct from old.can_edit_hospitals or
    new.can_delete_hospitals is distinct from old.can_delete_hospitals or
    new.can_create_rotations is distinct from old.can_create_rotations or
    new.can_edit_rotations is distinct from old.can_edit_rotations or
    new.can_delete_rotations is distinct from old.can_delete_rotations or
    new.can_manage_attendance is distinct from old.can_manage_attendance or
    new.can_review_appeals is distinct from old.can_review_appeals or
    new.can_send_announcements is distinct from old.can_send_announcements or
    new.can_manage_schedules is distinct from old.can_manage_schedules or
    new.can_view_reports is distinct from old.can_view_reports or
    new.can_system_settings is distinct from old.can_system_settings
  ) then
    raise exception 'You cannot modify your own permissions.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_permission_change on coordinators;
create trigger trg_prevent_self_permission_change
  before update on coordinators
  for each row execute function prevent_self_permission_change();

-- ----------------------------------------------------------------------------
-- 5. update_coordinator_permissions RPC — the single entry point a Super
--    Coordinator uses to activate/deactivate, promote/demote, and grant/
--    revoke every permission in one call (matches the permissions UI, which
--    edits all of it together as one form). SECURITY DEFINER, so this does
--    its own explicit authorization rather than relying on RLS: caller must
--    be an active Super Coordinator, can't target themselves, and can't
--    demote the last remaining active Super Coordinator.
-- ----------------------------------------------------------------------------

create or replace function update_coordinator_permissions(
  target_id uuid,
  new_is_super_coordinator boolean,
  new_is_active boolean,
  new_can_create_students boolean,
  new_can_edit_students boolean,
  new_can_delete_students boolean,
  new_can_create_hospitals boolean,
  new_can_edit_hospitals boolean,
  new_can_delete_hospitals boolean,
  new_can_create_rotations boolean,
  new_can_edit_rotations boolean,
  new_can_delete_rotations boolean,
  new_can_manage_attendance boolean,
  new_can_review_appeals boolean,
  new_can_send_announcements boolean,
  new_can_manage_schedules boolean,
  new_can_view_reports boolean,
  new_can_system_settings boolean
)
returns void
language plpgsql
security definer
as $$
declare
  target_was_super boolean;
  remaining_supers int;
begin
  if not is_super_coordinator() then
    raise exception 'Only an active Super Coordinator can change coordinator permissions.';
  end if;

  if target_id = auth.uid() then
    raise exception 'You cannot modify your own permissions.';
  end if;

  select is_super_coordinator into target_was_super from coordinators where id = target_id;
  if target_was_super and not new_is_super_coordinator then
    select count(*) into remaining_supers
    from coordinators
    where is_super_coordinator = true and is_active = true and id <> target_id;
    if remaining_supers = 0 then
      raise exception 'Cannot remove Super Coordinator status from the last Super Coordinator.';
    end if;
  end if;

  update coordinators set
    is_super_coordinator = new_is_super_coordinator,
    is_active = new_is_active,
    can_create_students = new_can_create_students,
    can_edit_students = new_can_edit_students,
    can_delete_students = new_can_delete_students,
    can_create_hospitals = new_can_create_hospitals,
    can_edit_hospitals = new_can_edit_hospitals,
    can_delete_hospitals = new_can_delete_hospitals,
    can_create_rotations = new_can_create_rotations,
    can_edit_rotations = new_can_edit_rotations,
    can_delete_rotations = new_can_delete_rotations,
    can_manage_attendance = new_can_manage_attendance,
    can_review_appeals = new_can_review_appeals,
    can_send_announcements = new_can_send_announcements,
    can_manage_schedules = new_can_manage_schedules,
    can_view_reports = new_can_view_reports,
    can_system_settings = new_can_system_settings
  where id = target_id;
end;
$$;

grant execute on function update_coordinator_permissions(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RLS: split each previously-blanket "any coordinator can write" policy
--    into the specific permission it actually corresponds to. SELECT
--    policies are intentionally left alone everywhere — this system gates
--    WRITE actions (create/edit/delete), not read visibility, matching how
--    the rest of the app already works (e.g. hospitals stay visible after
--    deactivation, just excluded from new assignment).
-- ----------------------------------------------------------------------------

-- students: was one "for all" policy keyed on is_coordinator()
drop policy if exists "students_write_coordinator" on students;
create policy "students_insert" on students
  for insert with check (has_permission('can_create_students'));
create policy "students_update" on students
  for update using (has_permission('can_edit_students')) with check (has_permission('can_edit_students'));
create policy "students_delete" on students
  for delete using (has_permission('can_delete_students'));

-- hospitals
drop policy if exists "hospitals_write_coordinator" on hospitals;
create policy "hospitals_insert" on hospitals
  for insert with check (has_permission('can_create_hospitals'));
create policy "hospitals_update" on hospitals
  for update using (has_permission('can_edit_hospitals')) with check (has_permission('can_edit_hospitals'));
create policy "hospitals_delete" on hospitals
  for delete using (has_permission('can_delete_hospitals'));

-- rotations
drop policy if exists "rotations_write_coordinator" on rotations;
create policy "rotations_insert" on rotations
  for insert with check (has_permission('can_create_rotations'));
create policy "rotations_update" on rotations
  for update using (has_permission('can_edit_rotations')) with check (has_permission('can_edit_rotations'));
create policy "rotations_delete" on rotations
  for delete using (has_permission('can_delete_rotations'));

-- schedules: per-rotation day overrides — no dedicated UI of its own today,
-- treated as part of "editing a rotation" rather than a separate area.
drop policy if exists "schedules_write_coordinator" on schedules;
create policy "schedules_write" on schedules
  for all using (has_permission('can_edit_rotations')) with check (has_permission('can_edit_rotations'));

-- attendance: only the UPDATE half changes (insert stays student-only)
drop policy if exists "attendance_update_own_or_coordinator" on attendance;
create policy "attendance_update_own_or_coordinator" on attendance
  for update using (student_id = auth.uid() or has_permission('can_manage_attendance'));

-- appeals: only the coordinator-review UPDATE half changes
drop policy if exists "appeals_update_coordinator" on appeals;
create policy "appeals_update_coordinator" on appeals
  for update using (has_permission('can_review_appeals'));

-- announcements
drop policy if exists "announcements_write_coordinator" on announcements;
create policy "announcements_write" on announcements
  for all using (has_permission('can_send_announcements')) with check (has_permission('can_send_announcements'));

-- practice_exceptions
drop policy if exists "exceptions_write_coordinator" on practice_exceptions;
create policy "exceptions_write" on practice_exceptions
  for all using (has_permission('can_manage_schedules')) with check (has_permission('can_manage_schedules'));

-- special_practice_days (added in migration 0005)
drop policy if exists "special_practice_days_write_coordinator" on special_practice_days;
create policy "special_practice_days_write" on special_practice_days
  for all using (has_permission('can_manage_schedules')) with check (has_permission('can_manage_schedules'));

-- clinical_days_config (added in migration 0006) — only the UPDATE half
-- changes; SELECT/INSERT stay as they were (INSERT is only ever the
-- singleton bootstrap row from that migration, never done by users).
drop policy if exists "clinical_days_config_write_coordinator" on clinical_days_config;
create policy "clinical_days_config_write" on clinical_days_config
  for update using (has_permission('can_manage_schedules')) with check (has_permission('can_manage_schedules'));

-- force_delete_hospital (added in migration 0007): was gated on
-- is_coordinator() alone — narrow to the specific delete permission.
create or replace function force_delete_hospital(target_hospital_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not has_permission('can_delete_hospitals') then
    raise exception 'You do not have permission to delete hospitals.';
  end if;

  delete from appeals
    where attendance_id in (select id from attendance where hospital_id = target_hospital_id);
  delete from attendance where hospital_id = target_hospital_id;
  delete from schedules
    where rotation_id in (select id from rotations where hospital_id = target_hospital_id);
  delete from rotations where hospital_id = target_hospital_id;
  delete from practice_exceptions where hospital_id = target_hospital_id;
  delete from special_practice_days where hospital_id = target_hospital_id;
  delete from hospitals where id = target_hospital_id;
end;
$$;

-- Verification (run as the promoted Super Coordinator):
--   select is_super_coordinator, is_active from coordinators where id = auth.uid();
--   -- both true
--   select has_permission('can_create_students');  -- true (Super bypasses)
--
-- Verification (run as a freshly-created regular coordinator with no
-- flags granted yet):
--   select has_permission('can_create_students');  -- false
--   insert into students (...) values (...);  -- should fail: RLS violation
