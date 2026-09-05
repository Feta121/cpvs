-- ============================================================================
-- Migration 0016 — move check-in and check-out onto the server
--
-- ⚠ ORDERING WARNING — READ THIS FIRST ⚠
--
-- This migration REMOVES the student's ability to write to the `attendance`
-- table directly. The current version of src/pages/student/Attendance.tsx
-- does exactly that. So this migration and the matching frontend build have
-- to go live TOGETHER:
--
--     1. Apply migration 0014 (biometric check-in — safe on its own,
--        already deployed independently if it's live)
--     2. Apply migration 0015 (safe on its own, deploy any time)
--     3. Apply THIS migration
--     4. Immediately deploy the updated frontend, which calls the
--        check_in() / check_out() functions created below
--
-- Between steps 3 and 4, student check-in will fail with a permissions
-- error. Keep that gap to minutes, and do it outside clinical hours
-- (before the earliest hospital `checkin_start_time`, or after the latest
-- `session_expires_at`). SECURITY_FIXES_RUNBOOK.md walks through this.
--
-- ----------------------------------------------------------------------------
-- RECONCILED WITH MIGRATION 0014 (BIOMETRIC CHECK-IN VERIFICATION)
--
-- Migration 0014 added a second factor at check-in (fingerprint/Face ID via
-- WebAuthn, or a selfie match) on top of geofencing, enforced there by an
-- `attendance_insert_own` RLS policy that only allowed the INSERT if a fresh
-- `checkin_verification_pass` existed on the student's row. Part 7 below
-- drops that policy entirely — the client can no longer INSERT at all — so
-- that enforcement point is gone. check_in() below reimplements the same
-- check at the top of its own body instead (see step 5a), so the biometric
-- requirement carries over unchanged: no verification pass, no check-in,
-- regardless of geofence or schedule. check_in() also now accepts the same
-- audit columns (`verified_method`, `checkin_selfie_url`,
-- `face_match_distance`) that the old direct INSERT used to send, and the
-- existing `trg_consume_checkin_verification_pass` trigger from migration
-- 0014 still fires AFTER INSERT regardless of who performed it, so the pass
-- is consumed exactly as before — no change needed there.
--
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS
--
-- Every attendance decision was made in the browser and then trusted:
--
--   * `status` ('present' / 'late' / 'very_late') was computed by
--     resolveAttendanceStatus() in src/utils/geofence.ts and sent as a plain
--     column value in the INSERT.
--   * `check_in_lat` / `check_in_lng` were whatever the browser said they
--     were. The geofence check that compares them to the hospital's
--     coordinates ran in the browser too, and its result was never
--     re-checked by anything.
--   * `date` and `check_in_time` were taken from the device clock.
--
-- The RLS policy `attendance_insert_own` only verified that the row's
-- student_id matched the caller. So any student able to open their browser's
-- developer tools — or any student who simply changed their phone's clock or
-- used a location-spoofing app, which needs no technical skill at all —
-- could record themselves 'present', at any hospital, on any date, from
-- anywhere in the world. For an attendance system whose entire purpose is
-- verifying physical presence, that is the single most important thing to
-- fix, and it cannot be fixed in the browser: whatever the browser decides,
-- the browser's owner can change.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS DOES
--
-- Creates two SECURITY DEFINER functions, check_in() and check_out(), which
-- take only a latitude and longitude and decide everything else themselves,
-- inside the database:
--
--   * the date and the time come from the server clock, converted to
--     Africa/Addis_Ababa by Postgres's own timezone database (not by adding
--     3 hours by hand, which is what the mark-absences function does)
--   * the rotation and hospital are looked up from the caller's own records
--   * the distance to the hospital is recalculated server-side and rejected
--     if it exceeds that hospital's radius
--   * the status is derived from the hospital's own checkin_start_time and
--     session_expires_at
--   * whether today is even a clinical day is re-checked, using the same
--     rules as the mark-absences job (exceptions, per-rotation schedules,
--     special practice days, weekly config)
--
-- The client keeps its own copy of the geofence maths for the live "you are
-- 40m away" preview — that part is a convenience and is fine in the browser.
-- It just no longer decides anything that gets stored.
--
-- The status thresholds are unchanged from src/utils/geofence.ts, so no
-- student's attendance is graded differently after this than before:
--   before checkin_start_time            -> present
--   within the hour after it             -> late
--   from then until session_expires_at   -> very_late
--   at or after session_expires_at       -> check-in refused
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Time helpers — one definition of "now, in Addis Ababa"
--
-- `now() at time zone 'Africa/Addis_Ababa'` asks Postgres's timezone
-- database, which is authoritative and needs no maintenance. Ethiopia is
-- UTC+3 with no daylight saving, so this happens to equal a fixed +3 offset
-- today — but expressing it as the zone name means it stays correct if that
-- ever changes, and it documents the intent.
-- ----------------------------------------------------------------------------

create or replace function addis_now()
returns timestamp
language sql
stable
as $$
  select (now() at time zone 'Africa/Addis_Ababa');
$$;

create or replace function addis_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Africa/Addis_Ababa')::date;
$$;

grant execute on function addis_now() to authenticated;
grant execute on function addis_today() to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Geofence distance — the same Haversine formula as src/utils/geofence.ts
--
-- Kept as plain trigonometry rather than PostGIS so this migration has no
-- extension dependency. Accurate to well under a metre at the scale of a
-- hospital campus, which is all that matters here.
-- ----------------------------------------------------------------------------

create or replace function haversine_meters(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * atan2(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    ),
    sqrt(
      1 - (
        sin(radians(lat2 - lat1) / 2) ^ 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
      )
    )
  );
$$;


-- ----------------------------------------------------------------------------
-- 3. Status resolution — server-side twin of resolveAttendanceStatus()
--
-- Returns NULL to mean "check-in is closed", matching the client's
-- `canCheckIn: false` case. Works in whole minutes since midnight so that a
-- start time late in the day cannot make the "one hour later" threshold wrap
-- past midnight and land before the start (JavaScript's Date rolls over into
-- the next day instead; clamping to 24:00 keeps the two implementations in
-- agreement for every realistic configuration).
-- ----------------------------------------------------------------------------

create or replace function resolve_attendance_status(
  p_local_time time,
  p_start time,
  p_expires time
)
returns text
language plpgsql
immutable
as $$
declare
  v_now_min int;
  v_start_min int;
  v_late_min int;
  v_expiry_min int;
begin
  v_now_min := extract(hour from p_local_time)::int * 60 + extract(minute from p_local_time)::int;
  v_start_min := extract(hour from p_start)::int * 60 + extract(minute from p_start)::int;
  v_expiry_min := extract(hour from p_expires)::int * 60 + extract(minute from p_expires)::int;
  v_late_min := least(v_start_min + 60, 1440);

  if v_now_min < v_start_min then
    return 'present';
  elsif v_now_min < v_late_min then
    return 'late';
  elsif v_now_min < v_expiry_min then
    return 'very_late';
  else
    return null; -- session closed
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. "Is today a clinical day for this student?"
--
-- One authoritative implementation of the rule that currently exists in
-- three places (the mark-absences Edge Function, the student check-in page,
-- and nowhere in the database at all). Precedence, highest first:
--
--   1. A matching practice_exceptions row EXCLUDES the day (holiday,
--      closure, cancellation) — always wins.
--   2. If the rotation has explicit `schedules` rows, ONLY those dates count.
--   3. A matching special_practice_days row FORCES the day to count.
--   4. Otherwise the weekly clinical_days_config row decides (migration
--      0006, defaults to Mon/Tue/Wed).
--
-- Scoped rows (exceptions and special days) match when every one of their
-- non-null hospital_id / batch / student_id fields matches this student —
-- identical to matchesScope() in the TypeScript.
-- ----------------------------------------------------------------------------

create or replace function is_expected_clinical_day(
  p_rotation_id uuid,
  p_hospital_id uuid,
  p_student_id uuid,
  p_batch text,
  p_date date
)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_has_explicit_schedule boolean;
  v_day_key text;
  v_config_says boolean;
begin
  -- 1. Exceptions always win.
  if exists (
    select 1 from practice_exceptions e
    where e.date = p_date
      and (e.hospital_id is null or e.hospital_id = p_hospital_id)
      and (e.batch is null or e.batch = p_batch)
      and (e.student_id is null or e.student_id = p_student_id)
  ) then
    return false;
  end if;

  -- 2. An explicit per-rotation schedule, if one exists, is exhaustive.
  select exists (select 1 from schedules s where s.rotation_id = p_rotation_id)
    into v_has_explicit_schedule;

  if v_has_explicit_schedule then
    return exists (
      select 1 from schedules s where s.rotation_id = p_rotation_id and s.date = p_date
    );
  end if;

  -- 3. A special practice day forces the day on.
  if exists (
    select 1 from special_practice_days d
    where d.date = p_date
      and (d.hospital_id is null or d.hospital_id = p_hospital_id)
      and (d.batch is null or d.batch = p_batch)
      and (d.student_id is null or d.student_id = p_student_id)
  ) then
    return true;
  end if;

  -- 4. Fall back to the weekly configuration. extract(dow) is 0=Sunday..6=Saturday,
  --    the same numbering the TypeScript uses with Date.getDay().
  v_day_key := (array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])[
    extract(dow from p_date)::int + 1
  ];

  select (to_jsonb(c) ->> v_day_key)::boolean
    into v_config_says
    from clinical_days_config c
   where c.id = true;

  -- If the config row is somehow missing, fall back to Mon/Tue/Wed — the
  -- original hardcoded default, so behaviour never silently widens.
  if v_config_says is null then
    return v_day_key in ('monday', 'tuesday', 'wednesday');
  end if;

  return v_config_says;
end;
$$;

grant execute on function is_expected_clinical_day(uuid, uuid, uuid, text, date) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. check_in(latitude, longitude)
--
-- The only way a student records attendance from now on. Everything except
-- the two coordinates is decided here.
--
-- Errors are raised with messages written for the student to read directly —
-- the frontend shows `error.message` as-is.
-- ----------------------------------------------------------------------------

create or replace function check_in(
  p_lat double precision,
  p_lng double precision,
  -- Added when reconciling with migration 0014 (biometric check-in). These
  -- are audit trail only — same fields the old direct client INSERT used to
  -- send — never the security decision itself. The security decision is the
  -- pass-expiry check a few lines below, which cannot be skipped by simply
  -- omitting these parameters.
  p_verified_method text default null,
  p_selfie_path text default null,
  p_face_match_distance numeric default null
)
returns attendance
language plpgsql
security definer
as $$
declare
  v_uid uuid := auth.uid();
  v_batch text;
  v_rotation rotations;
  v_hospital hospitals;
  v_today date;
  v_local time;
  v_distance double precision;
  v_status text;
  v_row attendance;
begin
  if v_uid is null then
    raise exception 'You are not signed in. Please log in again.';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'Your location could not be read. Enable location access and try again.';
  end if;

  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Your location could not be read. Enable location access and try again.';
  end if;

  select s.batch into v_batch from students s where s.id = v_uid;
  if not found then
    raise exception 'Only students can check in.';
  end if;

  -- Migration 0014's biometric requirement, reimplemented here now that
  -- this function is the only INSERT path left (see the note at the top of
  -- this migration). webauthn-checkin-verify / selfie-verify set this pass
  -- on success, valid for 60 seconds; nothing else can set it, so there is
  -- no way to reach this point without a device or a matching selfie.
  if not exists (
    select 1 from students s
    where s.id = v_uid
      and s.checkin_verification_pass_expires is not null
      and s.checkin_verification_pass_expires > now()
  ) then
    raise exception 'Biometric verification required. Please verify your fingerprint, Face ID, or selfie before checking in.';
  end if;

  v_today := addis_today();

  -- Deliberately ordered-and-limited rather than "exactly one": the old page
  -- used .maybeSingle(), which THROWS if a student somehow has two active
  -- rotations covering the same date, breaking check-in entirely for them.
  -- Picking the most recently started rotation keeps them working.
  select r.* into v_rotation
    from rotations r
   where r.student_id = v_uid
     and r.status = 'active'
     and r.start_date <= v_today
     and r.end_date >= v_today
   order by r.start_date desc, r.created_at desc
   limit 1;
  if not found then
    raise exception 'You do not have an active rotation for today. Contact your coordinator.';
  end if;

  select h.* into v_hospital from hospitals h where h.id = v_rotation.hospital_id;
  if not found then
    raise exception 'Your rotation has no valid hospital assigned. Contact your coordinator.';
  end if;

  if not is_expected_clinical_day(v_rotation.id, v_hospital.id, v_uid, coalesce(v_batch, ''), v_today) then
    raise exception 'Today is not a scheduled clinical day, so there is nothing to check in for.';
  end if;

  if exists (
    select 1 from attendance a
     where a.student_id = v_uid and a.date = v_today and a.check_in_time is not null
  ) then
    raise exception 'You have already checked in today.';
  end if;

  v_distance := haversine_meters(p_lat, p_lng, v_hospital.latitude, v_hospital.longitude);
  if v_distance > v_hospital.radius_meters then
    raise exception 'You are % metres from %. You must be within % metres to check in.',
      round(v_distance)::int, v_hospital.name, v_hospital.radius_meters;
  end if;

  v_local := addis_now()::time;
  v_status := resolve_attendance_status(v_local, v_hospital.checkin_start_time, v_hospital.session_expires_at);
  if v_status is null then
    raise exception 'Check-in for % closed at %.',
      v_hospital.name, to_char(v_hospital.session_expires_at, 'HH24:MI');
  end if;

  -- Tell the tamper-prevention trigger from migration 0015 that this write
  -- is the trusted server-side path. `true` makes the setting transaction-
  -- local, so it is gone the moment this call finishes.
  perform set_config('cpvs.trusted_write', 'on', true);

  -- ON CONFLICT covers the narrow race where the mark-absences job inserted
  -- an 'absent' row for today moments before the student checked in. In that
  -- case the real check-in should win — but never over a record a
  -- coordinator has already corrected by hand, hence the WHERE clause.
  insert into attendance (
    student_id, rotation_id, hospital_id, date,
    check_in_time, check_in_lat, check_in_lng, status,
    verified_method, checkin_selfie_url, face_match_distance
  ) values (
    v_uid, v_rotation.id, v_hospital.id, v_today,
    now(), p_lat, p_lng, v_status,
    p_verified_method, p_selfie_path, p_face_match_distance
  )
  on conflict (student_id, date) do update set
    rotation_id          = excluded.rotation_id,
    hospital_id           = excluded.hospital_id,
    check_in_time         = excluded.check_in_time,
    check_in_lat          = excluded.check_in_lat,
    check_in_lng          = excluded.check_in_lng,
    status                = excluded.status,
    verified_method       = excluded.verified_method,
    checkin_selfie_url    = excluded.checkin_selfie_url,
    face_match_distance   = excluded.face_match_distance
  where attendance.check_in_time is null
    and attendance.corrected_by is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Today''s attendance has already been recorded by a coordinator. Submit an appeal if it is wrong.';
  end if;

  return v_row;
end;
$$;

grant execute on function check_in(double precision, double precision, text, text, numeric) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. check_out(latitude, longitude)
--
-- Same treatment: the timestamp is the server's, the geofence is re-checked,
-- and check-out cannot be replayed or applied to a day the student never
-- checked in for.
-- ----------------------------------------------------------------------------

create or replace function check_out(
  p_lat double precision,
  p_lng double precision
)
returns attendance
language plpgsql
security definer
as $$
declare
  v_uid uuid := auth.uid();
  v_hospital hospitals;
  v_today date;
  v_distance double precision;
  v_row attendance;
begin
  if v_uid is null then
    raise exception 'You are not signed in. Please log in again.';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'Your location could not be read. Enable location access and try again.';
  end if;

  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Your location could not be read. Enable location access and try again.';
  end if;

  v_today := addis_today();

  select a.* into v_row
    from attendance a
   where a.student_id = v_uid and a.date = v_today;
  if not found or v_row.check_in_time is null then
    raise exception 'You have not checked in today, so there is nothing to check out of.';
  end if;

  if v_row.check_out_time is not null then
    raise exception 'You have already checked out today.';
  end if;

  select h.* into v_hospital from hospitals h where h.id = v_row.hospital_id;
  if not found then
    raise exception 'Your rotation has no valid hospital assigned. Contact your coordinator.';
  end if;

  v_distance := haversine_meters(p_lat, p_lng, v_hospital.latitude, v_hospital.longitude);
  if v_distance > v_hospital.radius_meters then
    raise exception 'You are % metres from %. You must be within % metres to check out.',
      round(v_distance)::int, v_hospital.name, v_hospital.radius_meters;
  end if;

  perform set_config('cpvs.trusted_write', 'on', true);

  update attendance set
    check_out_time = now(),
    check_out_lat  = p_lat,
    check_out_lng  = p_lng
  where id = v_row.id
    and check_out_time is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'You have already checked out today.';
  end if;

  return v_row;
end;
$$;

grant execute on function check_out(double precision, double precision) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Take away the direct write paths the functions above replace
--
-- After this point the ONLY ways an attendance row can be created or changed
-- are: check_in(), check_out(), a coordinator with the right permission, and
-- the mark-absences job (service-role key, bypasses RLS).
--
-- Both layers are closed: the RLS policy AND the table-level GRANT
-- underneath it, so a future policy mistake cannot silently reopen this.
-- ----------------------------------------------------------------------------

drop policy if exists "attendance_insert_own" on attendance;

drop policy if exists "attendance_update_own_or_coordinator" on attendance;
create policy "attendance_update_coordinator" on attendance
  for update
  using (
    has_permission('can_manage_attendance')
    or has_permission('can_review_appeals')
  )
  with check (
    has_permission('can_manage_attendance')
    or has_permission('can_review_appeals')
  );

revoke insert on attendance from authenticated;
revoke insert on attendance from anon;


-- ============================================================================
-- VERIFICATION
--
-- The SQL Editor runs as a superuser, so these confirm the objects exist and
-- behave; the real end-to-end test is checking in as a student from a phone
-- inside the geofence (see SECURITY_FIXES_RUNBOOK.md).
-- ============================================================================

-- a) All the functions were created:
--    select proname from pg_proc
--    where proname in ('addis_now','addis_today','haversine_meters',
--                      'resolve_attendance_status','is_expected_clinical_day',
--                      'check_in','check_out')
--    order by proname;
--    -- expect: 7 rows

-- b) The server agrees with your watch (should show Addis Ababa local time):
--    select addis_now(), addis_today();

-- c) Distance maths sanity check — two points ~111km apart (1 degree of
--    latitude), so this should print roughly 111195:
--    select round(haversine_meters(9.0, 38.7, 10.0, 38.7));

-- d) Status thresholds, for a hospital opening 09:00 and closing 15:00:
--    select resolve_attendance_status('08:30', '09:00', '15:00') as should_be_present,
--           resolve_attendance_status('09:30', '09:00', '15:00') as should_be_late,
--           resolve_attendance_status('12:00', '09:00', '15:00') as should_be_very_late,
--           resolve_attendance_status('15:30', '09:00', '15:00') as should_be_null;

-- e) Students can no longer write attendance directly:
--    select privilege_type from information_schema.role_table_grants
--    where table_name = 'attendance' and grantee = 'authenticated'
--    order by privilege_type;
--    -- expect: SELECT and UPDATE only (UPDATE stays for coordinators; the
--    --         RLS policy above is what limits it to them)
