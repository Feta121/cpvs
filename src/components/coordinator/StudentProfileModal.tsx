import { useEffect, useState } from 'react';
import { X, Repeat, CalendarCheck2, FileWarning, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../ui/FullScreenLoader';
import type { Student, Profile, Rotation, Hospital, Appeal, AttendanceStatus } from '../../types/database';

const PRESENT_LIKE: AttendanceStatus[] = ['present', 'late', 'very_late'];

interface Props {
  studentId: string;
  onClose: () => void;
}

export default function StudentProfileModal({ studentId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rotations, setRotations] = useState<(Rotation & { hospital: Hospital | null })[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState({ total: 0, present: 0, late: 0, veryLate: 0, absent: 0, excused: 0 });
  const [appeals, setAppeals] = useState<Appeal[]>([]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function load() {
    setLoading(true);
    const [{ data: studentData }, profileMap, { data: rotationData }, { data: attendanceData }, { data: appealData }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).maybeSingle(),
      fetchProfilesById([studentId]),
      supabase.from('rotations').select('*, hospital:hospitals(*)').eq('student_id', studentId).order('start_date', { ascending: false }),
      supabase.from('attendance').select('status').eq('student_id', studentId),
      supabase.from('appeals').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
    ]);

    setStudent(studentData ?? null);
    setProfile(profileMap.get(studentId) ?? null);
    setRotations((rotationData as any) ?? []);
    setAppeals(appealData ?? []);

    const rows = attendanceData ?? [];
    setAttendanceCounts({
      total: rows.length,
      present: rows.filter((r) => r.status === 'present').length,
      late: rows.filter((r) => r.status === 'late').length,
      veryLate: rows.filter((r) => r.status === 'very_late').length,
      absent: rows.filter((r) => r.status === 'absent').length,
      excused: rows.filter((r) => r.status === 'excused').length,
    });

    setLoading(false);
  }

  const presentLikeCount = attendanceCounts.present + attendanceCounts.late + attendanceCounts.veryLate;
  const attendancePct = attendanceCounts.total > 0 ? Math.round((presentLikeCount / attendanceCounts.total) * 100) : null;
  const completedRotations = rotations.filter((r) => r.status === 'completed').length;
  const activeRotations = rotations.filter((r) => r.status === 'active').length;
  const cancelledRotations = rotations.filter((r) => r.status === 'cancelled').length;
  const pendingAppeals = appeals.filter((a) => a.status === 'pending').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel max-h-[85vh] max-w-2xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <FullScreenLoader label="Loading student profile…" />
        ) : !student ? (
          <div className="py-8 text-center text-sm text-ink-500">Student not found.</div>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-vital-400 to-clinical-500 text-xl font-bold text-onAccent shadow-glow-accent ring-2 ring-surface">
                  {profile?.photo_url ? (
                    <img src={profile.photo_url} alt={profile.full_name} className="h-full w-full object-cover" />
                  ) : (
                    (profile?.full_name?.[0] ?? '?').toUpperCase()
                  )}
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold tracking-tightest text-ink-900">{profile?.full_name ?? '(profile missing)'}</h2>
                  <p className="mt-0.5 text-sm text-ink-500">{student.program ?? student.department} · Year {student.year} · Batch {student.batch}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={student.status === 'active' ? 'present' : student.status === 'completed' ? 'clinical' : 'neutral'}>{student.status.replace('_', ' ')}</Badge>
                    {student.late_attendance_concern && <Badge tone="verylate">Late concern</Badge>}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="btn-icon h-8 w-8" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="inset-panel mb-5 grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
              <div><p className="section-label">Student ID</p><p className="mt-1 font-semibold text-ink-900">{student.university_id ?? '—'}</p></div>
              <div><p className="section-label">CPVS ID</p><p className="mt-1 font-semibold text-ink-900">{student.student_id}</p></div>
              <div><p className="section-label">Institution</p><p className="mt-1 truncate font-semibold text-ink-900">{student.institution}</p></div>
              <div><p className="section-label">Email</p><p className="mt-1 truncate font-semibold text-ink-900">{profile?.email ?? '—'}</p></div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { value: rotations.length, label: 'Total rotations', color: 'text-ink-900', ring: 'ring-surface-line', bg: 'bg-surface-alt/40' },
                { value: completedRotations, label: 'Completed', color: 'text-vital-600', ring: 'ring-vital-500/25', bg: 'bg-vital-500/8' },
                { value: activeRotations, label: 'Active', color: 'text-clinical-600', ring: 'ring-clinical-500/25', bg: 'bg-clinical-500/8' },
                { value: cancelledRotations, label: 'Cancelled', color: 'text-status-expired', ring: 'ring-status-expired/25', bg: 'bg-status-expired/8' },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl2 p-3.5 text-center ring-1 ring-inset ${s.bg} ${s.ring}`}>
                  <p className={`stat-value text-2xl ${s.color}`}>{s.value}</p>
                  <p className="mt-1 text-[11px] font-medium text-ink-500">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="icon-tile h-7 w-7 rounded-lg">
                  <TrendingUp size={14} strokeWidth={2.5} />
                </span>
                <p className="text-sm font-semibold text-ink-900">Attendance</p>
                {attendancePct !== null && (
                  <span className="chip ml-auto py-0.5 tabular-nums">{attendancePct}% overall</span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="rounded-xl bg-status-present/10 p-2.5 ring-1 ring-inset ring-status-present/20"><p className="stat-value text-base text-status-present">{attendanceCounts.present}</p><p className="mt-0.5 text-ink-500">Present</p></div>
                <div className="rounded-xl bg-status-late/10 p-2.5 ring-1 ring-inset ring-status-late/20"><p className="stat-value text-base text-status-late">{attendanceCounts.late}</p><p className="mt-0.5 text-ink-500">Late</p></div>
                <div className="rounded-xl bg-status-verylate/10 p-2.5 ring-1 ring-inset ring-status-verylate/20"><p className="stat-value text-base text-status-verylate">{attendanceCounts.veryLate}</p><p className="mt-0.5 text-ink-500">Very late</p></div>
                <div className="rounded-xl bg-status-expired/10 p-2.5 ring-1 ring-inset ring-status-expired/20"><p className="stat-value text-base text-status-expired">{attendanceCounts.absent}</p><p className="mt-0.5 text-ink-500">Absent</p></div>
                <div className="rounded-xl bg-ink-300/10 p-2.5 ring-1 ring-inset ring-surface-line"><p className="stat-value text-base text-ink-500">{attendanceCounts.excused}</p><p className="mt-0.5 text-ink-500">Excused</p></div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-verylate/12 text-status-verylate ring-1 ring-inset ring-status-verylate/25">
                  <FileWarning size={14} strokeWidth={2.5} />
                </span>
                <p className="text-sm font-semibold text-ink-900">Appeals</p>
                <span className="ml-auto text-xs text-ink-500">{appeals.length} filed{pendingAppeals > 0 ? `, ${pendingAppeals} pending` : ''}</span>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="icon-tile h-7 w-7 rounded-lg">
                  <Repeat size={14} strokeWidth={2.5} />
                </span>
                <p className="text-sm font-semibold text-ink-900">Rotation history</p>
              </div>
              {rotations.length === 0 ? (
                <p className="rounded-xl2 border border-dashed border-surface-line py-6 text-center text-sm text-ink-400">No rotations assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {rotations.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-xl2 border border-surface-line bg-surface-alt/40 px-3.5 py-2.5 text-sm transition-all duration-300 ease-spring hover:border-transparent hover:bg-surface hover:shadow-lift"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{r.hospital?.name ?? '—'}</p>
                        <p className="mt-0.5 text-xs tabular-nums text-ink-500">{r.start_date} → {r.end_date}</p>
                      </div>
                      <Badge tone={r.status === 'active' ? 'present' : r.status === 'cancelled' ? 'expired' : 'clinical'}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-1.5 border-t border-surface-line pt-4 text-xs text-ink-400">
              <CalendarCheck2 size={13} /> Joined {new Date(student.created_at).toLocaleDateString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
