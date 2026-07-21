import { useEffect, useState } from 'react';
import { Megaphone, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Announcement } from '../../types/database';

export default function CoordinatorAnnouncements() {
  const { coordinator } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'normal' as 'normal' | 'emergency', target_batch: '' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data: created } = await supabase.from('announcements').insert({
      coordinator_id: coordinator?.id,
      title: form.title,
      content: form.content,
      type: form.type,
      target_batch: form.target_batch || null,
    }).select().single();

    // Fan out a notification to every student (optionally filtered by batch).
    if (created) {
      let studentQuery = supabase.from('students').select('id');
      if (form.target_batch) studentQuery = studentQuery.eq('batch', form.target_batch);
      const { data: targetStudents } = await studentQuery;
      if (targetStudents && targetStudents.length > 0) {
        await supabase.from('notifications').insert(
          targetStudents.map((s) => ({
            user_id: s.id,
            title: form.type === 'emergency' ? `🚨 ${form.title}` : form.title,
            message: form.content,
            type: 'announcement' as const,
            related_id: created.id,
          }))
        );
      }
    }

    setSubmitting(false);
    setShowForm(false);
    setForm({ title: '', content: '', type: 'normal', target_batch: '' });
    load();
  }

  if (loading) return <FullScreenLoader label="Loading announcements…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Announcements</h1>
          <p className="mt-1 text-sm text-ink-500">Emergency announcements notify students immediately.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <Plus size={16} /> New announcement
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="surface-card space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Title</label>
            <input required className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Content</label>
            <textarea required className="input-field min-h-[90px]" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Type</label>
              <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                <option value="normal">Normal</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Target batch (optional)</label>
              <input className="input-field" placeholder="e.g. 2024, leave blank for all" value={form.target_batch} onChange={(e) => setForm({ ...form, target_batch: e.target.value })} />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Megaphone size={16} />} Publish
          </button>
        </form>
      )}

      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className={`surface-card p-5 ${a.type === 'emergency' ? 'border-l-4 border-l-status-expired' : ''}`}>
            <div className="flex items-center gap-2">
              {a.type === 'emergency' && <AlertTriangle size={14} className="text-status-expired" />}
              <p className="font-medium text-ink-900">{a.title}</p>
              {a.type === 'emergency' && <Badge tone="expired">Emergency</Badge>}
              {a.target_batch && <Badge tone="clinical">Batch {a.target_batch}</Badge>}
            </div>
            <p className="mt-2 text-sm text-ink-700">{a.content}</p>
            <p className="mt-2 text-xs text-ink-300">{new Date(a.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
