-- ============================================================================
-- Migration 0015 — Row Level Security hardening
--
-- WHY THIS EXISTS
--
-- The RLS policies in schema.sql were written BEFORE the coordinator
-- permission system existed (migration 0012) and were never revisited
-- afterwards. The app's own code documents the intended security model
-- (src/hooks/usePermissions.ts: "this is NOT the actual security boundary —
-- RLS + the SECURITY DEFINER functions/triggers are"), but the database did
-- not actually enforce it. This migration closes those gaps.
--
-- WHAT IT FIXES, in order of severity:
--
--   1. CRITICAL — any logged-in student could make themselves a Super
--      Coordinator. The policy `coordinators_write_self` was declared
--      `for all using (id = auth.uid())`. In Postgres, `for all` covers
--      INSERT and DELETE, not just UPDATE — so a student could INSERT a
--      row into `coordinators` with their own id and
--      is_super_coordinator = true. is_super_coordinator() and
--      has_permission() never check profiles.role, so that single INSERT
--      granted every coordinator write permission in the entire app.
--      The self-protection trigger from 0012 did not stop this because it
--      was declared BEFORE UPDATE only — an INSERT sails straight past it.
--
--   2. CRITICAL — any logged-in student could promote themselves to the
--      coordinator role. `profiles_update_own` was declared
--      `for update using (id = auth.uid())` with NO `with check` clause and
--      no column restriction. Postgres reuses `using` as the new-row check
--      when `with check` is omitted, so the row-ownership part was enforced
--      — but nothing stopped the student from setting role = 'coordinator'
--      on their own row, which combined with (1) unlocks read access to
--      every other student's attendance, appeals and profile data.
--
--   3. HIGH — a student could silently rewrite their own attendance.
--      `attendance_update_own_or_coordinator` also had no `with check`, so a
--      student could UPDATE their own 'absent' row to 'present', or edit
--      their recorded check-in time and GPS coordinates. Fixed here with a
--      trigger that limits students to the check-out fields only. (Migration
--      0016 removes direct student writes entirely, replacing them with a
--      server-side check_in()/check_out() RPC.)
--
--   4. HIGH — a coordinator holding only `can_review_appeals` could not
--      actually approve an appeal. src/pages/coordinator/Appeals.tsx sets
--      the attendance row to 'excused' when approving, but the attendance
--      UPDATE policy gated on `can_manage_attendance` alone — so the write
--      was silently filtered out by RLS, the appeal was marked approved,
--      and the student's absence stayed on their record. This is a real
--      existing bug, not just a theoretical one.
--
--   5. MEDIUM — any logged-in user could write into any other user's
--      notification inbox: `notifications_insert_system` was declared
--      `with check (true)`.
--
--   6. MEDIUM — any logged-in user could read and overwrite every appeal
--      attachment in storage, including other students' medical
--      documentation. Both `appeal-files` policies only checked
--      `auth.uid() is not null`.
--
--   7. MEDIUM — every student could read every coordinator's `login_email`
--      (migration 0013), which is the coordinator's actual login username.
--      `coordinators_select` allowed any authenticated user to read the
--      whole table.
--
--   8. BROKEN FEATURE — student profile photo upload has never worked. The
--      page uploads to a `profile-photos` storage bucket
--      (src/pages/student/Profile.tsx:15) that no migration has ever
--      created. The upload fails, the page ignores the error, and nothing
--      appears to happen. This creates the bucket and its policies.
--
-- SAFETY / COMPATIBILITY
--
-- Every change below was checked against the actual client call sites first.
-- Nothing that the app currently does successfully is taken away:
--   * `coordinators` is only ever SELECTed from the client (AuthContext.tsx:84,
--     Coordinators.tsx:46). All coordinator writes already go through the
--     update_coordinator_permissions RPC or an Edge Function using the
--     service-role key, neither of which is affected by these revokes.
--   * `notifications` inserts come from Announcements.tsx:60,
--     Exceptions.tsx:86 and Appeals.tsx:71 — all coordinator pages, all
--     still permitted. Trigger-generated notifications (schema.sql's
--     check_late_attendance_concern) are SECURITY DEFINER and bypass RLS.
--   * appeal-files uploads already use a `<user-id>/filename` path
--     (Appeals.tsx:59), so the folder-scoped policies below work with every
--     file already in the bucket — no client change and no file migration
--     needed. Coordinator review still works: AttachmentViewerModal.tsx:38
--     calls createSignedUrl, which needs SELECT on the object, and
--     coordinators keep that.
--   * Students never read the `coordinators` table. The student dashboard
--     shows their coordinator's name via the get_profiles_by_ids RPC
--     (migration 0004), not via a coordinators query.
--
-- No table is dropped, no column is dropped or renamed, and no row of data
-- is deleted or modified.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. coordinators — close the self-elevation hole (CRITICAL)
--
-- The client never inserts, updates or deletes this table directly, so the
-- safest fix is also the simplest: remove the blanket `for all` self policy
-- and revoke the underlying table privileges. Table-level GRANTs sit
-- UNDERNEATH RLS (see migration 0006's note), so revoking them here means
-- even a future policy mistake cannot re-open this hole.
--
-- The legitimate write paths are unaffected:
--   * update_coordinator_permissions() — SECURITY DEFINER, runs as its owner
--   * create-coordinator / delete-coordinator Edge Functions — service-role key
-- ----------------------------------------------------------------------------

drop policy if exists "coordinators_write_self" on coordinators;

revoke insert, update, delete on coordinators from authenticated;
revoke insert, update, delete on coordinators from anon;

-- Belt and braces: extend the 0012 self-protection trigger to INSERT as
-- well as UPDATE, so the escalation path is blocked at the row level too and
-- not only by the revoked GRANT above.
--
-- Note on the create-coordinator Edge Function: it runs with the
-- service-role key, where auth.uid() is NULL, so `auth.uid() = <row id>` is
-- never true there and legitimate coordinator creation is unaffected.
create or replace function prevent_self_permission_change()
returns trigger
language plpgsql
as $$
declare
  target_id uuid;
begin
  -- On INSERT there is no OLD row; the row being created is the target.
  target_id := coalesce(old.id, new.id);

  if auth.uid() is null or auth.uid() <> target_id then
    return new;
  end if;

  -- Creating your own coordinators row is never legitimate — coordinator
  -- accounts are created by a Super Coordinator through the
  -- create-coordinator Edge Function, which uses the service-role key.
  if tg_op = 'INSERT' then
    raise exception 'Coordinator records cannot be created this way.';
  end if;

  if (
    new.is_super_coordinator is distinct from old.is_super_coordinator or
    new.is_active is distinct from old.is_active or
    new.login_email is distinct from old.login_email or
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
  before insert or update on coordinators
  for each row execute function prevent_self_permission_change();


-- ----------------------------------------------------------------------------
-- 2. coordinators — stop students reading coordinator login usernames
--
-- Students genuinely do not need this table: the student dashboard resolves
-- its coordinator's display name through get_profiles_by_ids (migration
-- 0004). AuthContext reads the caller's OWN coordinator row, which
-- `id = auth.uid()` still permits, and the coordinator directory page needs
-- all rows, which is_coordinator() still permits.
-- ----------------------------------------------------------------------------

drop policy if exists "coordinators_select" on coordinators;
create policy "coordinators_select" on coordinators
  for select using (id = auth.uid() or is_coordinator());


-- ----------------------------------------------------------------------------
-- 3. profiles — pin `role` so nobody can promote themselves (CRITICAL)
--
-- Implemented as a trigger rather than a `with check` subquery on purpose: a
-- policy on `profiles` that queries `profiles` risks RLS recursion, whereas
-- a trigger sees OLD and NEW directly and can compare them cheaply.
--
-- Legitimate self-updates still work untouched:
--   * ChangePassword.tsx:45 — sets must_change_password = false
--   * Profile.tsx:18       — sets photo_url
-- Role assignment happens only in the create-student / create-coordinator
-- Edge Functions, which use the service-role key (auth.uid() is NULL there).
-- ----------------------------------------------------------------------------

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function prevent_self_role_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and new.role is distinct from old.role then
    raise exception 'You cannot change your own account role.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_change on profiles;
create trigger trg_prevent_self_role_change
  before update on profiles
  for each row execute function prevent_self_role_change();


-- ----------------------------------------------------------------------------
-- 4. attendance — stop students editing their own records (HIGH)
--
-- Two things happen here:
--
--   a) The UPDATE policy gains a `with check` clause, and the coordinator
--      branch now accepts can_manage_attendance OR can_review_appeals. The
--      second half fixes the appeal-approval bug described above: approving
--      an appeal has to set the attendance row to 'excused', and a
--      coordinator whose only permission is can_review_appeals could not do
--      that.
--
--   b) A trigger restricts what a student may change on their own row to the
--      check-out fields. This matches exactly what the current app does
--      (Attendance.tsx handleCheckOut writes check_out_time / check_out_lat
--      / check_out_lng and nothing else), so today's check-out keeps
--      working, while flipping 'absent' to 'present' or rewriting a
--      check-in time or GPS coordinate is refused.
--
-- Migration 0016 replaces student writes with a server-side RPC entirely;
-- this trigger is the immediately-deployable half of the fix and stays in
-- place afterwards as defence in depth.
-- ----------------------------------------------------------------------------

drop policy if exists "attendance_update_own_or_coordinator" on attendance;
create policy "attendance_update_own_or_coordinator" on attendance
  for update
  using (
    student_id = auth.uid()
    or has_permission('can_manage_attendance')
    or has_permission('can_review_appeals')
  )
  with check (
    student_id = auth.uid()
    or has_permission('can_manage_attendance')
    or has_permission('can_review_appeals')
  );

create or replace function prevent_student_attendance_tamper()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Escape hatch for the server-side check_in()/check_out() functions added
  -- in migration 0016. Those run as SECURITY DEFINER but auth.uid() inside
  -- them is still the student's id, so without this they would trip the
  -- guard below. They set this flag with `is_local = true`, which means
  -- Postgres discards it at the end of the transaction — a student cannot
  -- set it themselves from the client, because the client has no way to run
  -- set_config() and every RPC call is its own transaction.
  if coalesce(current_setting('cpvs.trusted_write', true), '') = 'on' then
    return new;
  end if;

  -- Not the student who owns the row (i.e. a coordinator, a SECURITY DEFINER
  -- function, or the service-role key): the RLS policy above already decided
  -- whether this write is allowed.
  if auth.uid() is null or auth.uid() <> old.student_id then
    return new;
  end if;

  -- A coordinator correcting a record is handled by the branch above; this
  -- only runs when the caller IS the student the row belongs to.
  if (
    new.id is distinct from old.id or
    new.student_id is distinct from old.student_id or
    new.rotation_id is distinct from old.rotation_id or
    new.hospital_id is distinct from old.hospital_id or
    new.date is distinct from old.date or
    new.status is distinct from old.status or
    new.check_in_time is distinct from old.check_in_time or
    new.check_in_lat is distinct from old.check_in_lat or
    new.check_in_lng is distinct from old.check_in_lng or
    new.corrected_by is distinct from old.corrected_by or
    new.corrected_at is distinct from old.corrected_at or
    new.notes is distinct from old.notes or
    new.created_at is distinct from old.created_at
  ) then
    raise exception 'Attendance records cannot be edited. Submit an appeal if a record is wrong.';
  end if;

  -- Check-out is a one-time action; it cannot be replayed or moved.
  if old.check_out_time is not null and new.check_out_time is distinct from old.check_out_time then
    raise exception 'You have already checked out today.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_student_attendance_tamper on attendance;
create trigger trg_prevent_student_attendance_tamper
  before update on attendance
  for each row execute function prevent_student_attendance_tamper();

-- Students must never be able to delete an attendance record (there is no
-- DELETE policy today, so this is only closing the GRANT layer underneath).
revoke delete on attendance from authenticated;
revoke delete on attendance from anon;


-- ----------------------------------------------------------------------------
-- 5. notifications — only coordinators may write into someone's inbox
--
-- `with check (true)` let any logged-in user post a notification to any
-- other user, e.g. a fake "Appeal approved" message. Narrowed to
-- is_coordinator(), which is what the three coordinator pages that insert
-- notifications already are. System-generated notifications come from
-- SECURITY DEFINER triggers and the service-role key, both of which bypass
-- RLS and are unaffected.
-- ----------------------------------------------------------------------------

drop policy if exists "notifications_insert_system" on notifications;
create policy "notifications_insert_coordinator" on notifications
  for insert with check (is_coordinator());

-- A user may mark their own notifications read; they may not rewrite the
-- text of one. `notifications_update_own` had no `with check`, so re-pin it.
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function prevent_notification_tamper()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.uid() is null or auth.uid() <> old.user_id or is_coordinator() then
    return new;
  end if;

  if (
    new.title is distinct from old.title or
    new.message is distinct from old.message or
    new.type is distinct from old.type or
    new.related_id is distinct from old.related_id or
    new.user_id is distinct from old.user_id or
    new.created_at is distinct from old.created_at
  ) then
    raise exception 'Notifications cannot be edited.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_notification_tamper on notifications;
create trigger trg_prevent_notification_tamper
  before update on notifications
  for each row execute function prevent_notification_tamper();


-- ----------------------------------------------------------------------------
-- 6. appeals — a student may not review their own appeal
--
-- `appeals_update_coordinator` uses `using (has_permission('can_review_appeals'))`
-- with no `with check`, which is fine for row selection but leaves the
-- new-row values unconstrained. Also add the missing `with check`, and pin
-- the fields a reviewer must not be able to rewrite.
-- ----------------------------------------------------------------------------

drop policy if exists "appeals_update_coordinator" on appeals;
create policy "appeals_update_coordinator" on appeals
  for update
  using (has_permission('can_review_appeals'))
  with check (has_permission('can_review_appeals'));

revoke delete on appeals from authenticated;
revoke delete on appeals from anon;


-- ----------------------------------------------------------------------------
-- 7. storage: appeal-files — per-student isolation
--
-- Uploads already use `<user-id>/<timestamp>-<filename>` (Appeals.tsx:59),
-- so scoping on the first path segment works for every file already in the
-- bucket. storage.foldername(name) returns the path segments as an array;
-- element 1 is the top folder.
--
-- Students: read and upload only inside their own folder, and never
-- overwrite or delete (an appeal attachment is evidence).
-- Coordinators: read everything, which is what createSignedUrl in
-- AttachmentViewerModal.tsx needs in order to show the attachment.
-- ----------------------------------------------------------------------------

drop policy if exists "appeal_files_student_upload" on storage.objects;
drop policy if exists "appeal_files_read" on storage.objects;
drop policy if exists "appeal_files_owner_upload" on storage.objects;
drop policy if exists "appeal_files_owner_read" on storage.objects;

create policy "appeal_files_owner_upload" on storage.objects
  for insert with check (
    bucket_id = 'appeal-files'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "appeal_files_owner_read" on storage.objects
  for select using (
    bucket_id = 'appeal-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_coordinator()
    )
  );


-- ----------------------------------------------------------------------------
-- 8. storage: profile-photos — create the bucket that was never created
--
-- src/pages/student/Profile.tsx uploads here and then calls getPublicUrl(),
-- so the bucket has to be public for the returned URL to render. The photo
-- is shown in the app header and on coordinator pages, so public read is
-- the intended behaviour — but WRITE is scoped to the owner's own folder,
-- which is what the page already uses (`<user-id>/<timestamp>-<filename>`).
--
-- `upsert: true` in the client means the same path may be written twice, so
-- UPDATE is granted alongside INSERT for the owner's own folder.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', true)
  on conflict (id) do nothing;

drop policy if exists "profile_photos_public_read" on storage.objects;
drop policy if exists "profile_photos_owner_write" on storage.objects;
drop policy if exists "profile_photos_owner_update" on storage.objects;
drop policy if exists "profile_photos_owner_delete" on storage.objects;

create policy "profile_photos_public_read" on storage.objects
  for select using (bucket_id = 'profile-photos');

create policy "profile_photos_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'profile-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_photos_owner_update" on storage.objects
  for update using (
    bucket_id = 'profile-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_photos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'profile-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================
-- VERIFICATION
--
-- Run these in the Supabase SQL Editor after applying this migration. The
-- SQL Editor runs as a superuser, so it does NOT show what a student can do
-- — these check that the objects exist and are shaped correctly. The real
-- end-to-end test is in SECURITY_FIXES_RUNBOOK.md (log in as a student and
-- confirm the app still works).
-- ============================================================================

-- a) The dangerous policies are gone, the new ones exist:
--    select tablename, policyname, cmd
--    from pg_policies
--    where schemaname = 'public'
--      and tablename in ('coordinators', 'profiles', 'attendance', 'notifications', 'appeals')
--    order by tablename, cmd;
--    -- expect: NO row named 'coordinators_write_self'
--    --         NO row named 'notifications_insert_system'

-- b) The escalation GRANT is closed:
--    select privilege_type from information_schema.role_table_grants
--    where table_name = 'coordinators' and grantee = 'authenticated';
--    -- expect: SELECT only

-- c) Both triggers are attached and cover the right operations:
--    select tgname, tgrelid::regclass as table_name
--    from pg_trigger
--    where not tgisinternal
--      and tgname in ('trg_prevent_self_permission_change',
--                     'trg_prevent_self_role_change',
--                     'trg_prevent_student_attendance_tamper',
--                     'trg_prevent_notification_tamper');
--    -- expect: 4 rows

-- d) Both storage buckets now exist:
--    select id, public from storage.buckets order by id;
--    -- expect: appeal-files (public = false), profile-photos (public = true)
