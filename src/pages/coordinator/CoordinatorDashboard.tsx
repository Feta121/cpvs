import { useEffect, useState } from 'react';
import { Users, CheckCircle2, Clock, XCircle, FileWarning, TrendingUp, Hospital as HospitalIcon, ShieldAlert, Activity, Repeat, LogOut, RefreshCw, Loader2 } from 'lucide-react';
import { startOfWeek, format, subWeeks } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import StatCard from '../../components/ui/StatCard';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import AttendanceTrendChart, { TrendPoint } from '../../components/dashboard/AttendanceTrendChart';
import HospitalComplianceBars, { HospitalComplianceRow } from '../../components/dashboard/HospitalComplianceBars';
import StudentRiskPanel, { RiskEntry, RiskSeverity } from '../../components/dashboard/StudentRiskPanel';
import HospitalActivityMap, { HospitalActivity } from '../../components/dashboard/HospitalActivityMap';
import type { AttendanceStatus } from '../../types/database';

const PRESENT_LIKE: AttendanceStatus[] = ['present', 'late', 'very_late'];
const WEEKS_OF_TREND = 8;

export default function CoordinatorDashboard() {
  const { coordinator } = useAuth();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<string>('all');
  const [batches, setBatches] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, present: 0, late: 0, absent: 0, pendingAppeals: 0 });

  // New: dashboard analytics state (additive — nothing above this line changed behavior)
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [hospitalCompliance, setHospitalCompliance] = useState<HospitalComplianceRow[]>([]);
  const [riskEntries, setRiskEntries] = useState<RiskEntry[]>([]);
  const [hospitalActivity, setHospitalActivity] = useState<HospitalActivity[]>([]);
  const [pipeline, setPipeline] = useState({ added: 0, assigned: 0, checkedIn: 0, checkedOut: 0 });
  const [runningCheck, setRunningCheck] = useState(false);

  useEffect(() => {
    if (!coordinator) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator, batch]);

  async function loadData() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const { data: studentBatches } = await supabase.from('students').select('batch');
    setBatches(Array.from(new Set((studentBatches ?? []).map((s) => s.batch))));

    let studentQuery = supabase.from('students').select('id', { count: 'exact' });
    if (batch !== 'all') studentQuery = studentQuery.eq('batch', batch);
    const { count: total } = await studentQuery;

    const { data: todayAttendance } = await supabase.from('attendance').select('status, student_id').eq('date', today);

    const batchStudentIds =
      batch === 'all' ? null : new Set((await supabase.from('students').select('id').eq('batch', batch)).data?.map((s) => s.id));

    const filtered = (todayAttendance ?? []).filter((a) => !batchStudentIds || batchStudentIds.has(a.student_id));
    // "Present today" counts anyone who showed up at all — including late and
    // very-late check-ins — since being late doesn't mean they weren't
    // present. "Late today" still separately shows that subset so
    // coordinators can see who to follow up with.
    const present = filtered.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'very_late').length;
    const late = filtered.filter((a) => a.status === 'late' || a.status === 'very_late').length;
    const absent = filtered.filter((a) => a.status === 'absent').length;

    const { count: pendingAppeals } = await supabase
      .from('appeals')
      .select('id', { count: 'exact' })
      .eq('status', 'pending');

    setStats({ total: total ?? 0, present, late, absent, pendingAppeals: pendingAppeals ?? 0 });

    // ---- New: onboarding/attendance pipeline counts ----
    const [{ data: activeRotationRows }, { data: todayCheckins }] = await Promise.all([
      supabase.from('rotations').select('student_id').eq('status', 'active'),
      supabase.from('attendance').select('student_id, check_in_time, check_out_time').eq('date', today),
    ]);
    const scopedActiveRotations = (activeRotationRows ?? []).filter((r) => !batchStudentIds || batchStudentIds.has(r.student_id));
    const scopedCheckins = (todayCheckins ?? []).filter((r) => !batchStudentIds || batchStudentIds.has(r.student_id));
    setPipeline({
      added: total ?? 0,
      assigned: new Set(scopedActiveRotations.map((r) => r.student_id)).size,
      checkedIn: scopedCheckins.filter((r) => r.check_in_time).length,
      checkedOut: scopedCheckins.filter((r) => r.check_in_time && r.check_out_time).length,
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
    const { data, error } = await supabase.functions.invoke('mark-absences', { body: {} });
    setRunningCheck(false);

    const payloadError = (data as any)?.error;
    if (error || payloadError) {
      showError(payloadError ?? error?.message ?? 'Unable to run the absence check. Make sure the mark-absences function is deployed.');
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Coordinator overview</h1>
          <p className="mt-1 text-sm text-ink-500">Today's snapshot across your assigned students.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={runAbsenceCheck} disabled={runningCheck} className="btn-secondary" title="Manually mark absent any student past their hospital's check-in cutoff with no record today">
            {runningCheck ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Check for missed check-ins
          </button>
          <select value={batch} onChange={(e) => setBatch(e.target.value)} className="input-field w-auto">
            <option value="all">All batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total students" value={stats.total} icon={Users} tone="clinical" />
        <StatCard label="Present today" value={stats.present} icon={CheckCircle2} tone="vital" />
        <StatCard label="Late today" value={stats.late} icon={Clock} tone="late" />
        <StatCard label="Absent today" value={stats.absent} icon={XCircle} tone="expired" />
        <StatCard label="Pending appeals" value={stats.pendingAppeals} icon={FileWarning} tone="verylate" />
      </div>

      {/* Onboarding / attendance pipeline — click any card to jump to its page */}
      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink-700">Pipeline</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Students added" value={pipeline.added} icon={Users} tone="clinical" to="/coordinator/students" hint="View roster" />
          <StatCard
            label="Assigned to rotation"
            value={`${pipeline.assigned} / ${pipeline.added}`}
            icon={Repeat}
            tone="vital"
            to="/coordinator/rotations"
            hint="Manage rotations"
          />
          <StatCard label="Checked in today" value={pipeline.checkedIn} icon={CheckCircle2} tone="late" to="/coordinator/attendance" hint="View attendance" />
          <StatCard label="Checked out today" value={pipeline.checkedOut} icon={LogOut} tone="clinical" to="/coordinator/attendance" hint="View attendance" />
        </div>
      </div>

      {/* Clinical Practice Performance Analytics */}
      <div className="surface-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-clinical-600" />
          <h2 className="font-display text-base font-semibold text-ink-900">Attendance trend</h2>
          <span className="text-xs text-ink-300">— last {WEEKS_OF_TREND} weeks, weekly %</span>
        </div>
        <AttendanceTrendChart data={trend} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hospital Rotation Analytics */}
        <div className="surface-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <HospitalIcon size={16} className="text-clinical-600" />
            <h2 className="font-display text-base font-semibold text-ink-900">Hospital compliance</h2>
          </div>
          <HospitalComplianceBars rows={hospitalCompliance} />
        </div>

        {/* Student Risk Detection Panel */}
        <div className="surface-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert size={16} className="text-status-expired" />
            <h2 className="font-display text-base font-semibold text-ink-900">Students needing attention</h2>
          </div>
          <StudentRiskPanel entries={riskEntries} />
        </div>
      </div>

      {/* Live Clinical Activity Map */}
      <div className="surface-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Activity size={16} className="text-vital-600" />
          <h2 className="font-display text-base font-semibold text-ink-900">Live clinical activity</h2>
          <span className="text-xs text-ink-300">— today, by hospital</span>
        </div>
        <HospitalActivityMap hospitals={hospitalActivity} />
      </div>
    </div>
  );
}
