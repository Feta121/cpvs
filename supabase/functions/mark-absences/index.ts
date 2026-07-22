// Supabase Edge Function: mark-absences
//
// CHANGED: this used to run once nightly and only ever mark *yesterday*
// absent. Per spec ("after 3pm ... mark absent, even if configurable"),
// absence now needs to be marked shortly after each hospital's own cutoff
// time on the SAME day — not the next day. So this function now:
//   1. Computes "today" and the current time-of-day in Africa/Addis_Ababa
//      (UTC+3, no DST — safe to hardcode the offset).
//   2. For every active rotation whose hospital's `session_expires_at` has
//      already passed (in Addis Ababa local time), and who has no attendance
//      row yet for today, and today isn't a practice_exceptions day, inserts
//      an `absent` row and notifies student + coordinator.
//
// Schedule this to run every 15–30 minutes (see supabase/cron.sql) so each
// hospital's cutoff is caught close to when it actually happens, since
// different hospitals can have different session_expires_at values.
//
// Deploy with:
//   supabase functions deploy mark-absences
//
// Manually test/backfill a specific date with:
//   supabase functions invoke mark-absences --body '{"date":"2026-07-18"}'
// (omitting the time-of-day check — a manual/backfill call always applies,
// regardless of current time, since you're asking for it explicitly.)

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

function isWeekday(dateStr: string) {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  return day !== 0 && day !== 6;
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
    //    hospital's cutoff time.
    const { data: rotations, error: rotationsError } = await admin
      .from('rotations')
      .select('id, student_id, hospital_id, coordinator_id, start_date, end_date, hospital:hospitals(session_expires_at)')
      .eq('status', 'active')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate);
    if (rotationsError) throw rotationsError;
    if (!rotations || rotations.length === 0) {
      return json({ date: targetDate, checked: 0, marked_absent: 0 });
    }

    // 2. Global + hospital-specific exceptions for this date.
    const { data: exceptions } = await admin.from('practice_exceptions').select('hospital_id').eq('date', targetDate);
    const exemptHospitalIds = new Set((exceptions ?? []).map((e) => e.hospital_id));
    const hasGlobalException = (exceptions ?? []).some((e) => e.hospital_id === null);

    // 3. Explicit scheduled days, if any rotations use them.
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

    for (const rotation of rotations as any[]) {
      if (alreadyRecorded.has(rotation.student_id)) continue;
      if (hasGlobalException || exemptHospitalIds.has(rotation.hospital_id)) continue;

      const explicitSchedule = scheduledDatesByRotation.get(rotation.id);
      const expected = explicitSchedule ? explicitSchedule.has(targetDate) : isWeekday(targetDate);
      if (!expected) continue;

      // Skip if this hospital's cutoff hasn't passed yet today — unless this
      // is a manual/backfill call, which always applies regardless of time.
      const cutoffStr: string = rotation.hospital?.session_expires_at ?? '15:00:00';
      if (!isManualCall && nowMinutes < timeStringToMinutes(cutoffStr)) continue;

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

    return json({ date: targetDate, checked: rotations.length, marked_absent: toInsert.length });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
