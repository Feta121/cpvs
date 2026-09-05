import { useEffect, useState } from 'react';
import { FileWarning, Paperclip, Loader2, AlertCircle, ScrollText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import Select from '../../components/ui/Select';
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
        <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">Absence appeals</h1>
        <p className="mt-1 text-sm text-ink-500">Submit an appeal for a recorded absence and track its review status.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="surface-card relative overflow-hidden p-6">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-clinical-500 via-vital-500 to-transparent" />
          <div className="mb-5 flex items-center gap-2.5">
            <span className="icon-tile h-8 w-8 rounded-lg">
              <FileWarning size={15} strokeWidth={2.5} />
            </span>
            <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">New appeal</h2>
          </div>
          {absences.length === 0 ? (
            <p className="rounded-xl2 border border-dashed border-surface-line py-8 text-center text-sm text-ink-400">You have no un-appealed absences right now.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="section-label mb-1.5 block">Absence date</label>
                <Select
                  value={selectedAttendance}
                  onChange={setSelectedAttendance}
                >
                  <option value="">Select an absence…</option>
                  {absences.map((a) => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="section-label mb-1.5 block">Reason</label>
                <textarea
                  className="input-field min-h-[110px] resize-y leading-relaxed"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain the circumstances of your absence…"
                  required
                />
              </div>
              <div>
                <label className="section-label mb-1.5 flex items-center gap-1.5">
                  <Paperclip size={12} /> Supporting document (optional)
                </label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full cursor-pointer rounded-xl2 border border-dashed border-surface-line bg-surface-alt/40 p-2.5 text-sm text-ink-500 transition-colors duration-300 hover:border-clinical-400/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-clinical-500/12 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-clinical-700"
                />
              </div>

              {formError && (
                <div className="flex items-start gap-2 rounded-xl2 bg-status-expired/8 px-3.5 py-3 text-sm text-status-expired ring-1 ring-inset ring-status-expired/25">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{formError}</span>
                </div>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileWarning size={16} />}
                Submit appeal
              </button>
            </form>
          )}
        </div>

        <div className="surface-card p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="icon-tile-accent h-8 w-8 rounded-lg">
              <ScrollText size={15} strokeWidth={2.5} />
            </span>
            <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">Your appeals</h2>
            {appeals.length > 0 && <span className="chip ml-auto py-0.5 tabular-nums">{appeals.length}</span>}
          </div>
          <div className="space-y-3">
            {appeals.length === 0 && (
              <p className="rounded-xl2 border border-dashed border-surface-line py-8 text-center text-sm text-ink-400">No appeals submitted yet.</p>
            )}
            {appeals.map((a) => (
              <div
                key={a.id}
                className="relative overflow-hidden rounded-xl2 border border-surface-line bg-surface-alt/40 p-4 transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:border-transparent hover:bg-surface hover:shadow-lift"
              >
                <span
                  className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${
                    a.status === 'approved' ? 'bg-status-present' : a.status === 'rejected' ? 'bg-status-expired' : 'bg-status-late'
                  }`}
                />
                <div className="flex items-center justify-between gap-3">
                  <Badge tone={a.status === 'approved' ? 'present' : a.status === 'rejected' ? 'expired' : 'late'} dot>
                    {a.status}
                  </Badge>
                  <span className="text-xs tabular-nums text-ink-400">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-700">{a.reason}</p>
                {a.coordinator_comment && (
                  <p className="inset-panel mt-3 p-3 text-xs leading-relaxed text-ink-500">
                    <strong className="font-semibold text-ink-700">Coordinator:</strong> {a.coordinator_comment}
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
