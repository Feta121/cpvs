import { useEffect, useState } from 'react';
import { UserPlus, Loader2, Copy, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Profile, Student } from '../../types/database';

type StudentRow = Student & { profile: Profile };

const emptyForm = {
  fullName: '',
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
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issuedCreds, setIssuedCreds] = useState<{ username: string; tempPassword: string; studentId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('*, profile:profiles(*)')
      .order('created_at', { ascending: false });
    if (error) {
      showError('Unable to load students. ' + error.message);
    } else {
      setStudents((data as any) ?? []);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    if (!form.fullName.trim() || !form.department.trim() || !form.batch.trim()) {
      showError('Unable to add student. Full name, department, and batch are required.');
      return;
    }

    setSubmitting(true);
    // supabase.functions.invoke throws into `error` (not a rejected promise)
    // on both network failures and non-2xx responses from the function, so
    // this single check handles: function not deployed, network drop, and
    // an explicit { error } payload returned by the function itself.
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
    loadStudents(); // refresh the list automatically, per spec
  }

  function copyCreds() {
    if (!issuedCreds) return;
    navigator.clipboard.writeText(`Username: ${issuedCreds.username}\nTemporary password: ${issuedCreds.tempPassword}`);
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

  if (loading) return <FullScreenLoader label="Loading students…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Students</h1>
          <p className="mt-1 text-sm text-ink-500">Manage student accounts and clinical status.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <UserPlus size={16} /> Add student
        </button>
      </div>

      {issuedCreds && (
        <div className="surface-card border-l-4 border-l-vital-500 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-900">Credentials generated — share these with the student securely.</p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span><strong>Username:</strong> {issuedCreds.username}</span>
                <span><strong>Temp password:</strong> {issuedCreds.tempPassword}</span>
                <span><strong>Student ID:</strong> {issuedCreds.studentId}</span>
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
            A profile photo can be added by the student themselves from their Profile page after their first login.
          </p>

          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Create student account
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Student ID</th>
              <th className="px-5 py-3 font-medium">Program</th>
              <th className="px-5 py-3 font-medium">Batch / Year</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Flag</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-line">
            {students.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-ink-500">No students yet. Click "Add student" to create the first account.</td></tr>
            )}
            {students.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 font-medium text-ink-900">{s.profile?.full_name}</td>
                <td className="px-5 py-3 text-ink-500">{s.student_id}</td>
                <td className="px-5 py-3 text-ink-500">{s.program ?? s.department}</td>
                <td className="px-5 py-3 text-ink-500">{s.batch} · Y{s.year}</td>
                <td className="px-5 py-3">
                  <Badge tone={s.status === 'active' ? 'present' : s.status === 'completed' ? 'clinical' : 'neutral'}>
                    {s.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  {s.late_attendance_concern ? <Badge tone="verylate">Late concern</Badge> : <span className="text-ink-300">—</span>}
                </td>
                <td className="px-5 py-3">
                  <select
                    value={s.status}
                    onChange={(e) => updateStatus(s.id, e.target.value as Student['status'])}
                    className="rounded-lg border border-surface-line px-2 py-1 text-xs"
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed Practice</option>
                    <option value="past">Past Student</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}