import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Loader2, Copy, Check, X, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../theme/ThemeProvider';
import { groupByBatch } from '../../utils/grouping';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import StudentProfileModal from '../../components/coordinator/StudentProfileModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Profile, Student } from '../../types/database';

type StudentRow = Student & { profile: Profile | null };

const emptyForm = {
  fullName: '',
  universityId: '',
  email: '',
  phone: '',
  department: 'Anesthesia',
  program: 'BSc Anesthesia',
  institution: 'Addis Ababa University',
  year: 4,
  batch: '',
};

export default function CoordinatorStudents() {
  const { showSuccess, showError } = useToast();
  const { preference } = useTheme();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StudentRow | null>(null);
  const [batchFilter, setBatchFilter] = useState('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [issuedCreds, setIssuedCreds] = useState<{ username: string; tempPassword: string; cpvsId: string; universityId: string; loginEmail: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setLoading(true);
    const { data: studentData, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      showError('Unable to load students. ' + error.message);
      setLoading(false);
      return;
    }

    try {
      const profileMap = await fetchProfilesById((studentData ?? []).map((s) => s.id));
      const merged: StudentRow[] = (studentData ?? []).map((s) => ({ ...s, profile: profileMap.get(s.id) ?? null }));
      setStudents(merged);
    } catch (err: any) {
      showError('Unable to load student profiles. ' + (err?.message ?? ''));
      setStudents((studentData ?? []).map((s) => ({ ...s, profile: null })));
    }
    setLoading(false);
  }

  const batches = useMemo(() => Array.from(new Set(students.map((s) => s.batch))).sort(), [students]);

  const visibleStudents = batchFilter === 'all' ? students : students.filter((s) => s.batch === batchFilter);
  const groupedByBatch = useMemo(() => groupByBatch(visibleStudents, (s) => s.batch), [visibleStudents]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    if (!form.fullName.trim() || !form.universityId.trim() || !form.department.trim() || !form.batch.trim()) {
      showError('Unable to add student. Full name, Student ID, department, and batch are required.');
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('create-student', { body: form });
    setSubmitting(false);

    const payloadError = (data as any)?.error;
    if (error || payloadError) {
      showError(payloadError ?? error?.message ?? 'Unable to add student. Please try again or check your connection.');
      return;
    }

    setIssuedCreds(data as any);
    showSuccess('Student successfully added.');
    setForm(emptyForm);
    setShowForm(false);
    loadStudents();
  }

  function copyCreds() {
    if (!issuedCreds) return;
    navigator.clipboard.writeText(
      `Login: ${issuedCreds.username}\nTemporary password: ${issuedCreds.tempPassword}\nCPVS ID: ${issuedCreds.cpvsId}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function updateStatus(id: string, status: Student['status']) {
    const { error } = await supabase.from('students').update({ status }).eq('id', id);
    if (error) {
      showError('Unable to update student status. ' + error.message);
      return;
    }
    showSuccess('Student status updated.');
    loadStudents();
  }

  function handleDelete(s: StudentRow) {
    setPendingDelete(s);
  }

  async function confirmDelete() {
    const s = pendingDelete;
    if (!s) return;
    setPendingDelete(null);
    setDeletingId(s.id);
    const { data, error } = await supabase.functions.invoke('delete-student', { body: { studentId: s.id } });
    setDeletingId(null);

    const payloadError = (data as any)?.error;
    if (error || payloadError) {
      showError(payloadError ?? error?.message ?? 'Unable to delete student.');
      return;
    }
    showSuccess(`${s.profile?.full_name ?? 'Student'} deleted.`);
    loadStudents();
  }

  if (loading) return <FullScreenLoader label="Loading students…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Students</h1>
          <p className="mt-1 text-sm text-ink-500">Manage student accounts and clinical status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="input-field w-auto">
            <option value="all">All batches</option>
            {batches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
          </select>
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
            <UserPlus size={16} /> Add student
          </button>
        </div>
      </div>

      {issuedCreds && (
        <div className="surface-card border-l-4 border-l-vital-500 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-900">Credentials generated — share these with the student securely.</p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span><strong>Login:</strong> {issuedCreds.username}</span>
                <span><strong>Temp password:</strong> {issuedCreds.tempPassword}</span>
                <span><strong>CPVS ID:</strong> {issuedCreds.cpvsId}</span>
                <button onClick={copyCreds} className="btn-secondary !py-1.5 !px-3">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button onClick={() => setIssuedCreds(null)} className="text-ink-300 hover:text-ink-500">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="surface-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Full name</label>
            <input required className="input-field" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Student ID (university ID)</label>
            <input required placeholder="e.g. UGR/3152/15" className="input-field" value={form.universityId} onChange={(e) => setForm({ ...form, universityId: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Personal email (optional)</label>
            <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Phone (optional)</label>
            <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Department</label>
            <input required className="input-field" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Program</label>
            <input className="input-field" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Institution</label>
            <input className="input-field" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Year</label>
            <select className="input-field" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Batch</label>
            <input required placeholder="e.g. 2024" className="input-field" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} />
          </div>

          <p className="text-xs text-ink-500 sm:col-span-2">
            The CPVS ID and login username are generated automatically from the first name and the numeric part of the Student ID (e.g. "Kedir Hassen" + "UGR/3152/15" → CPVS ID "KEDIR-3152", login "kedir3152").
          </p>

          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Create student account
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {groupedByBatch.length === 0 && (
        <div className="surface-card px-5 py-8 text-center text-ink-500">No students yet. Click "Add student" to create the first account.</div>
      )}

      {groupedByBatch.map(([batch, rows]) => (
        <div key={batch} className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-ink-700">Batch {batch} <span className="font-normal text-ink-300">({rows.length})</span></h2>
          <div className="surface-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Student ID</th>
                  <th className="px-5 py-3 font-medium">CPVS ID</th>
                  <th className="px-5 py-3 font-medium">Program</th>
                  <th className="px-5 py-3 font-medium">Year</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Flag</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-line">
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3 font-medium text-ink-900">
                      <button onClick={() => setSelectedStudentId(s.id)} className="text-left hover:text-clinical-600 hover:underline">
                        {s.profile?.full_name ?? '(profile missing)'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-ink-500">{s.university_id ?? '—'}</td>
                    <td className="px-5 py-3 text-ink-500">{s.student_id}</td>
                    <td className="px-5 py-3 text-ink-500">{s.program ?? s.department}</td>
                    <td className="px-5 py-3 text-ink-500">Y{s.year}</td>
                    <td className="px-5 py-3">
                      <Badge tone={s.status === 'active' ? 'present' : s.status === 'completed' ? 'clinical' : 'neutral'}>
                        {s.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {s.late_attendance_concern ? <Badge tone="verylate">Late concern</Badge> : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={s.status}
                          onChange={(e) => updateStatus(s.id, e.target.value as Student['status'])}
                          className="rounded-lg border border-surface-line bg-surface px-2 py-1 text-xs text-ink-900"
                          style={{ colorScheme: preference }}
                        >
                          <option value="active">Active</option>
                          <option value="completed">Completed Practice</option>
                          <option value="past">Past Student</option>
                        </select>
                        <button
                          onClick={() => handleDelete(s)}
                          disabled={deletingId === s.id}
                          title="Delete student"
                          className="rounded-lg border border-status-expired/30 p-1.5 text-status-expired hover:bg-status-expired/5"
                        >
                          {deletingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {selectedStudentId && (
        <StudentProfileModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete ${pendingDelete?.profile?.full_name ?? 'this student'}?`}
        message={`This PERMANENTLY deletes their login, profile, and ALL clinical records — every rotation, attendance record, and appeal tied to them (CPVS ID: ${pendingDelete?.student_id}). This cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
