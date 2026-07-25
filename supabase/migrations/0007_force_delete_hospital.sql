-- ============================================================================
-- Migration 0007 — force-delete a hospital (with existing history)
--
-- Normal hospital deletion is blocked by foreign keys on purpose (rotations
-- and attendance both reference hospitals with no ON DELETE CASCADE), so
-- attendance history is never silently orphaned by an accidental delete.
-- This adds an explicit, opt-in escape hatch: a coordinator can choose to
-- force-delete a hospital anyway, which deliberately removes every
-- rotation/attendance/schedule/appeal tied to it first.
--
-- SAFETY: purely additive (one new function). The default delete path is
-- UNCHANGED — this only runs when a coordinator explicitly confirms the
-- force-delete option in the UI after the normal delete is blocked.
-- ============================================================================

create or replace function force_delete_hospital(target_hospital_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not is_coordinator() then
    raise exception 'Only coordinators can force-delete a hospital.';
  end if;

  -- Appeals reference attendance, which references rotations/hospitals —
  -- delete in dependency order so nothing is left orphaned.
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

grant execute on function force_delete_hospital(uuid) to authenticated;

-- Verification: after calling, confirm nothing references the old id:
--   select count(*) from rotations where hospital_id = '<old-id>';   -- 0
--   select count(*) from attendance where hospital_id = '<old-id>';  -- 0
