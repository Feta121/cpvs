import { useEffect, useState } from 'react';
import { FileWarning, Paperclip, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Appeal, AttendanceRecord } from '../../types/database';

export default function StudentAppeals() {
  const { student } = useAuth();
  const [loading, setLoading] = useState(true);
  const [absences, setAbsences] = useState<AttendanceRecord[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [selectedAttendance, setSelectedAttendance] = useState<string>('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    loadData();
  }, [student]);

  async function loadData() {
    setLoading(true);
    const { data: appealsData } = await supabase
      .from('appeals')
      .select('*')
      .eq('student_id', student!.id)
      .order('created_at', { ascending: false });
    setAppeals(appealsData ?? []);

    const appealedAttendanceIds = new Set((appealsData ?? []).map((a) => a.attendance_id));

    const { data: absenceData } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', student!.id)
      .eq('status', 'absent')
      .order('date', { ascending: false });

    setAbsences((absenceData ?? []).filter((a) => !appealedAttendanceIds.has(a.id)));
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!selectedAttendance || !reason.trim()) {
      setFormError('Select an absence and provide a reason.');
      return;
    }
    setSubmitting(true);

    let fileUrl: string | null = null;
    if (file) {
      const path = `${student!.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('appeal-files').upload(path, file);
      if (uploadError) {
        setFormError('File upload failed: ' + uploadError.message);
        setSubmitting(false);
        return;
      }
      fileUrl = path;
    }

    const { error } = await supabase.from('appeals').insert({
      student_id: student!.id,
      attendance_id: selectedAttendance,
      reason,
      file_url: fileUrl,
      status: 'pending',
    });

    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      return;
    }

    setReason('');
    setFile(null);
    setSelectedAttendance('');
    loadData();
  }

  if (loading) return <FullScreenLoader label="Loading appeals…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Absence appeals</h1>
        <p className="mt-1 text-sm text-ink-500">Submit an appeal for a recorded absence and track its review status.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h2 className="mb-4 font-display text-base font-semibold text-ink-900">New appeal</h2>
          {absences.length === 0 ? (
            <p className="text-sm text-ink-500">You have no un-appealed absences right now.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Absence date</label>
                <select
                  className="input-field"
                  value={selectedAttendance}
                  onChange={(e) => setSelectedAttendance(e.target.value)}
                  required
                >
                  <option value="">Select an absence…</option>
                  {absences.map((a) => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Reason</label>
                <textarea
                  className="input-field min-h-[100px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain the circumstances of your absence…"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
                  <Paperclip size={14} /> Supporting document (optional)
                </label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-ink-500 file:mr-3 file:rounded-lg file:border-0 file:bg-clinical-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-clinical-700"
                />
              </div>

              {formError && <p className="text-sm text-status-expired">{formError}</p>}

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileWarning size={16} />}
                Submit appeal
              </button>
            </form>
          )}
        </div>

        <div className="surface-card p-6">
          <h2 className="mb-4 font-display text-base font-semibold text-ink-900">Your appeals</h2>
          <div className="space-y-3">
            {appeals.length === 0 && <p className="text-sm text-ink-500">No appeals submitted yet.</p>}
            {appeals.map((a) => (
              <div key={a.id} className="rounded-xl border border-surface-line p-4">
                <div className="flex items-center justify-between">
                  <Badge tone={a.status === 'approved' ? 'present' : a.status === 'rejected' ? 'expired' : 'late'}>
                    {a.status}
                  </Badge>
                  <span className="text-xs text-ink-300">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm text-ink-700">{a.reason}</p>
                {a.coordinator_comment && (
                  <p className="mt-2 rounded-lg bg-surface-muted p-2 text-xs text-ink-500">
                    <strong>Coordinator:</strong> {a.coordinator_comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
