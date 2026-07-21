import { useEffect, useState } from 'react';
import { Plus, CalendarX2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { PracticeException, Hospital } from '../../types/database';

export default function CoordinatorExceptions() {
  const { coordinator } = useAuth();
  const [items, setItems] = useState<(PracticeException & { hospital: Hospital | null })[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ hospital_id: '', date: '', type: 'holiday' as PracticeException['type'], reason: '' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data }, { data: hospitalData }] = await Promise.all([
      supabase.from('practice_exceptions').select('*, hospital:hospitals(*)').order('date', { ascending: false }),
      supabase.from('hospitals').select('*'),
    ]);
    setItems((data as any) ?? []);
    setHospitals(hospitalData ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await supabase.from('practice_exceptions').insert({
      hospital_id: form.hospital_id || null,
      date: form.date,
      type: form.type,
      reason: form.reason || null,
      created_by: coordinator?.id,
    });
    setSubmitting(false);
    setShowForm(false);
    setForm({ hospital_id: '', date: '', type: 'holiday', reason: '' });
    load();
  }

  if (loading) return <FullScreenLoader label="Loading exceptions…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Practice exceptions</h1>
          <p className="mt-1 text-sm text-ink-500">Holidays, hospital closures, and cancelled clinical days don't count as absences.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <Plus size={16} /> Add exception
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="surface-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Hospital (optional — leave blank for all)</label>
            <select className="input-field" value={form.hospital_id} onChange={(e) => setForm({ ...form, hospital_id: e.target.value })}>
              <option value="">All hospitals</option>
              {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Date</label>
            <input required type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Type</label>
            <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
              <option value="holiday">Holiday</option>
              <option value="closure">Hospital closure</option>
              <option value="cancelled">Cancelled clinical day</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Reason (optional)</label>
            <input className="input-field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Save exception
            </button>
          </div>
        </form>
      )}

      <div className="surface-card divide-y divide-surface-line">
        {items.length === 0 && (
          <div className="p-8 text-center text-sm text-ink-500">
            <CalendarX2 className="mx-auto mb-2 text-ink-300" size={24} /> No exceptions recorded.
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-ink-900">{it.date} — {it.hospital?.name ?? 'All hospitals'}</p>
              {it.reason && <p className="text-xs text-ink-500">{it.reason}</p>}
            </div>
            <Badge tone="clinical">{it.type}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
