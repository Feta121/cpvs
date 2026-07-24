// Supabase Edge Function: mark-absences
//
// For every active rotation whose hospital's session_expires_at cutoff has
// passed (Africa/Addis_Ababa time), and who has no attendance row yet today,
// and today is an expected clinical day for them, inserts an `absent` row
// and notifies student + coordinator.
//
// "Expected clinical day" logic, in order:
//   1. If the rotation has explicit `schedules` rows, only those dates count.
//   2. Otherwise, Monday/Tuesday/Wednesday count by default.
//   3. A matching `special_practice_days` row FORCES the day to count, even
//      outside Mon/Tue/Wed (e.g. a coordinator-added makeup day).
//   4. A matching `practice_exceptions` row EXCLUDES the day, even if it
//      would otherwise count (holiday/closure/cancellation).
// Both exceptions and special days can be scoped to a hospital, a batch,
// and/or a specific student — within one row, every non-null field must
// match (AND); across rows, any single match applies (OR).
//
// Schedule this every 15–30 minutes (see supabase/cron.sql) since different
// hospitals can have different session_expires_at cutoffs.
//
// Deploy with:
//   supabase functions deploy mark-absences
//
// Test/backfill a specific date (bypasses the cutoff-time check):
//   supabase functions invoke mark-absences --body '{"date":"2026-07-18"}'
//
// DEBUGGING "it's not marking anyone absent": the response now includes a
// `skipped` breakdown — e.g. { already_recorded: 2, not_expected_day: 5,
// exception_applies: 1, before_cutoff: 3 }. If everything piles up under
// `not_expected_day`, you're testing on a Thu–Sun with no special day added.
// If it's all `before_cutoff`, the hospital's session_expires_at hasn't
// passed yet in Addis Ababa time — use a manual `{"date": "..."}` call to
// bypass that and confirm the rest of the logic works.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADDIS_OFFSET_HOURS = 3; // Africa/Addis_Ababa is UTC+3 year-round, no DST.

function addisNow(): Date {
  return new Date(Date.now() + ADDIS_OFFSET_HOURS * 60 * 60 * 1000);
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function timeOfDayMinutes(d: Date) {
  return d.getUTCHours() * 60 + d.getUTCMinutes(); // `d` here is already Addis-shifted
}

function timeStringToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Clinical practice runs Monday, Tuesday, and Wednesday by default. */
function isClinicalDay(dateStr: string) {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun ... 6=Sat
  return day === 1 || day === 2 || day === 3;
}

interface ScopedRow {
  hospital_id: string | null;
  batch: string | null;
  student_id: string | null;
}

/** A scoped row (exception or special day) applies to this rotation if
 * every non-null field on the row matches. */
function matchesScope(row: ScopedRow, hospitalId: string, batch: string, studentId: string) {
  if (row.hospital_id !== null && row.hospital_id !== hospitalId) return false;
  if (row.batch !== null && row.batch !== batch) return false;
  if (row.student_id !== null && row.student_id !== studentId) return false;
  return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let targetDate: string;
    let isManualCall = false;
    try {
      const body = await req.json();
      if (body?.date) {
        targetDate = body.date;
        isManualCall = true;
      } else {
        targetDate = isoDate(addisNow());
      }
    } catch {
      targetDate = isoDate(addisNow());
    }

    const nowMinutes = timeOfDayMinutes(addisNow());

    // 1. Active rotations covering the target date, joined to their
    //    hospital's cutoff time and the student's batch (needed for scope
    //    matching below).
    const { data: rotations, error: rotationsError } = await admin
      .from('rotations')
      .select('id, student_id, hospital_id, coordinator_id, start_date, end_date, hospital:hospitals(session_expires_at), student:students(batch)')
      .eq('status', 'active')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate);
    if (rotationsError) throw rotationsError;
    if (!rotations || rotations.length === 0) {
      return json({ date: targetDate, checked: 0, marked_absent: 0, skipped: {} });
    }

    // 2. Exceptions and special practice days for this date (both scopable
    //    to hospital/batch/student — see matchesScope above).
    const { data: exceptions } = await admin
      .from('practice_exceptions')
      .select('hospital_id, batch, student_id')
      .eq('date', targetDate);
    const { data: specialDays } = await admin
      .from('special_practice_days')
      .select('hospital_id, batch, student_id')
      .eq('date', targetDate);

    // 3. Explicit per-rotation schedules, if any rotations use them.
    const rotationIds = rotations.map((r) => r.id);
    const { data: scheduleRows } = await admin.from('schedules').select('rotation_id, date').in('rotation_id', rotationIds);
    const scheduledDatesByRotation = new Map<string, Set<string>>();
    for (const row of scheduleRows ?? []) {
      if (!scheduledDatesByRotation.has(row.rotation_id)) scheduledDatesByRotation.set(row.rotation_id, new Set());
      scheduledDatesByRotation.get(row.rotation_id)!.add(row.date);
    }

    // 4. Existing attendance rows for this date, so we never double-insert.
    const { data: existing } = await admin.from('attendance').select('student_id').eq('date', targetDate);
    const alreadyRecorded = new Set((existing ?? []).map((a) => a.student_id));

    const toInsert: any[] = [];
    const notifications: any[] = [];
    const skipped = { already_recorded: 0, not_expected_day: 0, exception_applies: 0, before_cutoff: 0 };

    for (const rotation of rotations as any[]) {
      const batch: string = rotation.student?.batch ?? '';

      if (alreadyRecorded.has(rotation.student_id)) {
        skipped.already_recorded++;
        continue;
      }

      const exceptionApplies = (exceptions ?? []).some((e) => matchesScope(e, rotation.hospital_id, batch, rotation.student_id));
      if (exceptionApplies) {
        skipped.exception_applies++;
        continue;
      }

      const explicitSchedule = scheduledDatesByRotation.get(rotation.id);
      const specialDayApplies = (specialDays ?? []).some((s) => matchesScope(s, rotation.hospital_id, batch, rotation.student_id));
      const expected = explicitSchedule
        ? explicitSchedule.has(targetDate)
        : specialDayApplies || isClinicalDay(targetDate);
      if (!expected) {
        skipped.not_expected_day++;
        continue;
      }

      // Skip if this hospital's cutoff hasn't passed yet today — unless this
      // is a manual/backfill call, which always applies regardless of time.
      const cutoffStr: string = rotation.hospital?.session_expires_at ?? '15:00:00';
      if (!isManualCall && nowMinutes < timeStringToMinutes(cutoffStr)) {
        skipped.before_cutoff++;
        continue;
      }

      toInsert.push({
        student_id: rotation.student_id,
        rotation_id: rotation.id,
        hospital_id: rotation.hospital_id,
        date: targetDate,
        status: 'absent',
      });

      notifications.push({
        user_id: rotation.student_id,
        title: 'Marked absent',
        message: `You were marked absent for ${targetDate}. If this is incorrect, submit an appeal.`,
        type: 'attendance_warning',
      });
      notifications.push({
        user_id: rotation.coordinator_id,
        title: 'Student marked absent',
        message: `A student in your rotation was marked absent for ${targetDate}.`,
        type: 'attendance_warning',
      });
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await admin.from('attendance').insert(toInsert);
      if (insertError) throw insertError;

      const { error: notifyError } = await admin.from('notifications').insert(notifications);
      if (notifyError) throw notifyError;
    }

    return json({ date: targetDate, checked: rotations.length, marked_absent: toInsert.length, skipped });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
