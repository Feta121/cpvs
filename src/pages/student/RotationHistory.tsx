import { useEffect, useMemo, useState } from 'react';
import { Hospital as HospitalIcon, UserRound, ChevronDown, FileWarning, Repeat, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import { statusColors } from '../../utils/geofence';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Rotation, Hospital, Profile, AttendanceRecord, Appeal, AttendanceStatus, RotationStatus } from '../../types/database';

const PRESENT_LIKE: AttendanceStatus[] = ['present', 'late', 'very_late'];

/** Counts clinical practice days (Mon/Tue/Wed only — no practice Thu–Sun) in
 * [start, end] inclusive. Duplicated from StudentDashboard.tsx rather than
 * shared, matching how this codebase already keeps small pure helpers local
 * to the page that uses them (see e.g. AttendanceHistory.tsx's own
 * `recordFor`) — pull it into a shared util if a third page ends up needing
 * it too. */
function countWeekdays(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day === 1 || day === 2 || day === 3) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

type RotationRow = Rotation & { hospital: Hospital; coordinator: Profile | null };
type AppealWithDate = Appeal & { date: string | null };

const STATUS_TONE: Record<RotationStatus, 'present' | 'neutral' | 'expired'> = {
  active: 'present',
  completed: 'neutral',
  cancelled: 'expired',
};

export default function RotationHistory() {
  const { student } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rotations, setRotations] = useState<RotationRow[]>([]);
  const [attendanceByRotation, setAttendanceByRotation] = useState<Map<string, AttendanceRecord[]>>(new Map());
  const [appealsByRotation, setAppealsByRotation] = useState<Map<string, AppealWithDate[]>>(new Map());
  const [lifetimeAttendance, setLifetimeAttendance] = useState<{ present: number; total: number }>({ present: 0, total: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    (async () => {
      setLoading(true);

      const { data: rotationRows, error: rotationsError } = await supabase
        .from('rotations')
        .select('*, hospital:hospitals(*)')
        .eq('student_id', student.id)
        .order('start_date', { ascending: false });

      if (rotationsError) {
        console.error('[CPVS] Failed to load rotation history:', rotationsError.message);
        setRotations([]);
        setLoading(false);
        return;
      }

      const rows = rotationRows ?? [];
      const profileMap = await fetchProfilesById(rows.map((r) => r.coordinator_id));
      const withCoordinator: RotationRow[] = rows.map((r) => ({
        ...(r as any),
        coordinator: profileMap.get(r.coordinator_id) ?? null,
      }));
      // Active rotation always pinned first regardless of date — everything
      // else is already newest-first from the query above.
      withCoordinator.sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0));
      setRotations(withCoordinator);

      // One query for every attendance row this student has ever had, rather
      // than one query per rotation card — grouped client-side by
      // rotation_id. Doubles as the source for both the per-rotation stats
      // below AND the day-by-day expand, and for the lifetime summary strip.
      const { data: allAttendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', student.id);

      const attendanceMap = new Map<string, AttendanceRecord[]>();
      (allAttendance ?? []).forEach((a) => {
        const list = attendanceMap.get(a.rotation_id) ?? [];
        list.push(a);
        attendanceMap.set(a.rotation_id, list);
      });
      setAttendanceByRotation(attendanceMap);
      setLifetimeAttendance({
        total: (allAttendance ?? []).length,
        present: (allAttendance ?? []).filter((a) => PRESENT_LIKE.includes(a.status as AttendanceStatus)).length,
      });

      // Appeals reference attendance_id, not rotation_id directly — the
      // embed below walks appeals -> attendance to recover both the
      // rotation and the absence date in one query.
      const { data: appealRows } = await supabase
        .from('appeals')
        .select('*, attendance:attendance(rotation_id, date)')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false });

      const appealsMap = new Map<string, AppealWithDate[]>();
      (appealRows ?? []).forEach((a: any) => {
        const rotationId = a.attendance?.rotation_id;
        if (!rotationId) return;
        const list = appealsMap.get(rotationId) ?? [];
        list.push({ ...a, date: a.attendance?.date ?? null });
        appealsMap.set(rotationId, list);
      });
      setAppealsByRotation(appealsMap);

      setLoading(false);
    })();
  }, [student]);

  const totalHospitals = useMemo(() => new Set(rotations.map((r) => r.hospital_id)).size, [rotations]);
  const lifetimePct = lifetimeAttendance.total > 0 ? Math.round((lifetimeAttendance.present / lifetimeAttendance.total) * 100) : null;

  if (loading) return <FullScreenLoader label="Loading rotation history…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">Rotation history</h1>
        <p className="mt-1 text-sm text-ink-500">Every hospital assignment you've had, past and current, with attendance for each.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total rotations', value: rotations.length },
          { label: 'Hospitals', value: totalHospitals },
          { label: 'Lifetime attendance', value: lifetimePct !== null ? `${lifetimePct}%` : '—' },
        ].map((s) => (
          <div key={s.label} className="surface-card p-4 text-center">
            <p className="stat-value text-2xl sm:text-3xl">{s.value}</p>
            <p className="section-label mt-1.5 truncate">{s.label}</p>
          </div>
        ))}
      </div>

      {rotations.length === 0 ? (
        <div className="surface-card p-8 text-center">
          <Repeat size={22} className="mx-auto mb-2 text-ink-300" />
          <p className="text-sm font-medium text-ink-500">No rotations assigned yet.</p>
          <p className="mt-1 text-xs text-ink-400">Once your coordinator assigns you to a hospital, it'll show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rotations.map((r) => {
            const records = attendanceByRotation.get(r.id) ?? [];
            const appeals = appealsByRotation.get(r.id) ?? [];
            const isOpen = expanded === r.id;
            const start = new Date(r.start_date);
            const end = new Date(r.end_date);
            const required = countWeekdays(start, end);
            const completed = records.filter((a) => PRESENT_LIKE.includes(a.status as AttendanceStatus)).length;
            const pct = records.length > 0 ? Math.round((completed / records.length) * 100) : null;
            const breakdown = {
              present: records.filter((a) => a.status === 'present').length,
              late: records.filter((a) => a.status === 'late').length,
              veryLate: records.filter((a) => a.status === 'very_late').length,
              absent: records.filter((a) => a.status === 'absent').length,
              excused: records.filter((a) => a.status === 'excused').length,
            };
            const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));

            return (
              <div key={r.id} className="surface-card overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="flex w-full flex-wrap items-center gap-3 p-5 text-left transition-colors duration-200 hover:bg-surface-alt/40"
                >
                  <span className="icon-tile h-10 w-10 shrink-0 rounded-xl">
                    <HospitalIcon size={17} strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-display text-base font-semibold text-ink-900">{r.hospital?.name ?? 'Unknown hospital'}</p>
                      <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                      <span className="flex items-center gap-1">
                        <UserRound size={12} /> {r.coordinator?.full_name ?? 'Unassigned coordinator'}
                      </span>
                      <span>
                        {format(start, 'MMM d, yyyy')} – {r.status === 'active' ? 'Present' : format(end, 'MMM d, yyyy')}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4 pl-1">
                    <div className="text-right">
                      <p className="stat-value text-lg">{completed}<span className="text-sm text-ink-400">/{required || '—'}</span></p>
                      <p className="section-label">Days done</p>
                    </div>
                    <div className="text-right">
                      <p className={`stat-value text-lg ${pct !== null ? statusColors(pct >= 90 ? 'present' : pct >= 75 ? 'late' : 'absent').text : ''}`}>
                        {pct !== null ? `${pct}%` : '—'}
                      </p>
                      <p className="section-label">Attendance</p>
                    </div>
                    <ChevronDown size={18} className={`shrink-0 text-ink-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-surface-line bg-surface-alt/30 p-5">
                    {r.hospital?.address && (
                      <p className="mb-4 flex items-center gap-1.5 text-xs text-ink-500">
                        <Building2 size={12} /> {r.hospital.address}
                      </p>
                    )}

                    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {[
                        { label: 'Present', value: breakdown.present, tone: 'present' as const },
                        { label: 'Late', value: breakdown.late, tone: 'late' as const },
                        { label: 'Very Late', value: breakdown.veryLate, tone: 'very_late' as const },
                        { label: 'Absent', value: breakdown.absent, tone: 'absent' as const },
                        { label: 'Excused', value: breakdown.excused, tone: 'excused' as const },
                      ].map((s) => {
                        const c = statusColors(s.tone);
                        return (
                          <div key={s.label} className={`rounded-xl border ${c.border} ${c.bg} px-2.5 py-2 text-center`}>
                            <p className={`font-display text-lg font-semibold tabular-nums ${c.text}`}>{s.value}</p>
                            <p className="section-label mt-0.5 text-[9px]">{s.label}</p>
                          </div>
                        );
                      })}
                    </div>

                    {appeals.length > 0 && (
                      <div className="mb-4">
                        <p className="section-label mb-2 flex items-center gap-1.5"><FileWarning size={11} /> Appeals filed during this rotation</p>
                        <div className="space-y-1.5">
                          {appeals.map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs ring-1 ring-inset ring-surface-line">
                              <span className="min-w-0 flex-1 truncate text-ink-600">
                                {a.date ? format(new Date(a.date), 'MMM d, yyyy') : '—'} — {a.reason}
                              </span>
                              <Badge tone={a.status === 'approved' ? 'present' : a.status === 'rejected' ? 'expired' : 'late'}>{a.status}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="section-label mb-2">Day-by-day</p>
                    {sortedRecords.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-surface-line py-6 text-center text-xs text-ink-400">No attendance recorded for this rotation yet.</p>
                    ) : (
                      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                        {sortedRecords.map((rec) => {
                          const c = statusColors(rec.status);
                          return (
                            <div key={rec.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs ring-1 ring-inset ring-surface-line">
                              <span className="tabular-nums text-ink-600">{format(new Date(rec.date), 'EEE, MMM d, yyyy')}</span>
                              <span className="flex items-center gap-2 tabular-nums text-ink-400">
                                {rec.check_in_time && <span>In {format(new Date(rec.check_in_time), 'h:mm a')}</span>}
                                {rec.check_out_time && <span>Out {format(new Date(rec.check_out_time), 'h:mm a')}</span>}
                                <span className={`rounded-full px-2 py-0.5 font-semibold ${c.bg} ${c.text}`}>{rec.status.replace('_', ' ')}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
