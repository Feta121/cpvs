// Supabase Edge Function: mark-absences
//
// Run once per day (scheduled via pg_cron, see supabase/cron.sql) after the
// last valid check-in window has closed (e.g. 23:30 local time, or shortly
// after the hospital's 3:00 PM cutoff if you don't want same-day corrections
// possible). For every active rotation, if the target date:
//   - falls within the rotation's start/end range,
//   - is a day the student was expected in clinic (see `isExpectedDay` below),
//   - has no practice_exceptions entry (holiday / closure / cancelled),
//   - and has no existing attendance row,
// it inserts an `absent` attendance record and notifies the student and
// their coordinator. Existing records (including manual coordinator
// corrections) are never touched.
//
// Deploy with:
//   supabase functions deploy mark-absences
//
// Invoke manually for a backfill / specific date with:
//   supabase functions invoke mark-absences --body '{"date":"2026-07-18"}'
// (omit body to default to "yesterday", which is what the daily cron uses).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * A student is "expected" on a given date if either:
 *  - the rotation has explicit `schedules` rows and this date is one of them, or
 *  - the rotation has NO schedules rows at all, in which case we fall back to
 *    "every weekday (Mon–Fri) within the rotation's date range".
 *
 * This lets institutions that plan exact clinical days use `schedules`, while
 * still working out of the box for rotations that never populate it.
 */
function isWeekday(dateStr: string) {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  return day !== 0 && day !== 6;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body?.date ?? isoDate(new Date(Date.now() - 86400000));
    } catch {
      targetDate = isoDate(new Date(Date.now() - 86400000)); // default: yesterday
    }

    // 1. Active rotations covering the target date.
    const { data: rotations, error: rotationsError } = await admin
      .from('rotations')
      .select('id, student_id, hospital_id, coordinator_id, start_date, end_date')
      .eq('status', 'active')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate);
    if (rotationsError) throw rotationsError;
    if (!rotations || rotations.length === 0) {
      return json({ date: targetDate, checked: 0, marked_absent: 0 });
    }

    // 2. Global + hospital-specific exceptions for this date.
    const { data: exceptions } = await admin
      .from('practice_exceptions')
      .select('hospital_id')
      .eq('date', targetDate);
    const exemptHospitalIds = new Set((exceptions ?? []).map((e) => e.hospital_id)); // includes `null` = global
    const hasGlobalException = (exceptions ?? []).some((e) => e.hospital_id === null);

    // 3. Rotation ids that have explicit scheduled days defined at all.
    const rotationIds = rotations.map((r) => r.id);
    const { data: scheduleRows } = await admin
      .from('schedules')
      .select('rotation_id, date')
      .in('rotation_id', rotationIds);
    const scheduledDatesByRotation = new Map<string, Set<string>>();
    for (const row of scheduleRows ?? []) {
      if (!scheduledDatesByRotation.has(row.rotation_id)) scheduledDatesByRotation.set(row.rotation_id, new Set());
      scheduledDatesByRotation.get(row.rotation_id)!.add(row.date);
    }

    // 4. Existing attendance rows for this date, so we never double-insert.
    const { data: existing } = await admin.from('attendance').select('student_id').eq('date', targetDate);
    const alreadyRecorded = new Set((existing ?? []).map((a) => a.student_id));

    let markedAbsent = 0;
    const toInsert: any[] = [];
    const notifications: any[] = [];

    for (const rotation of rotations) {
      if (alreadyRecorded.has(rotation.student_id)) continue;
      if (hasGlobalException || exemptHospitalIds.has(rotation.hospital_id)) continue;

      const explicitSchedule = scheduledDatesByRotation.get(rotation.id);
      const expected = explicitSchedule ? explicitSchedule.has(targetDate) : isWeekday(targetDate);
      if (!expected) continue;

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
      markedAbsent = toInsert.length;

      const { error: notifyError } = await admin.from('notifications').insert(notifications);
      if (notifyError) throw notifyError;
    }

    return json({ date: targetDate, checked: rotations.length, marked_absent: markedAbsent });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
