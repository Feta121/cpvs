import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { groupByBatch } from '../../utils/grouping';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Hospital, Student, Rotation, Profile } from '../../types/database';

type RotationRow = Rotation & { student: (Student & { profile: Profile | null }) | null; hospital: Hospital | null };

export default function CoordinatorRotations() {
  const { coordinator } = useAuth();
  const { showSuccess, showError } = useToast();
  const [rotations, setRotations] = useState<RotationRow[]>([]);
  const [students, setStudents] = useState<(Student & { profile: Profile | null })[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [batchFilter, setBatchFilter] = useState('all');
  const [form, setForm] = useState({ student_id: '', hospital_id: '', start_date: '', end_date: '' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: rotationData, error: rErr }, { data: studentData, error: sErr }, { data: hospitalData, error: hErr }] = await Promise.all([
      supabase.from('rotations').select('*, student:students(*), hospital:hospitals(*)').order('start_date', { ascending: false }),
      supabase.from('students').select('*').eq('status', 'active'),
      supabase.from('hospitals').select('*').eq('is_active', true),
    ]);
    if (rErr || sErr || hErr) {
      showError('Unable to load rotations. ' + (rErr?.message ?? sErr?.message ?? hErr?.message));
      setLoading(false);
      return;
    }

    try {
      const allStudentIds = [
        ...(rotationData ?? []).map((r: any) => r.student?.id),
        ...(studentData ?? []).map((s) => s.id),
      ];
      const profileMap = await fetchProfilesById(allStudentIds);

      const mergedRotations = (rotationData ?? []).map((r: any) => ({
        ...r,
        student: r.student ? { ...r.student, profile: profileMap.get(r.student.id) ?? null } : null,
      }));
      const mergedStudents = (studentData ?? []).map((s) => ({ ...s, profile: profileMap.get(s.id) ?? null }));

      setRotations(mergedRotations);
      setStudents(mergedStudents);
    } catch (err: any) {
      showError('Unable to load student profiles. ' + (err?.message ?? ''));
      setRotations((rotationData ?? []).map((r: any) => ({ ...r, student: r.student ? { ...r.student, profile: null } : null })));
      setStudents((studentData ?? []).map((s) => ({ ...s, profile: null })));
    }

    setHospitals(hospitalData ?? []);
    setLoading(false);
  }

  const batches = useMemo(() => Array.from(new Set(rotations.map((r) => r.student?.batch).filter(Boolean) as string[])).sort(), [rotations]);
  const visibleRotations = batchFilter === 'all' ? rotations : rotations.filter((r) => r.student?.batch === batchFilter);
  const groupedByBatch = useMemo(() => groupByBatch(visibleRotations, (r) => r.student?.batch), [visibleRotations]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Cancel-on-reassign: if this student already has an active rotation
    // elsewhere, confirm with the coordinator before cancelling it — a
    // student should only ever have one active rotation at a time.
    const existingActive = rotations.find((r) => r.student_id === form.student_id && r.status === 'active');
    if (existingActive) {
      const confirmed = window.confirm(
        `This student already has an active rotation at "${existingActive.hospital?.name ?? 'a hospital'}" ` +
        `(${existingActive.start_date} → ${existingActive.end_date}).\n\n` +
        `Assigning this new rotation will CANCEL that one. Their existing attendance history for it is kept, ` +
        `but it will no longer accept new check-ins.\n\nContinue?`
      );
      if (!confirmed) return;
    }

    setSubmitting(true);

    if (existingActive) {
      const { error: cancelError } = await supabase.from('rotations').update({ status: 'cancelled' }).eq('id', existingActive.id);
      if (cancelError) {
        setSubmitting(false);
        showError('Unable to cancel the previous rotation. ' + cancelError.message);
        return;
      }
    }

    const { error } = await supabase.from('rotations').insert({
      student_id: form.student_id,
      hospital_id: form.hospital_id,
      coordinator_id: coordinator?.id,
      start_date: form.start_date,
      end_date: form.end_date,
      status: 'active',
    });
    setSubmitting(false);

    if (error) {
      showError('Unable to assign rotation. ' + error.message);
      return;
    }

    showSuccess(existingActive ? 'Previous rotation cancelled and new rotation assigned.' : 'Rotation assigned successfully.');
    setShowForm(false);
    setForm({ student_id: '', hospital_id: '', start_date: '', end_date: '' });
    load();
  }

  async function handleDelete(r: RotationRow) {
    const confirmed = window.confirm(
      `Delete this rotation for ${r.student?.profile?.full_name ?? 'this student'} at ${r.hospital?.name ?? 'this hospital'}?\n\n` +
      `This PERMANENTLY deletes every attendance record tied to this rotation — this cannot be undone.\n\n` +
      `If you just want to end the rotation without losing attendance history, close this and change its status instead.`
    );
    if (!confirmed) return;

    setDeletingId(r.id);
    const { error } = await supabase.from('rotations').delete().eq('id', r.id);
    setDeletingId(null);

    if (error) {
      showError('Unable to delete rotation. ' + error.message);
      return;
    }
    showSuccess('Rotation deleted.');
    load();
  }

  if (loading) return <FullScreenLoader label="Loading rotations…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Rotations</h1>
          <p className="mt-1 text-sm text-ink-500">Assign students to hospitals for a clinical rotation period.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="input-field w-auto">
            <option value="all">All batches</option>
            {batches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
          </select>
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
            <Plus size={16} /> Assign rotation
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="surface-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Student</label>
            <select required className="input-field" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
              <option value="">Select student…</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.profile?.full_name ?? '(profile missing)'} ({s.student_id})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Hospital</label>
            <select required className="input-field" value={form.hospital_id} onChange={(e) => setForm({ ...form, hospital_id: e.target.value })}>
              <option value="">Select hospital…</option>
              {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Start date</label>
            <input required type="date" className="input-field" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">End date</label>
            <input required type="date" className="input-field" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Save rotation
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {groupedByBatch.length === 0 && (
        <div className="surface-card px-5 py-8 text-center text-ink-500">No rotations assigned yet.</div>
      )}

      {groupedByBatch.map(([batch, rows]) => (
        <div key={batch} className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-ink-700">Batch {batch} <span className="font-normal text-ink-300">({rows.length})</span></h2>
          <div className="surface-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
                <tr>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Hospital</th>
                  <th className="px-5 py-3 font-medium">Dates</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium text-ink-900">{r.student?.profile?.full_name ?? '(profile missing)'}</td>
                    <td className="px-5 py-3 text-ink-500">{r.hospital?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-ink-500">{r.start_date} → {r.end_date}</td>
                    <td className="px-5 py-3">
                      <Badge tone={r.status === 'active' ? 'present' : r.status === 'cancelled' ? 'expired' : 'neutral'}>{r.status}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        title="Delete rotation"
                        className="rounded-lg border border-status-expired/30 p-1.5 text-status-expired hover:bg-status-expired/5"
                      >
                        {deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
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
