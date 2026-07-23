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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl2 bg-surface p-6 shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <FullScreenLoader label="Loading student profile…" />
        ) : !student ? (
          <div className="py-8 text-center text-sm text-ink-500">Student not found.</div>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-vital-100 text-xl font-semibold text-vital-700">
                  {profile?.photo_url ? (
                    <img src={profile.photo_url} alt={profile.full_name} className="h-full w-full object-cover" />
                  ) : (
                    (profile?.full_name?.[0] ?? '?').toUpperCase()
                  )}
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink-900">{profile?.full_name ?? '(profile missing)'}</h2>
                  <p className="text-sm text-ink-500">{student.program ?? student.department} · Year {student.year} · Batch {student.batch}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={student.status === 'active' ? 'present' : student.status === 'completed' ? 'clinical' : 'neutral'}>{student.status.replace('_', ' ')}</Badge>
                    {student.late_attendance_concern && <Badge tone="verylate">Late concern</Badge>}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="text-ink-300 hover:text-ink-500">
                <X size={20} />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 border-y border-surface-line py-4 text-sm sm:grid-cols-4">
              <div><p className="text-ink-300">Student ID</p><p className="font-medium text-ink-900">{student.university_id ?? '—'}</p></div>
              <div><p className="text-ink-300">CPVS ID</p><p className="font-medium text-ink-900">{student.student_id}</p></div>
              <div><p className="text-ink-300">Institution</p><p className="font-medium text-ink-900">{student.institution}</p></div>
              <div><p className="text-ink-300">Email</p><p className="truncate font-medium text-ink-900">{profile?.email ?? '—'}</p></div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-surface-line p-3 text-center">
                <p className="font-display text-xl font-semibold text-ink-900">{rotations.length}</p>
                <p className="text-[11px] text-ink-500">Total rotations</p>
              </div>
              <div className="rounded-xl border border-surface-line p-3 text-center">
                <p className="font-display text-xl font-semibold text-vital-600">{completedRotations}</p>
                <p className="text-[11px] text-ink-500">Completed</p>
              </div>
              <div className="rounded-xl border border-surface-line p-3 text-center">
                <p className="font-display text-xl font-semibold text-clinical-600">{activeRotations}</p>
                <p className="text-[11px] text-ink-500">Active</p>
              </div>
              <div className="rounded-xl border border-surface-line p-3 text-center">
                <p className="font-display text-xl font-semibold text-status-expired">{cancelledRotations}</p>
                <p className="text-[11px] text-ink-500">Cancelled</p>
              </div>
            </div>

            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp size={14} className="text-clinical-600" />
                <p className="text-sm font-medium text-ink-700">Attendance</p>
                {attendancePct !== null && <span className="text-xs text-ink-300">— {attendancePct}% overall</span>}
              </div>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="rounded-lg bg-status-present/10 p-2"><p className="font-semibold text-status-present">{attendanceCounts.present}</p><p className="text-ink-500">Present</p></div>
                <div className="rounded-lg bg-status-late/10 p-2"><p className="font-semibold text-status-late">{attendanceCounts.late}</p><p className="text-ink-500">Late</p></div>
                <div className="rounded-lg bg-status-verylate/10 p-2"><p className="font-semibold text-status-verylate">{attendanceCounts.veryLate}</p><p className="text-ink-500">Very late</p></div>
                <div className="rounded-lg bg-status-expired/10 p-2"><p className="font-semibold text-status-expired">{attendanceCounts.absent}</p><p className="text-ink-500">Absent</p></div>
                <div className="rounded-lg bg-ink-300/10 p-2"><p className="font-semibold text-ink-500">{attendanceCounts.excused}</p><p className="text-ink-500">Excused</p></div>
              </div>
            </div>

            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <FileWarning size={14} className="text-status-verylate" />
                <p className="text-sm font-medium text-ink-700">Appeals</p>
                <span className="text-xs text-ink-300">— {appeals.length} filed{pendingAppeals > 0 ? `, ${pendingAppeals} pending` : ''}</span>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <Repeat size={14} className="text-clinical-600" />
                <p className="text-sm font-medium text-ink-700">Rotation history</p>
              </div>
              {rotations.length === 0 ? (
                <p className="text-sm text-ink-300">No rotations assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {rotations.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border border-surface-line px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-ink-900">{r.hospital?.name ?? '—'}</p>
                        <p className="text-xs text-ink-500">{r.start_date} → {r.end_date}</p>
                      </div>
                      <Badge tone={r.status === 'active' ? 'present' : r.status === 'cancelled' ? 'expired' : 'clinical'}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-1.5 border-t border-surface-line pt-4 text-xs text-ink-300">
              <CalendarCheck2 size={13} /> Joined {new Date(student.created_at).toLocaleDateString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
