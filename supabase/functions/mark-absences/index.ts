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
//
// ----------------------------------------------------------------------------
// AUTHORIZATION (added in the 0014/0015 security pass)
//
// This function had no caller check whatsoever. It uses the service-role key
// internally, so it bypasses RLS completely — which meant ANY valid login
// token was enough to invoke it, including a student's own session token.
// Supabase's default `verify_jwt = true` only proves the caller is signed in
// as *somebody*; it says nothing about who. A student could therefore call
// `{"date": "..."}` for any past date and have the function write 'absent'
// rows and "Marked absent" notifications for every other student in the
// system — a denial-of-service against classmates' records, and a way to
// generate real-looking notifications from the system itself.
//
// Two callers are legitimate, and both are now checked explicitly:
//   1. The pg_cron job in supabase/cron.sql, which authenticates with the
//      service-role key (see the Bearer token in that file).
//   2. A signed-in, active coordinator holding `can_manage_attendance` —
//      the "Check for missed check-ins" button and the date backfill on the
//      coordinator dashboard (CoordinatorDashboard.tsx:147 and :202).
// Everyone else gets a 403.

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

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Reads the coordinator-editable weekly schedule (migration 0006). Falls
 * back to Monday/Tuesday/Wednesday if the config row is somehow missing —
 * matching the original hardcoded default so behavior never regresses. */
async function isClinicalDay(admin: ReturnType<typeof createClient>, dateStr: string): Promise<boolean> {
  const { data } = await admin.from('clinical_days_config').select('*').eq('id', true).maybeSingle();
  const dayIndex = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun ... 6=Sat
  const key = DAY_KEYS[dayIndex];
  if (!data) return key === 'monday' || key === 'tuesday' || key === 'wednesday';
  return !!(data as any)[key];
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Added in migration 0017. Records the outcome of THIS call — success or
    // failure, with a reason — every time, not just on success. Without
    // this, a persistently failing cron call (most commonly: the
    // service_role key baked into supabase/cron.sql's Authorization header
    // no longer matches this project's current key) looks identical, from
    // `cron.job_run_details`, to a healthy one — that table only proves the
    // HTTP request was queued, not that it succeeded. Best-effort: if this
    // write itself fails, the original response still goes out unchanged.
    async function recordAttempt(ok: boolean, error?: string, markedCount?: number) {
      try {
        await admin.from('system_status').update({
          last_mark_absences_attempt: new Date().toISOString(),
          last_mark_absences_error: ok ? null : error ?? 'Unknown error',
          ...(ok ? { last_mark_absences_run: new Date().toISOString(), last_mark_absences_marked_count: markedCount ?? 0 } : {}),
        }).eq('id', true);
      } catch {
        // Nothing more useful to do — don't let a logging failure mask the
        // real response.
      }
    }

    // ------------------------------------------------------------------
    // Authorization. See the note at the top of this file.
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      await recordAttempt(false, 'Rejected: missing Authorization header.');
      return json({ error: 'Missing authorization header.' }, 401);
    }

    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isCronCaller = bearerToken === serviceRoleKey;

    if (!isCronCaller) {
      // A user token: resolve who it belongs to and require an active
      // coordinator with attendance permission. Same pattern as
      // create-student / delete-coordinator, which already do this correctly.
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await callerClient.auth.getUser();
      if (userError || !userData.user) {
        // If this is actually the cron job — a stale/rotated service_role
        // key would land here too, since it fails the isCronCaller check
        // above and then also fails as a user JWT — this is the single most
        // likely cause of a silently-stale "Last automatic check". See the
        // note at the top of this file and in migration 0017.
        await recordAttempt(false, 'Rejected: caller is neither the service-role key nor a valid session (check that the key in supabase/cron.sql matches this project\'s CURRENT service_role key — it may have been rotated since cron.sql was last set up).');
        return json({ error: 'Your session has expired. Please log in again.' }, 401);
      }

      const { data: callerCoordinator, error: callerCoordinatorError } = await admin
        .from('coordinators')
        .select('is_active, is_super_coordinator, can_manage_attendance')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (callerCoordinatorError) {
        await recordAttempt(false, `Rejected: could not verify caller permissions — ${callerCoordinatorError.message}`);
        return json({ error: 'Unable to verify your permissions. ' + callerCoordinatorError.message }, 500);
      }
      if (!callerCoordinator?.is_active) {
        await recordAttempt(false, 'Rejected: caller is not an active coordinator.');
        return json({ error: 'Only an active coordinator can run the absence check.' }, 403);
      }
      if (!callerCoordinator.is_super_coordinator && !callerCoordinator.can_manage_attendance) {
        await recordAttempt(false, 'Rejected: caller lacks can_manage_attendance.');
        return json({ error: "You don't have permission to run the absence check." }, 403);
      }
    }

    let targetDate: string;
    let isManualCall = false;
    try {
      const body = await req.json();
      if (body?.date) {
        // Validate the shape rather than trusting it: this value is used as a
        // date filter in several queries, and an unparseable string produced a
        // raw Postgres error rather than a readable message.
        if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
          return json({ error: 'Invalid date. Expected the format YYYY-MM-DD.' }, 400);
        }
        if (Number.isNaN(Date.parse(body.date + 'T00:00:00Z'))) {
          return json({ error: 'Invalid date. That day does not exist.' }, 400);
        }
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
      .select('id, student_id, hospital_id, coordinator_id, start_date, end_date, hospital:hospitals(session_expires_at, name), student:students(batch)')
      .eq('status', 'active')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate);
    if (rotationsError) throw rotationsError;
    if (!rotations || rotations.length === 0) {
      await recordAttempt(true, undefined, 0);
      return json({ date: targetDate, checked: 0, marked_absent: 0, skipped: {} });
    }

    // Student names live in `profiles`, not `students` — fetched as a flat
    // query (not a nested embed) so the coordinator-facing notification
    // below can name the student instead of saying "a student".
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', rotations.map((r) => r.student_id));
    const nameByStudentId = new Map((profileRows ?? []).map((p) => [p.id, p.full_name]));

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

    // 2b. The coordinator-editable weekly schedule (migration 0006),
    // fetched once rather than per-rotation.
    const defaultDayIsClinical = await isClinicalDay(admin, targetDate);

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
    // Keyed by student so that, after the upsert below tells us which rows
    // were actually created, we only send notifications about those. Was a
    // single flat array, which had to be sent all-or-nothing alongside the
    // inserts.
    const notificationsByStudent = new Map<string, any[]>();
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
        : specialDayApplies || defaultDayIsClinical;
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

      notificationsByStudent.set(rotation.student_id, [
        {
          user_id: rotation.student_id,
          title: 'Marked absent',
          message: `You were marked absent for ${targetDate}. If this is incorrect, submit an appeal.`,
          type: 'attendance_warning',
        },
        {
          user_id: rotation.coordinator_id,
          title: 'Student marked absent',
          message: `${nameByStudentId.get(rotation.student_id) ?? 'A student'} (Batch ${batch || 'unknown'}) at ${rotation.hospital?.name ?? 'their hospital'} was marked absent for ${targetDate}.`,
          type: 'attendance_warning',
        },
      ]);
    }

    let markedCount = 0;

    if (toInsert.length > 0) {
      // CHANGED: was a single `insert(toInsert)`. That is all-or-nothing —
      // if ANY row in the batch collided with the unique(student_id, date)
      // constraint, Postgres rejected the entire statement, so NOBODY was
      // marked absent and the notification insert (which only ran on
      // success) was skipped too. A collision is not hypothetical: it
      // happens whenever a student checks in during the moments this
      // function is running, or when a slow run overlaps the next cron tick
      // five minutes later. `upsert` with `ignoreDuplicates` skips only the
      // row that collided.
      const { data: inserted, error: insertError } = await admin
        .from('attendance')
        .upsert(toInsert, { onConflict: 'student_id,date', ignoreDuplicates: true })
        .select('student_id');
      if (insertError) throw insertError;

      // Notify only about rows that were really created, so a student who
      // checked in right at the cutoff does not get a "Marked absent"
      // message for a day they actually attended.
      const insertedStudentIds = (inserted ?? []).map((a: any) => a.student_id);
      markedCount = insertedStudentIds.length;

      const notifications = insertedStudentIds.flatMap((id: string) => notificationsByStudent.get(id) ?? []);
      if (notifications.length > 0) {
        const { error: notifyError } = await admin.from('notifications').insert(notifications);
        if (notifyError) throw notifyError;
      }
    }

    // Record proof-of-execution — but only for a real "today" check (cron or
    // the dashboard's "Check for missed check-ins" button), not a backfill
    // call for some arbitrary past date, since the point of this timestamp
    // is specifically to prove the live, cutoff-respecting automation is
    // still executing.
    if (!isManualCall) {
      await recordAttempt(true, undefined, markedCount);
    }

    return json({ date: targetDate, checked: rotations.length, marked_absent: markedCount, skipped });
  } catch (err) {
    // Best-effort — `admin` may not exist yet if env vars themselves are
    // missing, hence the inner try/catch rather than assuming it's defined.
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await createClient(supabaseUrl, serviceRoleKey).from('system_status').update({
        last_mark_absences_attempt: new Date().toISOString(),
        last_mark_absences_error: `Threw: ${(err as Error).message}`,
      }).eq('id', true);
    } catch {
      // Nothing more useful to do.
    }
    return json({ error: (err as Error).message }, 400);
  }
});