import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { groupByBatch } from '../../utils/grouping';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { AttendanceRecord, Hospital, Student, Profile, AttendanceStatus } from '../../types/database';

type Row = AttendanceRecord & { student: (Student & { profile: Profile | null }) | null; hospital: Hospital | null };

const statusOptions: AttendanceStatus[] = ['present', 'late', 'very_late', 'absent', 'excused'];

export default function CoordinatorAttendance() {
  const { coordinator } = useAuth();
  const { preference } = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [students, setStudents] = useState<(Student & { profile: Profile | null })[]>([]);
  const [hospitalFilter, setHospitalFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalFilter, studentFilter]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [hospitalRes, studentRes] = await Promise.all([
        supabase.from('hospitals').select('*'),
        supabase.from('students').select('*'),
      ]);
      if (hospitalRes.error) throw hospitalRes.error;
      if (studentRes.error) throw studentRes.error;
      setHospitals(hospitalRes.data ?? []);

      let query = supabase
        .from('attendance')
        .select('*, student:students(*), hospital:hospitals(*)')
        .order('date', { ascending: false })
        .limit(200);

      if (hospitalFilter !== 'all') query = query.eq('hospital_id', hospitalFilter);
      if (studentFilter !== 'all') query = query.eq('student_id', studentFilter);

      const { data, error } = await query;
      if (error) throw error;

      const allStudentIds = [
        ...(studentRes.data ?? []).map((s) => s.id),
        ...(data ?? []).map((r: any) => r.student?.id),
      ];
      const profileMap = await fetchProfilesById(allStudentIds);

      setStudents((studentRes.data ?? []).map((s) => ({ ...s, profile: profileMap.get(s.id) ?? null })));
      setRows((data ?? []).map((r: any) => ({
        ...r,
        student: r.student ? { ...r.student, profile: profileMap.get(r.student.id) ?? null } : null,
      })));
    } catch (err: any) {
      setLoadError(err?.message ?? 'Unable to load attendance records.');
    } finally {
      setLoading(false);
    }
  }

  async function correctStatus(id: string, status: AttendanceStatus) {
    const { error } = await supabase.from('attendance').update({
      status,
      corrected_by: coordinator?.id,
      corrected_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) {
      setLoadError('Unable to update status: ' + error.message);
      return;
    }
    load();
  }

  if (loading) return <FullScreenLoader label="Loading attendance records…" />;

  const batches = Array.from(new Set(rows.map((r) => r.student?.batch).filter(Boolean) as string[])).sort();
  const visibleRows = batchFilter === 'all' ? rows : rows.filter((r) => r.student?.batch === batchFilter);
  const groupedByBatch = groupByBatch(visibleRows, (r) => r.student?.batch);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Attendance management</h1>
        <p className="mt-1 text-sm text-ink-500">View and correct attendance records across your students.</p>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-status-expired/20 bg-status-expired/5 px-4 py-3 text-sm text-status-expired">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select value={hospitalFilter} onChange={(e) => setHospitalFilter(e.target.value)} className="input-field w-auto">
          <option value="all">All hospitals</option>
          {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="input-field w-auto">
          <option value="all">All students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.profile?.full_name ?? '(profile missing)'}</option>)}
        </select>
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="input-field w-auto">
          <option value="all">All batches</option>
          {batches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
        </select>
      </div>

      {groupedByBatch.length === 0 && (
        <div className="surface-card px-5 py-8 text-center text-ink-500">No attendance records yet.</div>
      )}

      {groupedByBatch.map(([batch, batchRows]) => (
        <div key={batch} className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-ink-700">Batch {batch} <span className="font-normal text-ink-300">({batchRows.length})</span></h2>
          <div className="surface-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Hospital</th>
                  <th className="px-5 py-3 font-medium">Check-in</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Correct</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-line">
                {batchRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-ink-500">{r.date}</td>
                    <td className="px-5 py-3 font-medium text-ink-900">{r.student?.profile?.full_name ?? '(profile missing)'}</td>
                    <td className="px-5 py-3 text-ink-500">{r.hospital?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-ink-500">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                    <td className="px-5 py-3">
                      <Badge tone={r.status === 'present' ? 'present' : r.status === 'late' ? 'late' : r.status === 'very_late' ? 'verylate' : r.status === 'absent' ? 'expired' : 'neutral'}>
                        {r.status?.replace('_', ' ') ?? 'unknown'}
                      </Badge>
                      {r.corrected_by && <span className="ml-2 text-[10px] text-ink-300">edited</span>}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={r.status}
                        onChange={(e) => correctStatus(r.id, e.target.value as AttendanceStatus)}
                        className="rounded-lg border border-surface-line bg-surface px-2 py-1 text-xs text-ink-900"
                        style={{ colorScheme: preference }}
                      >
                        {statusOptions.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}