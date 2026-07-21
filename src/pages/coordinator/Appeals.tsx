import { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Appeal, AttendanceRecord, Student, Profile } from '../../types/database';

type Row = Appeal & { student: Student & { profile: Profile }; attendance: AttendanceRecord };

export default function CoordinatorAppeals() {
  const { coordinator } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('appeals')
      .select('*, student:students(*, profile:profiles(*)), attendance:attendance(*)')
      .order('created_at', { ascending: false });
    setRows((data as any) ?? []);
    setLoading(false);
  }

  async function review(appeal: Row, decision: 'approved' | 'rejected') {
    setWorking(appeal.id);
    await supabase.from('appeals').update({
      status: decision,
      coordinator_comment: comments[appeal.id] ?? null,
      reviewed_by: coordinator?.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', appeal.id);

    if (decision === 'approved') {
      await supabase.from('attendance').update({ status: 'excused' }).eq('id', appeal.attendance_id);
    }

    await supabase.from('notifications').insert({
      user_id: appeal.student_id,
      title: `Appeal ${decision}`,
      message: decision === 'approved'
        ? 'Your absence appeal was approved and the record has been excused.'
        : 'Your absence appeal was reviewed and rejected.',
      type: 'appeal_result',
      related_id: appeal.id,
    });

    setWorking(null);
    load();
  }

  if (loading) return <FullScreenLoader label="Loading appeals…" />;

  const pending = rows.filter((r) => r.status === 'pending');
  const resolved = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Absence appeals</h1>
        <p className="mt-1 text-sm text-ink-500">Review student appeals and decide on each absence.</p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-base font-semibold text-ink-900">Pending ({pending.length})</h2>
        <div className="space-y-3">
          {pending.length === 0 && <p className="text-sm text-ink-500">No pending appeals.</p>}
          {pending.map((r) => (
            <div key={r.id} className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-ink-900">{r.student?.profile?.full_name}</p>
                <span className="text-xs text-ink-300">Absence on {r.attendance?.date}</span>
              </div>
              <p className="mt-2 text-sm text-ink-700">{r.reason}</p>
              {r.file_url && <p className="mt-1 text-xs text-clinical-600">Attachment on file</p>}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  placeholder="Optional comment…"
                  className="input-field flex-1"
                  value={comments[r.id] ?? ''}
                  onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })}
                />
                <button onClick={() => review(r, 'approved')} disabled={working === r.id} className="btn-primary !bg-vital-600 hover:!bg-vital-700">
                  {working === r.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                </button>
                <button onClick={() => review(r, 'rejected')} disabled={working === r.id} className="btn-secondary">
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-base font-semibold text-ink-900">Resolved</h2>
        <div className="surface-card divide-y divide-surface-line">
          {resolved.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-ink-900">{r.student?.profile?.full_name}</p>
                <p className="text-xs text-ink-500">{r.attendance?.date}</p>
              </div>
              <Badge tone={r.status === 'approved' ? 'present' : 'expired'}>{r.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
