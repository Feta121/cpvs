-- ============================================================================
-- Migration 0011 — identify the student in coordinator-facing notifications
--
-- The "Student flagged: Late Attendance Concern" notification sent to
-- coordinators just said "A student in your rotation..." with no way to
-- tell who. This looks up the student's name (profiles), batch (students),
-- and current hospital (via the rotation) and includes them directly in
-- the message.
--
-- SAFETY: replaces one function's body only (`create or replace`, same
-- signature) — no table, column, or existing row is touched. The
-- student-facing notification in the same trigger is unchanged.
-- ============================================================================

create or replace function check_late_attendance_concern()
returns trigger
language plpgsql
security definer
as $$
declare
  late_count int;
  rot rotations%rowtype;
  student_name text;
  student_batch text;
  hospital_name text;
begin
  if new.status in ('late', 'very_late') then
    select count(*) into late_count
    from attendance
    where rotation_id = new.rotation_id
      and student_id = new.student_id
      and status in ('late', 'very_late');

    if late_count > 4 then
      update students set late_attendance_concern = true where id = new.student_id;

      select * into rot from rotations where id = new.rotation_id;

      select p.full_name, s.batch, h.name
        into student_name, student_batch, hospital_name
      from students s
      join profiles p on p.id = s.id
      left join hospitals h on h.id = rot.hospital_id
      where s.id = new.student_id;

      insert into notifications (user_id, title, message, type, related_id)
      values (
        new.student_id,
        'Late Attendance Concern',
        'You have been flagged for exceeding 4 late attendances in this rotation.',
        'late_concern',
        new.rotation_id
      );

      insert into notifications (user_id, title, message, type, related_id)
      values (
        rot.coordinator_id,
        'Student flagged: Late Attendance Concern',
        coalesce(student_name, 'A student') || ' (Batch ' || coalesce(student_batch, 'unknown') || ') at ' ||
          coalesce(hospital_name, 'their hospital') || ' has exceeded 4 late attendances in this rotation.',
        'late_concern',
        new.rotation_id
      );
    end if;
  end if;
  return new;
end;
$$;

-- Verification: trigger a late/very_late attendance update for a student
-- with 5+ existing late records and confirm the coordinator's notification
-- reads "Kedir Hassen (Batch 2015) at St. Paul's Hospital ..." instead of
-- the old generic text.
