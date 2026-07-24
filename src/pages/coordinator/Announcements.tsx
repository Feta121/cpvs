import { useEffect, useState } from 'react';
import { Megaphone, Plus, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Announcement } from '../../types/database';

export default function CoordinatorAnnouncements() {
  const { coordinator } = useAuth();
  const { showSuccess, showError } = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: '', content: '', type: 'normal' as 'normal' | 'emergency', target_batch: '' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) showError('Unable to load announcements. ' + error.message);
    setItems(data ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data: created, error } = await supabase.from('announcements').insert({
      coordinator_id: coordinator?.id,
      title: form.title,
      content: form.content,
      type: form.type,
      target_batch: form.target_batch || null,
    }).select().single();

    if (error) {
      setSubmitting(false);
      showError('Unable to publish announcement. ' + error.message);
      return;
    }

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
    showSuccess('Announcement published.');
    setShowForm(false);
    setForm({ title: '', content: '', type: 'normal', target_batch: '' });
    load();
  }

  function handleDelete(a: Announcement) {
    setPendingDelete(a);
  }

  async function confirmDelete() {
    const a = pendingDelete;
    if (!a) return;
    setPendingDelete(null);
    setDeletingId(a.id);
    const { error } = await supabase.from('announcements').delete().eq('id', a.id);
    setDeletingId(null);

    if (error) {
      showError('Unable to delete announcement. ' + error.message);
      return;
    }
    showSuccess('Announcement deleted.');
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
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Megaphone size={16} />} Publish
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className={`surface-card p-5 ${a.type === 'emergency' ? 'border-l-4 border-l-status-expired' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {a.type === 'emergency' && <AlertTriangle size={14} className="text-status-expired" />}
                  <p className="font-medium text-ink-900">{a.title}</p>
                  {a.type === 'emergency' && <Badge tone="expired">Emergency</Badge>}
                  {a.target_batch && <Badge tone="clinical">Batch {a.target_batch}</Badge>}
                </div>
                <p className="mt-2 text-sm text-ink-700">{a.content}</p>
                <p className="mt-2 text-xs text-ink-300">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={() => handleDelete(a)}
                disabled={deletingId === a.id}
                title="Delete announcement"
                className="shrink-0 rounded-lg border border-status-expired/30 p-1.5 text-status-expired hover:bg-status-expired/5"
              >
                {deletingId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this announcement?"
        message={`"${pendingDelete?.title}" will be permanently removed. Students who already saw the notification will keep it in their history.`}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
