import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hospital as HospitalIcon, UserRound, Percent, CheckCircle2, Megaphone, ArrowRight, CalendarDays, Target, Award } from 'lucide-react';
import { differenceInCalendarDays, format, subWeeks, startOfWeek } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import ProgressRing from '../../components/dashboard/ProgressRing';
import AttendanceTrendChart, { TrendPoint } from '../../components/dashboard/AttendanceTrendChart';
import AchievementBadges, { Achievement } from '../../components/dashboard/AchievementBadges';
import type { Rotation, Hospital, Profile, AttendanceRecord, Announcement, AttendanceStatus } from '../../types/database';

const PRESENT_LIKE: AttendanceStatus[] = ['present', 'late', 'very_late'];
const WEEKS_OF_TREND = 8;

/** Counts clinical practice days (Mon/Tue/Wed only — no practice Thu–Sun)
 * in [start, end] inclusive — used as the "required clinical days"
 * denominator for the Clinical Progress ring, derived from the rotation's
 * own start/end dates (real data, not fabricated). */
function countWeekdays(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay(); // 0=Sun ... 6=Sat
    if (day === 1 || day === 2 || day === 3) count++; // Mon, Tue, Wed
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function StudentDashboard() {
  const { profile, student } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState<(Rotation & { hospital: Hospital; coordinator: Profile | null }) | null>(null);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // New: personal analytics state (additive — everything above is unchanged)
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [punctualityPct, setPunctualityPct] = useState<number | null>(null);
  const [rotationProgress, setRotationProgress] = useState<{ completed: number; required: number } | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    if (!student) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      // FIX: this used to embed `coordinator:profiles!rotations_coordinator_id_fkey(*)`,
      // but rotations.coordinator_id references coordinators(id), not
      // profiles(id) — there's no such foreign key, so PostgREST rejected
      // the whole query and rotationData silently came back null. That's
      // what made an assigned rotation look like "no active rotation",
      // "Unassigned", and coordinator "-" all at once. Fetching the
      // coordinator's profile as a separate, safe query and merging it in
      // fixes all three.
      const { data: rotationData, error: rotationError } = await supabase
        .from('rotations')
        .select('*, hospital:hospitals(*)')
        .eq('student_id', student.id)
        .eq('status', 'active')
        .maybeSingle();

      if (rotationError) {
        console.error('[CPVS] Failed to load active rotation:', rotationError.message);
        setRotation(null);
      } else if (rotationData) {
        const profileMap = await fetchProfilesById([rotationData.coordinator_id]);
        setRotation({ ...(rotationData as any), coordinator: profileMap.get(rotationData.coordinator_id) ?? null });
      } else {
        setRotation(null);
      }

      const { data: allAttendance } = await supabase
        .from('attendance')
        .select('status, date, check_in_time')
        .eq('student_id', student.id);

      if (allAttendance && allAttendance.length > 0) {
        const presentLike = allAttendance.filter((a) => PRESENT_LIKE.includes(a.status as AttendanceStatus)).length;
        setAttendancePct(Math.round((presentLike / allAttendance.length) * 100));

        // Punctuality: of all present-like check-ins, what share were
        // exactly on-time ('present') rather than late/very_late.
        const presentLikeRows = allAttendance.filter((a) => PRESENT_LIKE.includes(a.status as AttendanceStatus));
        const onTime = presentLikeRows.filter((a) => a.status === 'present').length;
        setPunctualityPct(presentLikeRows.length > 0 ? Math.round((onTime / presentLikeRows.length) * 100) : null);

        // Weekly attendance trend, last WEEKS_OF_TREND weeks.
        const since = subWeeks(new Date(), WEEKS_OF_TREND);
        const recent = allAttendance.filter((a) => new Date(a.date) >= since);
        const weekBuckets = new Map<string, { total: number; present: number }>();
        for (const a of recent) {
          const weekLabel = format(startOfWeek(new Date(a.date), { weekStartsOn: 1 }), 'MMM d');
          const bucket = weekBuckets.get(weekLabel) ?? { total: 0, present: 0 };
          bucket.total += 1;
          if (PRESENT_LIKE.includes(a.status as AttendanceStatus)) bucket.present += 1;
          weekBuckets.set(weekLabel, bucket);
        }
        setTrend(Array.from(weekBuckets.entries()).map(([label, b]) => ({ label, percentage: Math.round((b.present / b.total) * 100) })));

        // Achievements — computed from real attendance/rotation data:
        //  - Perfect Attendance: 5+ records, zero absences, zero lates ever
        //  - Early Check-in: 3+ check-ins recorded as exactly 'present' (on-time)
        //  - Rotation Completed: any rotation on record with status 'completed'
        const totalRecords = allAttendance.length;
        const absences = allAttendance.filter((a) => a.status === 'absent').length;
        const lates = allAttendance.filter((a) => a.status === 'late' || a.status === 'very_late').length;
        const onTimeCount = allAttendance.filter((a) => a.status === 'present').length;

        const { count: completedRotations } = await supabase
          .from('rotations')
          .select('id', { count: 'exact' })
          .eq('student_id', student.id)
          .eq('status', 'completed');

        setAchievements([
          {
            id: 'perfect_attendance',
            label: 'Perfect Attendance',
            description: 'No absences or lates recorded',
            earned: totalRecords >= 5 && absences === 0 && lates === 0,
          },
          {
            id: 'early_checkin',
            label: 'Early Check-in',
            description: '3+ on-time check-ins',
            earned: onTimeCount >= 3,
          },
          {
            id: 'rotation_completed',
            label: 'Rotation Completed',
            description: 'Finished a clinical rotation',
            earned: (completedRotations ?? 0) > 0,
          },
        ]);
      } else {
        setAttendancePct(null);
        setPunctualityPct(null);
        setTrend([]);
        setAchievements([
          { id: 'perfect_attendance', label: 'Perfect Attendance', description: 'No absences or lates recorded', earned: false },
          { id: 'early_checkin', label: 'Early Check-in', description: '3+ on-time check-ins', earned: false },
          { id: 'rotation_completed', label: 'Rotation Completed', description: 'Finished a clinical rotation', earned: false },
        ]);
      }

      // Clinical Progress: completed vs required days for the CURRENT
      // rotation, where "required" is the count of weekdays across the
      // rotation's own start_date/end_date (real data) rather than an
      // invented number.
      if (rotationData) {
        const start = new Date(rotationData.start_date);
        const end = new Date(rotationData.end_date);
        const required = countWeekdays(start, end);
        const { data: rotationAttendance } = await supabase
          .from('attendance')
          .select('status')
          .eq('rotation_id', rotationData.id);
        const completed = (rotationAttendance ?? []).filter((a) => PRESENT_LIKE.includes(a.status as AttendanceStatus)).length;
        setRotationProgress({ completed, required });
      } else {
        setRotationProgress(null);
      }

      const { data: todayData } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', student.id)
        .eq('date', today)
        .maybeSingle();
      setTodayRecord(todayData);

      const { data: ann } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
      setAnnouncements(ann ?? []);

      setLoading(false);
    })();
  }, [student]);

  if (loading) return <FullScreenLoader label="Loading your dashboard…" />;

  const remainingDays = rotation ? Math.max(0, differenceInCalendarDays(new Date(rotation.end_date), new Date())) : null;

  return (
    <div className="space-y-6">
      {/* Personal Clinical Profile Header */}
      <div className="glass-card flex flex-wrap items-center gap-5 p-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-vital-100 text-2xl font-semibold text-vital-700">
          {profile?.photo_url ? (
            <img src={profile.photo_url} alt={profile.full_name} className="h-full w-full object-cover" />
          ) : (
            profile?.full_name?.[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold text-ink-900">{profile?.full_name}</h1>
          <p className="text-sm text-ink-500">
            {student?.program ?? student?.department} · Year {student?.year} · Batch {student?.batch}
          </p>
        </div>
        <div className="flex flex-wrap gap-6 text-center">
          <div>
            <p className="font-display text-lg font-semibold text-ink-900">{rotation?.hospital?.name ?? '—'}</p>
            <p className="text-xs text-ink-300">Current rotation</p>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-ink-900">{rotationProgress?.completed ?? '—'}</p>
            <p className="text-xs text-ink-300">Days completed</p>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-ink-900">{attendancePct !== null ? `${attendancePct}%` : '—'}</p>
            <p className="text-xs text-ink-300">Attendance</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hospital rotation" value={rotation?.hospital?.name ?? 'Unassigned'} icon={HospitalIcon} tone="clinical" />
        <StatCard label="Coordinator" value={rotation?.coordinator?.full_name ?? '—'} icon={UserRound} tone="vital" />
        <StatCard label="Attendance rate" value={attendancePct !== null ? `${attendancePct}%` : '—'} icon={Percent} tone="clinical" />
        <StatCard
          label="Today's status"
          value={todayRecord ? todayRecord.status.replace('_', ' ') : 'Not checked in'}
          icon={CheckCircle2}
          tone={todayRecord?.status === 'present' ? 'vital' : todayRecord ? 'late' : 'clinical'}
        />
      </div>

      {student?.late_attendance_concern && (
        <div className="rounded-xl2 border border-status-verylate/30 bg-status-verylate/5 px-5 py-4 text-sm text-status-verylate">
          You've been flagged with a <strong>Late Attendance Concern</strong> for this rotation. Please speak with your coordinator.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Clinical Progress Ring + Rotation Information */}
        <div className="surface-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Target size={16} className="text-clinical-600" />
            <h2 className="font-display text-base font-semibold text-ink-900">Clinical progress</h2>
          </div>
          {rotationProgress && rotationProgress.required > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <ProgressRing
                percentage={(rotationProgress.completed / rotationProgress.required) * 100}
                label="Days completed"
                sublabel={`${rotationProgress.completed} of ${rotationProgress.required}`}
              />
              <div className="w-full space-y-1.5 border-t border-surface-line pt-4 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">Hospital</span><span className="font-medium text-ink-900">{rotation?.hospital?.name}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Period</span><span className="font-medium text-ink-900">{rotation?.start_date} → {rotation?.end_date}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Remaining</span><span className="font-medium text-ink-900">{remainingDays} day{remainingDays === 1 ? '' : 's'}</span></div>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-ink-300">No active rotation assigned yet — ask your coordinator.</p>
          )}
        </div>

        <div className="surface-card lg:col-span-2 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-ink-900">Today's check-in</h2>
            <Link to="/student/attendance" className="flex items-center gap-1 text-sm font-medium text-clinical-600 hover:text-clinical-700">
              Go to check-in <ArrowRight size={14} />
            </Link>
          </div>
          {todayRecord ? (
            <div className="flex items-center gap-3">
              <Badge tone={todayRecord.status === 'present' ? 'present' : todayRecord.status === 'late' ? 'late' : todayRecord.status === 'very_late' ? 'verylate' : 'expired'} dot>
                {todayRecord.status.replace('_', ' ')}
              </Badge>
              <span className="text-sm text-ink-500">
                Checked in at {todayRecord.check_in_time ? new Date(todayRecord.check_in_time).toLocaleTimeString() : '—'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-ink-500">You haven't checked in yet today. Head to the check-in page when you arrive at your hospital.</p>
          )}

          {/* Personal Analytics: attendance trend */}
          <div className="mt-6 border-t border-surface-line pt-5">
            <div className="mb-2 flex items-center gap-2">
              <CalendarDays size={14} className="text-ink-500" />
              <p className="text-sm font-medium text-ink-700">Attendance trend — last {WEEKS_OF_TREND} weeks</p>
            </div>
            <AttendanceTrendChart data={trend} height={180} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Personal Analytics: punctuality ring */}
        <div className="surface-card flex flex-col items-center justify-center p-6">
          <h2 className="mb-4 self-start font-display text-base font-semibold text-ink-900">Punctuality</h2>
          {punctualityPct !== null ? (
            <ProgressRing percentage={punctualityPct} tone="vital" label="On-time check-ins" size={120} strokeWidth={10} />
          ) : (
            <p className="py-6 text-center text-sm text-ink-300">No check-ins recorded yet.</p>
          )}
        </div>

        {/* Achievement System */}
        <div className="surface-card lg:col-span-2 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Award size={16} className="text-clinical-600" />
            <h2 className="font-display text-base font-semibold text-ink-900">Achievements</h2>
          </div>
          <AchievementBadges achievements={achievements} />
        </div>
      </div>

      <div className="surface-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Megaphone size={16} className="text-clinical-600" />
          <h2 className="font-display text-base font-semibold text-ink-900">Announcements</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {announcements.length === 0 && <p className="text-sm text-ink-500">No announcements yet.</p>}
          {announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-surface-line p-3">
              <div className="flex items-center gap-2">
                {a.type === 'emergency' && <Badge tone="expired">Urgent</Badge>}
                <p className="text-sm font-medium text-ink-900">{a.title}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-500">{a.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
