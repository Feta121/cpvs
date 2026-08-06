import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { groupByBatch } from '../../utils/grouping';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import { exportToCsv } from '../../utils/exportCsv';
import BatchAttendanceAccordion from '../../components/coordinator/BatchAttendanceAccordion';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { AttendanceRecord, Hospital, Student, Profile, AttendanceStatus } from '../../types/database';

type Row = AttendanceRecord & { student: (Student & { profile: Profile | null }) | null; hospital: Hospital | null };

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
        // The old flat table capped at 200 rows to stay readable — now that
        // records are organized into a collapsed-by-default Batch -> Month
        // -> Day accordion, loading far more doesn't hurt rendering (nothing
        // renders until a coordinator actually expands a day), so this is
        // raised substantially to actually solve the "gets messy at scale"
        // problem instead of just hiding it behind a low limit.
        .limit(5000);

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

  function handleExport() {
    exportToCsv(
      `cpvs-attendance${batchFilter !== 'all' ? `-batch-${batchFilter}` : ''}`,
      [
        { header: 'Date', value: (r: Row) => r.date },
        { header: 'Day', value: (r: Row) => new Date(r.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' }) },
        { header: 'Student', value: (r: Row) => r.student?.profile?.full_name ?? '' },
        { header: 'Batch', value: (r: Row) => r.student?.batch ?? '' },
        { header: 'Hospital', value: (r: Row) => r.hospital?.name ?? '' },
        { header: 'Check-in', value: (r: Row) => (r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '') },
        { header: 'Check-out', value: (r: Row) => (r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : '') },
        { header: 'Status', value: (r: Row) => r.status },
        { header: 'Corrected', value: (r: Row) => (r.corrected_by ? 'Yes' : 'No') },
      ],
      visibleRows
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Attendance management</h1>
          <p className="mt-1 text-sm text-ink-500">View and correct attendance records across your students.</p>
        </div>
        <button onClick={handleExport} disabled={visibleRows.length === 0} className="btn-secondary">
          <Download size={16} /> Export CSV
        </button>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-status-expired/20 bg-status-expired/5 px-4 py-3 text-sm text-status-expired">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select value={hospitalFilter} onChange={(e) => setHospitalFilter(e.target.value)} className="input-field w-full sm:w-56">
          <option value="all">All hospitals</option>
          {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="input-field w-full sm:w-56">
          <option value="all">All students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.profile?.full_name ?? '(profile missing)'}</option>)}
        </select>
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="input-field w-full sm:w-56">
          <option value="all">All batches</option>
          {batches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
        </select>
      </div>

      {groupedByBatch.length === 0 && (
        <div className="surface-card px-5 py-8 text-center text-ink-500">No attendance records yet.</div>
      )}

      {groupedByBatch.map(([batch, batchRows]) => (
        <BatchAttendanceAccordion
          key={batch}
          batch={batch}
          rows={batchRows}
          colorScheme={preference}
          onCorrectStatus={correctStatus}
          isSingleStudent={studentFilter !== 'all'}
        />
      ))}
    </div>
  );
}
