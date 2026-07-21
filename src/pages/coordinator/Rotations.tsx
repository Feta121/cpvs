import { useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Hospital, Student, Rotation, Profile } from '../../types/database';

type RotationRow = Rotation & { student: Student & { profile: Profile }; hospital: Hospital };

export default function CoordinatorRotations() {
  const { coordinator } = useAuth();
  const [rotations, setRotations] = useState<RotationRow[]>([]);
  const [students, setStudents] = useState<(Student & { profile: Profile })[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ student_id: '', hospital_id: '', start_date: '', end_date: '' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: rotationData }, { data: studentData }, { data: hospitalData }] = await Promise.all([
      supabase.from('rotations').select('*, student:students(*, profile:profiles(*)), hospital:hospitals(*)').order('start_date', { ascending: false }),
      supabase.from('students').select('*, profile:profiles(*)').eq('status', 'active'),
      supabase.from('hospitals').select('*'),
    ]);
    setRotations((rotationData as any) ?? []);
    setStudents((studentData as any) ?? []);
    setHospitals(hospitalData ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await supabase.from('rotations').insert({
      student_id: form.student_id,
      hospital_id: form.hospital_id,
      coordinator_id: coordinator?.id,
      start_date: form.start_date,
      end_date: form.end_date,
      status: 'active',
    });
    setSubmitting(false);
    setShowForm(false);
    setForm({ student_id: '', hospital_id: '', start_date: '', end_date: '' });
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
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <Plus size={16} /> Assign rotation
        </button>
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
          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Save rotation
            </button>
          </div>
        </form>
      )}

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
            <tr>
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Hospital</th>
              <th className="px-5 py-3 font-medium">Dates</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-line">
            {rotations.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium text-ink-900">{r.student?.profile?.full_name}</td>
                <td className="px-5 py-3 text-ink-500">{r.hospital?.name}</td>
                <td className="px-5 py-3 text-ink-500">{r.start_date} → {r.end_date}</td>
                <td className="px-5 py-3">
                  <Badge tone={r.status === 'active' ? 'present' : 'neutral'}>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
