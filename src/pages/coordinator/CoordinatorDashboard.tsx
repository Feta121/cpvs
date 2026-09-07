import { useEffect, useState } from 'react';
import { Users, UserCheck, CheckCircle2, Clock, XCircle, TrendingUp, Hospital as HospitalIcon, ShieldAlert, Activity, Layers, Repeat, RefreshCw, Loader2 } from 'lucide-react';
import { startOfWeek, format, subWeeks, formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import { averageDurationMinutes, formatDurationMinutes } from '../../utils/duration';
import { addisToday } from '../../utils/addisDate';
import { invokeEdgeFunction } from '../../utils/invokeFunction';
import StatCard from '../../components/ui/StatCard';
import DashboardBanner from '../../components/ui/DashboardBanner';
import LiveClock from '../../components/ui/LiveClock';
import Select from '../../components/ui/Select';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import AttendanceTrendChart, { TrendPoint } from '../../components/dashboard/AttendanceTrendChart';
import HospitalComplianceBars, { HospitalComplianceRow } from '../../components/dashboard/HospitalComplianceBars';
import StudentRiskPanel, { RiskEntry, RiskSeverity } from '../../components/dashboard/StudentRiskPanel';
import HospitalActivityMap, { HospitalActivity } from '../../components/dashboard/HospitalActivityMap';
import ClinicalDaysCard from '../../components/dashboard/ClinicalDaysCard';
import type { AttendanceStatus } from '../../types/database';

const PRESENT_LIKE: AttendanceStatus[] = ['present', 'late', 'very_late'];
const WEEKS_OF_TREND = 8;

export default function CoordinatorDashboard() {
  const { coordinator } = useAuth();
  const { has } = usePermissions();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<string>('all');
  const [batches, setBatches] = useState<string[]>([]);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0 });
  const [lastRun, setLastRun] = useState<{ at: string | null; count: number | null; attemptAt: string | null; error: string | null }>({
    at: null,
    count: null,
    attemptAt: null,
    error: null,
  });

  // New: dashboard analytics state (additive — nothing above this line changed behavior)
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [hospitalCompliance, setHospitalCompliance] = useState<HospitalComplianceRow[]>([]);
  const [riskEntries, setRiskEntries] = useState<RiskEntry[]>([]);
  const [hospitalActivity, setHospitalActivity] = useState<HospitalActivity[]>([]);
  const [pipeline, setPipeline] = useState({
    scopedStudentTotal: 0,
    grandTotalStudents: 0,
    activeStudents: 0,
    assigned: 0,
    totalHospitals: 0,
    activeHospitals: 0,
    avgDurationMinutes: null as number | null,
  });
  const [runningCheck, setRunningCheck] = useState(false);
  const [runningBackfill, setRunningBackfill] = useState(false);

  useEffect(() => {
    if (!coordinator) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator, batch]);

  async function loadData() {
    setLoading(true);
    // Africa/Addis_Ababa, not UTC — `toISOString()` returned yesterday's date
    // between midnight and 03:00 local time, so the "today" counts on this
    // dashboard were a day behind for anyone looking early in the morning.
    const today = addisToday();

    // CHANGED: was 10 sequential `await`s in a row — each one is its own
    // network round-trip to Supabase, and none of them actually needed
    // another one's result to run (the only real dependencies —
    // `filtered`/`scopedActiveRotations` below — are just JS filtering on
    // data already fetched, not additional queries). Firing them together
    // means total wait time is roughly the slowest single query instead of
    // the sum of all ten.
    let studentQuery = supabase.from('students').select('id', { count: 'exact' });
    if (batch !== 'all') studentQuery = studentQuery.eq('batch', batch);

    let activeStudentQuery = supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active');
    if (batch !== 'all') activeStudentQuery = activeStudentQuery.eq('batch', batch);

    const [
      { data: statusRow },
      { data: studentBatches },
      { count: total },
      { data: todayAttendance },
      batchStudentIdsResult,
      { count: grandTotalStudents },
      { count: activeStudents },
      { count: totalHospitals },
      { count: activeHospitals },
      { data: activeRotationRows },
      { data: durationAttendance },
    ] = await Promise.all([
      supabase.from('system_status').select('*').eq('id', true).maybeSingle(),
      supabase.from('students').select('batch'),
      studentQuery,
      supabase.from('attendance').select('status, student_id').eq('date', today),
      batch === 'all' ? Promise.resolve({ data: null }) : supabase.from('students').select('id').eq('batch', batch),
      supabase.from('students').select('id', { count: 'exact', head: true }),
      activeStudentQuery,
      supabase.from('hospitals').select('id', { count: 'exact', head: true }),
      supabase.from('hospitals').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('rotations').select('student_id').eq('status', 'active'),
      // Program-wide "avg. time on-site" — deliberately NOT scoped to
      // `today` like todayAttendance above (a single day's sample is too
      // small to mean anything); this is all-time, batch-filtered the same
      // way scopedActiveRotations below is.
      supabase.from('attendance').select('student_id, check_in_time, check_out_time'),
    ]);

    setLastRun({
      at: (statusRow as any)?.last_mark_absences_run ?? null,
      count: (statusRow as any)?.last_mark_absences_marked_count ?? null,
      // Added in migration 0017 — see the note in that file and in
      // supabase/functions/mark-absences/index.ts for why this exists:
      // `last_mark_absences_run` only updates on success, so a persistently
      // failing call (most often a stale service_role key in
      // supabase/cron.sql) used to go silently stale with no reason shown.
      attemptAt: (statusRow as any)?.last_mark_absences_attempt ?? null,
      error: (statusRow as any)?.last_mark_absences_error ?? null,
    });
    setBatches(Array.from(new Set((studentBatches ?? []).map((s) => s.batch))));

    const batchStudentIds = batch === 'all' ? null : new Set(batchStudentIdsResult.data?.map((s: { id: string }) => s.id));

    const filtered = (todayAttendance ?? []).filter((a) => !batchStudentIds || batchStudentIds.has(a.student_id));
    // "Present today" counts anyone who showed up at all — including late and
    // very-late check-ins — since being late doesn't mean they weren't
    // present. "Late today" still separately shows that subset so
    // coordinators can see who to follow up with.
    const present = filtered.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'very_late').length;
    const late = filtered.filter((a) => a.status === 'late' || a.status === 'very_late').length;
    const absent = filtered.filter((a) => a.status === 'absent').length;

    setStats({ present, late, absent });

    // ---- Pipeline: "Total student"/"Total hospital" are program-wide
    // figures (never batch-filtered, even when a batch is selected in the
    // dropdown above) so they act as a fixed reference point.
    // "scopedStudentTotal" is the one that respects the batch dropdown —
    // it's the denominator for Assigned-to-rotation and Active students
    // (both of those numerators are batch-scoped too, so their denominator
    // should match). It isn't shown as its own card by itself. ----
    const scopedActiveRotations = (activeRotationRows ?? []).filter((r) => !batchStudentIds || batchStudentIds.has(r.student_id));

    setPipeline({
      scopedStudentTotal: total ?? 0,
      grandTotalStudents: grandTotalStudents ?? 0,
      activeStudents: activeStudents ?? 0,
      assigned: new Set(scopedActiveRotations.map((r) => r.student_id)).size,
      totalHospitals: totalHospitals ?? 0,
      activeHospitals: activeHospitals ?? 0,
      avgDurationMinutes: averageDurationMinutes(
        (durationAttendance ?? []).filter((a) => !batchStudentIds || batchStudentIds.has(a.student_id))
      ),
    });

    // ---- Everything below is new: analytics, compliance, risk, activity ----
    await Promise.all([loadTrendAndCompliance(batchStudentIds), loadRiskPanel(batchStudentIds), loadHospitalActivity(today)]);

    setLoading(false);
  }

  /**
   * Manually triggers the mark-absences Edge Function for today. This is
   * useful both to verify the function is deployed correctly, and as an
   * on-demand fallback if the scheduled cron job (see supabase/cron.sql)
   * hasn't been set up yet — it applies the exact same per-hospital
   * session_expires_at cutoff logic the scheduled job uses.
   */
  async function runAbsenceCheck() {
    setRunningCheck(true);
    const { data, error } = await invokeEdgeFunction('mark-absences', {});
    setRunningCheck(false);

    if (error) {
      showError(error);
      return;
    }
    const marked = (data as any)?.marked_absent ?? 0;
    const skipped = (data as any)?.skipped ?? {};
    if (marked > 0) {
      showSuccess(`Marked ${marked} student(s) absent.`);
    } else {
      const reasons: string[] = [];
      if (skipped.already_recorded) reasons.push(`${skipped.already_recorded} already have a record today`);
      if (skipped.not_expected_day) reasons.push(`${skipped.not_expected_day} — today isn't a clinical day for them`);
      if (skipped.exception_applies) reasons.push(`${skipped.exception_applies} covered by an exception`);
      if (skipped.before_cutoff) reasons.push(`${skipped.before_cutoff} — their hospital's cutoff hasn't passed yet`);
      showSuccess(reasons.length > 0 ? `No new absences. (${reasons.join('; ')})` : 'No active rotations to check.');
    }
    loadData();
  }

  /**
   * Walks forward day-by-day from the last successful backfill through
   * today, running the same absence check on every day in between — so a
   * coordinator who missed checking for a while can just click one button
   * instead of picking each missed date individually. Capped at 15 days on
   * a first-ever run (no last_backfill_date yet) to keep it bounded.
   */
  async function runBackfill() {
    setRunningBackfill(true);

    const { data: statusRow } = await supabase.from('system_status').select('last_backfill_date').eq('id', true).maybeSingle();
    const lastDate = (statusRow as any)?.last_backfill_date
      ? new Date((statusRow as any).last_backfill_date + 'T00:00:00Z')
      : new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    const today = new Date();
    const dates: string[] = [];
    const cursor = new Date(lastDate);
    cursor.setUTCDate(cursor.getUTCDate() + 1); // start the day AFTER the last check
    while (cursor <= today) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (dates.length === 0) {
      setRunningBackfill(false);
      showSuccess("Already up to date — nothing to backfill.");
      return;
    }

    let totalMarked = 0;
    let daysWithIssues = 0;
    for (const dateStr of dates) {
      const { data, error } = await invokeEdgeFunction('mark-absences', { date: dateStr });
      if (error) {
        setRunningBackfill(false);
        showError(`Backfill stopped at ${dateStr}: ${error}`);
        return;
      }
      const marked = (data as any)?.marked_absent ?? 0;
      totalMarked += marked;
      if (marked > 0) daysWithIssues++;
    }

    await supabase.from('system_status').update({ last_backfill_date: dates[dates.length - 1] }).eq('id', true);

    setRunningBackfill(false);
    showSuccess(
      totalMarked > 0
        ? `Checked ${dates.length} day(s) — marked ${totalMarked} absence(s) across ${daysWithIssues} day(s).`
        : `Checked ${dates.length} day(s) — no missed check-ins found.`
    );
    loadData();
  }

  /** Clinical Practice Performance Analytics + Hospital Rotation Analytics. */
  async function loadTrendAndCompliance(batchStudentIds: Set<string> | null) {
    const since = format(subWeeks(new Date(), WEEKS_OF_TREND), 'yyyy-MM-dd');
    const { data: recentAttendance } = await supabase
      .from('attendance')
      .select('date, status, student_id, hospital_id')
      .gte('date', since);

    const scoped = (recentAttendance ?? []).filter((a) => !batchStudentIds || batchStudentIds.has(a.student_id));

    // Weekly trend: group by the Monday of each week, % present-like.
    const weekBuckets = new Map<string, { total: number; present: number }>();
    for (const a of scoped) {
      const weekStart = format(startOfWeek(new Date(a.date), { weekStartsOn: 1 }), 'MMM d');
      const bucket = weekBuckets.get(weekStart) ?? { total: 0, present: 0 };
      bucket.total += 1;
      if (PRESENT_LIKE.includes(a.status as AttendanceStatus)) bucket.present += 1;
      weekBuckets.set(weekStart, bucket);
    }
    const trendPoints: TrendPoint[] = Array.from(weekBuckets.entries()).map(([label, b]) => ({
      label,
      percentage: b.total > 0 ? Math.round((b.present / b.total) * 100) : 0,
    }));
    setTrend(trendPoints);

    // Hospital compliance: % present-like per hospital, across all-time
    // records (not just the trend window) for a stable comparison.
    const { data: allAttendance } = await supabase.from('attendance').select('status, student_id, hospital_id');
    const scopedAll = (allAttendance ?? []).filter((a) => !batchStudentIds || batchStudentIds.has(a.student_id));
    const { data: hospitals } = await supabase.from('hospitals').select('id, name').eq('is_active', true);

    const byHospital = new Map<string, { total: number; present: number }>();
    for (const a of scopedAll) {
      const bucket = byHospital.get(a.hospital_id) ?? { total: 0, present: 0 };
      bucket.total += 1;
      if (PRESENT_LIKE.includes(a.status as AttendanceStatus)) bucket.present += 1;
      byHospital.set(a.hospital_id, bucket);
    }
    const complianceRows: HospitalComplianceRow[] = (hospitals ?? [])
      .map((h) => {
        const bucket = byHospital.get(h.id);
        return {
          hospitalId: h.id,
          name: h.name,
          percentage: bucket && bucket.total > 0 ? Math.round((bucket.present / bucket.total) * 100) : 0,
          totalRecords: bucket?.total ?? 0,
        };
      })
      .filter((r) => r.totalRecords > 0)
      .sort((a, b) => b.percentage - a.percentage);
    setHospitalCompliance(complianceRows);
  }

  /**
   * Student Risk Detection Panel.
   *
   * Flags a student when any of these (all computed from real data) are true:
   *  - Low attendance: <70% present-like across all their attendance records (needs 3+ records to avoid noise from a brand-new student)
   *  - Repeated lateness: reuses the existing `late_attendance_concern` flag your DB trigger already sets after 4+ late/very_late records in a rotation
   *  - Missing check-outs: 2+ attendance records with a check-in but no check-out
   *  - Frequent appeals: 2+ absence appeals ever submitted
   *
   * Severity: High = 2+ factors (or the DB concern flag), Medium = exactly 1 factor.
   */
  async function loadRiskPanel(batchStudentIds: Set<string> | null) {
    let studentQuery = supabase.from('students').select('id, late_attendance_concern');
    if (batchStudentIds) studentQuery = studentQuery.in('id', Array.from(batchStudentIds));
    const { data: students } = await studentQuery;
    if (!students || students.length === 0) {
      setRiskEntries([]);
      return;
    }
    const studentIds = students.map((s) => s.id);

    const [{ data: attendanceRows }, { data: appealRows }, profileMap] = await Promise.all([
      supabase.from('attendance').select('student_id, status, check_in_time, check_out_time').in('student_id', studentIds),
      supabase.from('appeals').select('student_id').in('student_id', studentIds),
      fetchProfilesById(studentIds),
    ]);

    const entries: RiskEntry[] = [];

    for (const s of students) {
      const own = (attendanceRows ?? []).filter((a) => a.student_id === s.id);
      const total = own.length;
      const presentLike = own.filter((a) => PRESENT_LIKE.includes(a.status as AttendanceStatus)).length;
      const attendancePct = total >= 3 ? Math.round((presentLike / total) * 100) : null;
      const missingCheckouts = own.filter((a) => a.check_in_time && !a.check_out_time).length;
      const appealCount = (appealRows ?? []).filter((a) => a.student_id === s.id).length;

      const reasons: string[] = [];
      let factorCount = 0;

      if (attendancePct !== null && attendancePct < 70) {
        reasons.push(`Attendance ${attendancePct}%`);
        factorCount++;
      }
      if (s.late_attendance_concern) {
        reasons.push('Flagged: 4+ late check-ins in a rotation');
        factorCount++;
      }
      if (missingCheckouts >= 2) {
        reasons.push(`${missingCheckouts} missing check-outs`);
        factorCount++;
      }
      if (appealCount >= 2) {
        reasons.push(`${appealCount} absence appeals filed`);
        factorCount++;
      }

      if (factorCount === 0) continue;

      const severity: RiskSeverity = factorCount >= 2 || s.late_attendance_concern ? 'high' : 'medium';
      entries.push({
        studentId: s.id,
        studentName: profileMap.get(s.id)?.full_name ?? '(profile missing)',
        severity,
        reasons,
      });
    }

    entries.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
    setRiskEntries(entries);
  }

  /** Live Clinical Activity Map: who's checked in vs checked out, per hospital, today. */
  async function loadHospitalActivity(today: string) {
    const [{ data: hospitals }, { data: todayRows }] = await Promise.all([
      supabase.from('hospitals').select('id, name, latitude, longitude').eq('is_active', true),
      supabase.from('attendance').select('hospital_id, check_in_time, check_out_time').eq('date', today),
    ]);

    const activity: HospitalActivity[] = (hospitals ?? []).map((h) => {
      const rows = (todayRows ?? []).filter((r) => r.hospital_id === h.id);
      return {
        hospitalId: h.id,
        name: h.name,
        latitude: h.latitude,
        longitude: h.longitude,
        activeNow: rows.filter((r) => r.check_in_time && !r.check_out_time).length,
        checkedOutToday: rows.filter((r) => r.check_in_time && r.check_out_time).length,
      };
    });
    setHospitalActivity(activity);
  }

  if (loading) return <FullScreenLoader label="Loading dashboard…" />;

  return (
    <div className="space-y-6">
      <LiveClock />
      <DashboardBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">Coordinator overview</h1>
          <p className="mt-1 text-sm text-ink-500">Today's snapshot across your assigned students.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {has('can_manage_attendance') && (
            // Dropped from mobile entirely (kept on sm: and up) — the
            // automatic checker banner just below already covers this on a
            // narrow phone screen, and removing it here is what lets
            // Backfill + the batch select share a single row instead of
            // three items competing for one line.
            <button
              onClick={runAbsenceCheck}
              disabled={runningCheck}
              className="btn-secondary hidden !gap-2 !px-4 !py-2.5 text-sm sm:inline-flex"
              title="Manually mark absent any student past their hospital's check-in cutoff with no record today"
            >
              {runningCheck ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <RefreshCw size={14} className="shrink-0" />}
              Check for missed check-ins
            </button>
          )}
          {/* `sm:contents` unwraps this at sm: and up, so Backfill and the
              batch select fall back into the parent flex row exactly like
              before (in original document order, right after the button
              above); below sm: it's a real 2-column grid so the two of them
              share one row instead of each taking a full-width row. */}
          <div className="grid grid-cols-2 gap-2 sm:contents">
            {has('can_manage_attendance') && (
              <button
                onClick={runBackfill}
                disabled={runningBackfill}
                className="btn-secondary !gap-1.5 !px-2.5 !py-2 text-xs sm:!gap-2 sm:!px-4 sm:!py-2.5 sm:text-sm"
                title="Checks every day since the last backfill (or up to 15 days back) through today, marking any missed check-ins absent"
              >
                {runningBackfill ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <RefreshCw size={14} className="shrink-0" />}
                Backfill
              </button>
            )}
            <Select value={batch} onChange={setBatch} className="w-full sm:w-56">
              <option value="all">All batches</option>
              {batches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Proof the automatic (cron-scheduled) absence check is actually
          running, not just theoretically correct — turns red/stale if the
          cron job from supabase/cron.sql isn't actually scheduled.

          Added in migration 0017: `hasRecentError` catches the case where
          the check LOOKS stale but is actually failing every 5 minutes on
          schedule — most commonly because the service_role key pasted into
          supabase/cron.sql's Authorization header no longer matches this
          project's current key (it may have been rotated since). That
          failure mode is invisible in `cron.job_run_details`, which only
          proves the HTTP call was queued, not that it succeeded — so
          without this, a coordinator has no way to tell "not scheduled"
          apart from "scheduled and failing every time" other than a bare
          "stale" label. */}
      {(() => {
        const isStale = !lastRun.at || Date.now() - new Date(lastRun.at).getTime() > 20 * 60 * 1000;
        const hasRecentError = !!lastRun.error && !!lastRun.attemptAt && Date.now() - new Date(lastRun.attemptAt).getTime() < 20 * 60 * 1000;
        const tone = hasRecentError || (isStale && lastRun.at) ? 'expired' : !lastRun.at ? 'never-run' : 'present';
        return (
          <div className={`relative flex items-center gap-2 overflow-hidden rounded-xl2 px-4 py-3 text-xs leading-relaxed ring-1 ring-inset ${
            tone === 'expired' ? 'bg-status-expired/8 text-status-expired ring-status-expired/30'
            : tone === 'never-run' ? 'bg-status-verylate/8 text-status-verylate ring-status-verylate/30'
            : 'bg-status-present/8 text-status-present ring-status-present/30'
          }`}>
            <span className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${
              tone === 'expired' ? 'bg-status-expired' : tone === 'never-run' ? 'bg-status-verylate' : 'bg-status-present'
            }`} />
            {hasRecentError ? (
              <>⚠ Automatic check is running on schedule but failing every time — {formatDistanceToNow(new Date(lastRun.attemptAt!), { addSuffix: true })}: {lastRun.error}</>
            ) : !lastRun.at ? (
              <>⚠ Automatic absence check has never run — the mark-absences function may not be deployed, or the cron job from supabase/cron.sql isn't scheduled yet.</>
            ) : (
              <>
                {isStale ? '⚠ ' : '✓ '}
                Last automatic check: {formatDistanceToNow(new Date(lastRun.at), { addSuffix: true })}
                {lastRun.count !== null && lastRun.count > 0 ? ` — marked ${lastRun.count} absent` : ''}
                {isStale ? ' (stale — check that the cron job is still scheduled)' : ''}
              </>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Present today" value={stats.present} icon={CheckCircle2} tone="vital" />
        <StatCard label="Absent today" value={stats.absent} icon={XCircle} tone="expired" />
        <StatCard label="Late today" value={stats.late} icon={Clock} tone="late" />
      </div>

      {/* Onboarding / capacity pipeline — click any card to jump to its page */}
      <div>
        <h2 className="section-label mb-3 flex items-center gap-2.5">
          Pipeline
          <span className="hairline flex-1" />
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total student"
            value={pipeline.grandTotalStudents}
            icon={Users}
            tone="clinical"
            to="/coordinator/students"
            hint="View roster"
          />
          <StatCard label="Total hospital" value={pipeline.totalHospitals} icon={HospitalIcon} tone="clinical" to="/coordinator/hospitals" hint="Manage hospitals" />
          <StatCard
            label="Assigned to rotation"
            value={`${pipeline.assigned} / ${pipeline.scopedStudentTotal}`}
            icon={Repeat}
            tone="vital"
            to="/coordinator/rotations"
            hint="Manage rotations"
          />
          <StatCard
            label="Active hospitals"
            value={`${pipeline.activeHospitals} / ${pipeline.totalHospitals}`}
            icon={HospitalIcon}
            tone="vital"
            to="/coordinator/hospitals"
            hint="Manage hospitals"
          />
          <StatCard
            label="Active students"
            value={`${pipeline.activeStudents} / ${pipeline.scopedStudentTotal}`}
            icon={UserCheck}
            tone="vital"
            to="/coordinator/students"
            hint="View roster"
          />
          <StatCard label="Batch size" value={batches.length} icon={Layers} tone="clinical" hint="Number of batches in the program" />
          <StatCard
            label="Avg. time on-site"
            value={pipeline.avgDurationMinutes !== null ? formatDurationMinutes(pipeline.avgDurationMinutes) : '—'}
            icon={Clock}
            tone="clinical"
            hint={batch === 'all' ? 'Across every completed check-out, all batches' : `Across every completed check-out, batch ${batch}`}
          />
        </div>
      </div>

      {/* Clinical Practice Performance Analytics */}
      <div className="surface-card card-hover p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <span className="icon-tile h-8 w-8 rounded-lg">
            <TrendingUp size={15} strokeWidth={2.5} />
          </span>
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">Attendance trend</h2>
          <span className="chip py-0.5">last {WEEKS_OF_TREND} weeks · weekly %</span>
        </div>
        <AttendanceTrendChart data={trend} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hospital Rotation Analytics */}
        <div className="surface-card card-hover p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="icon-tile h-8 w-8 rounded-lg">
              <HospitalIcon size={15} strokeWidth={2.5} />
            </span>
            <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">Hospital compliance</h2>
          </div>
          <HospitalComplianceBars rows={hospitalCompliance} />
        </div>

        {/* Student Risk Detection Panel */}
        <div className="surface-card card-hover p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-expired/12 text-status-expired ring-1 ring-inset ring-status-expired/25">
              <ShieldAlert size={15} strokeWidth={2.5} />
            </span>
            <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">Students needing attention</h2>
          </div>
          <StudentRiskPanel entries={riskEntries} />
        </div>
      </div>

      {/* Live Clinical Activity Map */}
      <div className="surface-card card-hover p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <span className="icon-tile-accent h-8 w-8 rounded-lg">
            <Activity size={15} strokeWidth={2.5} />
          </span>
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">Live clinical activity</h2>
          <span className="chip py-0.5">today · by hospital</span>
        </div>
        <HospitalActivityMap hospitals={hospitalActivity} />
      </div>

      <ClinicalDaysCard />
    </div>
  );
}