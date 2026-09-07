import { useEffect, useMemo, useState } from 'react';
import { X, Repeat, CalendarCheck2, FileWarning, TrendingUp, Fingerprint, ShieldOff, Smartphone, IdCard, Building2, Mail, GraduationCap, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import { invokeEdgeFunction } from '../../utils/invokeFunction';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { averageDurationMinutes, formatDurationMinutes } from '../../utils/duration';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../ui/ConfirmDialog';
import FullScreenLoader from '../ui/FullScreenLoader';
import type { Student, Profile, Rotation, Hospital, Appeal, AttendanceRecord, AttendanceStatus, WebauthnCredential } from '../../types/database';

const PRESENT_LIKE: AttendanceStatus[] = ['present', 'late', 'very_late'];

interface Props {
  studentId: string;
  onClose: () => void;
}

export default function StudentProfileModal({ studentId, onClose }: Props) {
  const { coordinator } = useAuth();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rotations, setRotations] = useState<(Rotation & { hospital: Hospital | null })[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState({ total: 0, present: 0, late: 0, veryLate: 0, absent: 0, excused: 0 });
  // Kept separately from attendanceCounts above (which only needs status)
  // because duration needs the raw check_in_time/check_out_time — and per-
  // rotation duration needs rotation_id to group by, hence the full rows
  // rather than another narrower select.
  const [attendanceRows, setAttendanceRows] = useState<Pick<AttendanceRecord, 'rotation_id' | 'check_in_time' | 'check_out_time'>[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [credentials, setCredentials] = useState<WebauthnCredential[]>([]);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function load() {
    setLoading(true);
    const [{ data: studentData }, profileMap, { data: rotationData }, { data: attendanceData }, { data: appealData }, { data: credentialData, error: credentialError }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).maybeSingle(),
      fetchProfilesById([studentId]),
      supabase.from('rotations').select('*, hospital:hospitals(*)').eq('student_id', studentId).order('start_date', { ascending: false }),
      supabase.from('attendance').select('status, rotation_id, check_in_time, check_out_time').eq('student_id', studentId),
      supabase.from('appeals').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
      supabase.from('webauthn_credentials').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
    ]);
    // Same reasoning as the identical fix in Settings.tsx: an empty
    // credentials array used to look the same whether there really were no
    // devices or the query itself failed — this at least makes the second
    // case checkable in the console instead of indistinguishable from the
    // first.
    if (credentialError) console.error('[CPVS] Failed to load webauthn credentials:', credentialError.message);

    setStudent(studentData ?? null);
    setProfile(profileMap.get(studentId) ?? null);
    setRotations((rotationData as any) ?? []);
    setAppeals(appealData ?? []);
    setCredentials(credentialData ?? []);

    const rows = attendanceData ?? [];
    setAttendanceRows(rows);
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

  // "Throughout his clinical practice" — every attendance row across every
  // rotation, not scoped to any one hospital.
  const overallAvgMinutes = useMemo(() => averageDurationMinutes(attendanceRows), [attendanceRows]);
  // "For the selected rotation" — grouped by rotation_id so each row in the
  // rotation list below can show its own figure.
  const avgMinutesByRotation = useMemo(() => {
    const map = new Map<string, ReturnType<typeof averageDurationMinutes>>();
    const byRotation = new Map<string, typeof attendanceRows>();
    attendanceRows.forEach((r) => {
      const list = byRotation.get(r.rotation_id) ?? [];
      list.push(r);
      byRotation.set(r.rotation_id, list);
    });
    byRotation.forEach((records, rotationId) => map.set(rotationId, averageDurationMinutes(records)));
    return map;
  }, [attendanceRows]);

  async function handleResetBiometric() {
    setResetting(true);
    const { error } = await invokeEdgeFunction('reset-biometric-enrollment', { studentId });
    setResetting(false);
    setConfirmingReset(false);
    if (error) {
      showError(error);
      return;
    }
    showSuccess("Biometric enrollment reset — the student will be asked to enroll again next time they sign in.");
    load();
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
        className="modal-panel relative max-h-[85vh] max-w-2xl overflow-y-auto p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-6"><FullScreenLoader label="Loading student profile…" /></div>
        ) : !student ? (
          <div className="p-6 py-8 text-center text-sm text-ink-500">Student not found.</div>
        ) : (
          <>
            {/* Close button moved OUTSIDE the header banner below — it used
                to be absolutely positioned inside that banner, which also
                has `overflow-hidden` (needed to clip the decorative blur
                blobs). An absolutely-positioned child sitting right at the
                edge of an overflow-hidden ancestor is a classic way to end
                up with a button that's visually present but not reliably
                clickable, depending on exact box-sizing. Rendering it here
                instead — a sibling of the banner, not a child of it —
                removes that risk entirely rather than trying to debug
                exactly where the hit-testing broke. */}
            <button onClick={onClose} className="btn-icon absolute right-4 top-4 z-10 h-8 w-8" aria-label="Close">
              <X size={16} />
            </button>

            {/* Header banner — was a plain flat row at the same padding
                level as everything below it; pulled into its own tinted
                section with the app's usual soft blurred accent blobs (see
                Attendance.tsx / CoordinatorDashboard) so the modal opens
                with a clear "hero" instead of just a stack of boxes. */}
            <div className="relative overflow-hidden rounded-t-xl3 border-b border-surface-line bg-surface-alt/30 p-6">
              <span className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-clinical-500/10 blur-3xl" />
              <span className="pointer-events-none absolute -bottom-20 -right-12 h-56 w-56 rounded-full bg-vital-500/10 blur-3xl" />
              <div className="relative flex items-center gap-4 pr-10">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-vital-400 to-clinical-500 text-2xl font-bold text-onAccent shadow-glow-accent ring-4 ring-surface">
                  {profile?.photo_url ? (
                    <img src={profile.photo_url} alt={profile.full_name} className="h-full w-full object-cover" />
                  ) : (
                    (profile?.full_name?.[0] ?? '?').toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-semibold tracking-tightest text-ink-900">{profile?.full_name ?? '(profile missing)'}</h2>
                  <p className="mt-0.5 text-sm text-ink-500">{student.program ?? student.department} · Year {student.year} · Batch {student.batch}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={student.status === 'active' ? 'present' : student.status === 'completed' ? 'clinical' : 'neutral'}>{student.status.replace('_', ' ')}</Badge>
                    {student.late_attendance_concern && <Badge tone="verylate">Late concern</Badge>}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
            {/* Was a plain 2x2 text grid with no visual anchor per field —
                each one now gets its own small icon, matching the
                icon+label micro-pattern already used everywhere else in
                this app (RotationHistory's coordinator/date rows, Settings'
                account row, etc.) instead of being the one place in this
                modal without it. */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: IdCard, label: 'Student ID', value: student.university_id ?? '—' },
                { icon: GraduationCap, label: 'CPVS ID', value: student.student_id },
                { icon: Building2, label: 'Institution', value: student.institution },
                { icon: Mail, label: 'Email', value: profile?.email ?? '—' },
              ].map((f) => (
                <div key={f.label} className="inset-panel p-3.5">
                  <p className="section-label flex items-center gap-1.5"><f.icon size={11} /> {f.label}</p>
                  <p className="mt-1.5 truncate text-sm font-semibold text-ink-900">{f.value}</p>
                </div>
              ))}
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

            <div className="mb-6 border-t border-surface-line pt-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="icon-tile h-7 w-7 rounded-lg">
                  <TrendingUp size={14} strokeWidth={2.5} />
                </span>
                <p className="text-sm font-semibold text-ink-900">Attendance</p>
                <div className="ml-auto flex items-center gap-1.5">
                  {overallAvgMinutes !== null && (
                    <span className="chip py-0.5 tabular-nums"><Clock size={11} /> Avg {formatDurationMinutes(overallAvgMinutes)}</span>
                  )}
                  {attendancePct !== null && (
                    <span className="chip py-0.5 tabular-nums">{attendancePct}% overall</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="rounded-xl bg-status-present/10 p-2.5 ring-1 ring-inset ring-status-present/20"><p className="stat-value text-base text-status-present">{attendanceCounts.present}</p><p className="mt-0.5 text-ink-500">Present</p></div>
                <div className="rounded-xl bg-status-late/10 p-2.5 ring-1 ring-inset ring-status-late/20"><p className="stat-value text-base text-status-late">{attendanceCounts.late}</p><p className="mt-0.5 text-ink-500">Late</p></div>
                <div className="rounded-xl bg-status-verylate/10 p-2.5 ring-1 ring-inset ring-status-verylate/20"><p className="stat-value text-base text-status-verylate">{attendanceCounts.veryLate}</p><p className="mt-0.5 text-ink-500">Very late</p></div>
                <div className="rounded-xl bg-status-expired/10 p-2.5 ring-1 ring-inset ring-status-expired/20"><p className="stat-value text-base text-status-expired">{attendanceCounts.absent}</p><p className="mt-0.5 text-ink-500">Absent</p></div>
                <div className="rounded-xl bg-ink-300/10 p-2.5 ring-1 ring-inset ring-surface-line"><p className="stat-value text-base text-ink-500">{attendanceCounts.excused}</p><p className="mt-0.5 text-ink-500">Excused</p></div>
              </div>
            </div>

            <div className="mb-6 border-t border-surface-line pt-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-verylate/12 text-status-verylate ring-1 ring-inset ring-status-verylate/25">
                  <FileWarning size={14} strokeWidth={2.5} />
                </span>
                <p className="text-sm font-semibold text-ink-900">Appeals</p>
                <span className="ml-auto text-xs text-ink-500">{appeals.length} filed{pendingAppeals > 0 ? `, ${pendingAppeals} pending` : ''}</span>
              </div>
            </div>

            {/* Added alongside reset-biometric-enrollment: shows what the
                student currently has enrolled (method + device(s), if any),
                and — Super Coordinator only, per the security reasoning in
                that edge function's header comment — a reset action for a
                lost/replaced device or a selfie that's stopped matching.
                Read-only for every other coordinator; students themselves
                can never trigger this at all, only see their own status
                (see Settings.tsx). */}
            <div className="mb-6 border-t border-surface-line pt-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="icon-tile h-7 w-7 rounded-lg">
                  <Fingerprint size={14} strokeWidth={2.5} />
                </span>
                <p className="text-sm font-semibold text-ink-900">Biometric check-in</p>
              </div>
              {student.biometric_enrolled_at ? (
                <div className="inset-panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-ink-900">
                      {student.verification_method === 'webauthn' ? 'Fingerprint / Face ID' : student.verification_method === 'selfie' ? 'Selfie match' : '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">Enrolled {new Date(student.biometric_enrolled_at).toLocaleDateString()}</p>
                    {student.verification_method === 'webauthn' && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {credentials.length === 0 ? (
                          <span className="text-xs text-ink-400">No devices on file (may have been removed).</span>
                        ) : (
                          credentials.map((c) => (
                            <span key={c.id} className="chip py-0.5">
                              <Smartphone size={11} /> {c.device_label ?? 'Unnamed device'}
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {coordinator?.is_super_coordinator && (
                    <button
                      onClick={() => setConfirmingReset(true)}
                      className="theme-danger-btn btn-secondary shrink-0 self-start !text-status-expired hover:!border-status-expired/40 px-3 py-1.5 text-xs sm:self-auto"
                    >
                      <ShieldOff size={13} />
                      Reset enrollment
                    </button>
                  )}
                </div>
              ) : (
                <p className="rounded-xl2 border border-dashed border-surface-line py-4 text-center text-xs text-ink-400">Not yet enrolled.</p>
              )}
            </div>

            <div className="border-t border-surface-line pt-5">
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
                  {rotations.map((r) => {
                    const rotationAvg = avgMinutesByRotation.get(r.id) ?? null;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-3 rounded-xl2 border border-surface-line bg-surface-alt/40 px-3.5 py-2.5 text-sm transition-all duration-300 ease-spring hover:border-transparent hover:bg-surface hover:shadow-lift"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{r.hospital?.name ?? '—'}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-ink-500">
                            <span>{r.start_date} → {r.end_date}</span>
                            {rotationAvg !== null && (
                              <span className="flex items-center gap-1 text-ink-400">
                                <Clock size={10} /> avg {formatDurationMinutes(rotationAvg)}
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge tone={r.status === 'active' ? 'present' : r.status === 'cancelled' ? 'expired' : 'clinical'}>{r.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-1.5 border-t border-surface-line pt-4 text-xs text-ink-400">
              <CalendarCheck2 size={13} /> Joined {new Date(student.created_at).toLocaleDateString()}
            </div>
            </div>
          </>
        )}
      </div>

      {/* Wrapped so a click on ConfirmDialog's own backdrop (which cancels
          just the confirm dialog) doesn't also bubble up to this modal's
          overlay onClick and close the whole student profile behind it —
          ConfirmDialog isn't portaled, so it sits inside this DOM subtree. */}
      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open={confirmingReset}
          title="Reset biometric enrollment?"
          message={`${profile?.full_name ?? 'This student'} will be signed out of their current biometric setup and asked to enroll a device or selfie again before their next check-in. This can't be undone.`}
          confirmLabel={resetting ? 'Resetting…' : 'Reset enrollment'}
          onConfirm={handleResetBiometric}
          onCancel={() => setConfirmingReset(false)}
        />
      </div>
    </div>
  );
}
