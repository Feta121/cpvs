import { useEffect, useMemo, useState } from 'react';
import { Plus, CalendarX2, CalendarPlus2, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { PracticeException, SpecialPracticeDay, Hospital, Student, Profile } from '../../types/database';

type StudentOption = Student & { profile: Profile | null };

const emptyExceptionForm = { hospital_id: '', batch: '', student_id: '', date: '', type: 'holiday' as PracticeException['type'], reason: '' };
const emptySpecialDayForm = { hospital_id: '', batch: '', student_id: '', date: '', reason: '' };

/**
 * Finds every student affected by a hospital/batch/student-scoped rule (an
 * exception or a special practice day) — used both to notify them and to
 * show an accurate "N student(s) affected" count. A student is affected if
 * they have an active rotation matching every non-null scope field.
 */
async function findAffectedStudents(scope: { hospital_id: string; batch: string; student_id: string }, date: string) {
  if (scope.student_id) return [scope.student_id];

  let query = supabase.from('rotations').select('student_id, student:students(batch)').eq('status', 'active').lte('start_date', date).gte('end_date', date);
  if (scope.hospital_id) query = query.eq('hospital_id', scope.hospital_id);
  const { data } = await query;
  const rows = (data as any[]) ?? [];
  const filtered = scope.batch ? rows.filter((r) => r.student?.batch === scope.batch) : rows;
  return Array.from(new Set(filtered.map((r) => r.student_id as string)));
}

export default function CoordinatorExceptions() {
  const { coordinator } = useAuth();
  const { showSuccess, showError } = useToast();

  const [exceptions, setExceptions] = useState<(PracticeException & { hospital: Hospital | null })[]>([]);
  const [specialDays, setSpecialDays] = useState<(SpecialPracticeDay & { hospital: Hospital | null })[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [showSpecialDayForm, setShowSpecialDayForm] = useState(false);
  const [submittingException, setSubmittingException] = useState(false);
  const [submittingSpecialDay, setSubmittingSpecialDay] = useState(false);
  const [exceptionForm, setExceptionForm] = useState(emptyExceptionForm);
  const [specialDayForm, setSpecialDayForm] = useState(emptySpecialDayForm);

  const [deletingExceptionId, setDeletingExceptionId] = useState<string | null>(null);
  const [deletingSpecialDayId, setDeletingSpecialDayId] = useState<string | null>(null);
  const [pendingDeleteException, setPendingDeleteException] = useState<PracticeException | null>(null);
  const [pendingDeleteSpecialDay, setPendingDeleteSpecialDay] = useState<SpecialPracticeDay | null>(null);

  const batches = useMemo(() => Array.from(new Set(students.map((s) => s.batch))).sort(), [students]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: exceptionData }, { data: specialDayData }, { data: hospitalData }, { data: studentData }] = await Promise.all([
      supabase.from('practice_exceptions').select('*, hospital:hospitals(*)').order('date', { ascending: false }),
      supabase.from('special_practice_days').select('*, hospital:hospitals(*)').order('date', { ascending: false }),
      supabase.from('hospitals').select('*'),
      supabase.from('students').select('*'),
    ]);
    setExceptions((exceptionData as any) ?? []);
    setSpecialDays((specialDayData as any) ?? []);
    setHospitals(hospitalData ?? []);

    const profileMap = await fetchProfilesById((studentData ?? []).map((s) => s.id));
    setStudents((studentData ?? []).map((s) => ({ ...s, profile: profileMap.get(s.id) ?? null })));

    setLoading(false);
  }

  async function notifyAffected(scope: { hospital_id: string; batch: string; student_id: string }, date: string, title: string, message: string, relatedId: string | null) {
    const studentIds = await findAffectedStudents(scope, date);
    if (studentIds.length === 0) return 0;
    await supabase.from('notifications').insert(
      studentIds.map((student_id) => ({ user_id: student_id, title, message, type: 'rotation_update' as const, related_id: relatedId }))
    );
    return studentIds.length;
  }

  async function handleExceptionSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingException(true);

    const { data: created, error } = await supabase
      .from('practice_exceptions')
      .insert({
        hospital_id: exceptionForm.hospital_id || null,
        batch: exceptionForm.batch || null,
        student_id: exceptionForm.student_id || null,
        date: exceptionForm.date,
        type: exceptionForm.type,
        reason: exceptionForm.reason || null,
        created_by: coordinator?.id,
      })
      .select()
      .single();

    if (error) {
      setSubmittingException(false);
      showError('Unable to save exception. ' + error.message);
      return;
    }

    const typeLabel = exceptionForm.type === 'holiday' ? 'Holiday' : exceptionForm.type === 'closure' ? 'Hospital closure' : 'Cancelled clinical day';
    const notified = await notifyAffected(
      exceptionForm,
      exceptionForm.date,
      `No practice on ${exceptionForm.date}`,
      `${typeLabel}${exceptionForm.reason ? `: ${exceptionForm.reason}` : ''}. This day will not count as an absence.`,
      created?.id ?? null
    );

    setSubmittingException(false);
    showSuccess(`Exception saved${notified > 0 ? ` — ${notified} student(s) notified` : ''}.`);
    setShowExceptionForm(false);
    setExceptionForm(emptyExceptionForm);
    load();
  }

  async function handleSpecialDaySubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingSpecialDay(true);

    const { data: created, error } = await supabase
      .from('special_practice_days')
      .insert({
        hospital_id: specialDayForm.hospital_id || null,
        batch: specialDayForm.batch || null,
        student_id: specialDayForm.student_id || null,
        date: specialDayForm.date,
        reason: specialDayForm.reason || null,
        created_by: coordinator?.id,
      })
      .select()
      .single();

    if (error) {
      setSubmittingSpecialDay(false);
      showError('Unable to save practice day. ' + error.message);
      return;
    }

    const notified = await notifyAffected(
      specialDayForm,
      specialDayForm.date,
      `Extra clinical practice on ${specialDayForm.date}`,
      `A clinical practice day has been added outside the usual schedule${specialDayForm.reason ? `: ${specialDayForm.reason}` : ''}. Check in as usual.`,
      created?.id ?? null
    );

    setSubmittingSpecialDay(false);
    showSuccess(`Practice day added${notified > 0 ? ` — ${notified} student(s) notified` : ''}.`);
    setShowSpecialDayForm(false);
    setSpecialDayForm(emptySpecialDayForm);
    load();
  }

  async function confirmDeleteException() {
    const it = pendingDeleteException;
    if (!it) return;
    setPendingDeleteException(null);
    setDeletingExceptionId(it.id);
    const { error } = await supabase.from('practice_exceptions').delete().eq('id', it.id);
    setDeletingExceptionId(null);
    if (error) {
      showError('Unable to delete exception. ' + error.message);
      return;
    }
    showSuccess('Exception deleted.');
    load();
  }

  async function confirmDeleteSpecialDay() {
    const it = pendingDeleteSpecialDay;
    if (!it) return;
    setPendingDeleteSpecialDay(null);
    setDeletingSpecialDayId(it.id);
    const { error } = await supabase.from('special_practice_days').delete().eq('id', it.id);
    setDeletingSpecialDayId(null);
    if (error) {
      showError('Unable to delete practice day. ' + error.message);
      return;
    }
    showSuccess('Practice day deleted.');
    load();
  }

  if (loading) return <FullScreenLoader label="Loading exceptions…" />;

  return (
    <div className="space-y-10">
      {/* ---------------- Exceptions (holidays / closures / cancellations) ---------------- */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-900">Practice exceptions</h1>
            <p className="mt-1 text-sm text-ink-500">Holidays, hospital closures, and cancelled clinical days don't count as absences.</p>
          </div>
          <button onClick={() => setShowExceptionForm((s) => !s)} className="btn-primary">
            <Plus size={16} /> Add exception
          </button>
        </div>

        {showExceptionForm && (
          <form onSubmit={handleExceptionSubmit} className="surface-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Hospital (optional — leave blank for all)</label>
              <select className="input-field" value={exceptionForm.hospital_id} onChange={(e) => setExceptionForm({ ...exceptionForm, hospital_id: e.target.value })}>
                <option value="">All hospitals</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Date</label>
              <input required type="date" className="input-field" value={exceptionForm.date} onChange={(e) => setExceptionForm({ ...exceptionForm, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Batch (optional — leave blank for all)</label>
              <select className="input-field" value={exceptionForm.batch} onChange={(e) => setExceptionForm({ ...exceptionForm, batch: e.target.value, student_id: '' })}>
                <option value="">All batches</option>
                {batches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Student (optional — leave blank for all)</label>
              <select className="input-field" value={exceptionForm.student_id} onChange={(e) => setExceptionForm({ ...exceptionForm, student_id: e.target.value })}>
                <option value="">All students{exceptionForm.batch ? ` in batch ${exceptionForm.batch}` : ''}</option>
                {students
                  .filter((s) => !exceptionForm.batch || s.batch === exceptionForm.batch)
                  .map((s) => <option key={s.id} value={s.id}>{s.profile?.full_name ?? '(profile missing)'}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Type</label>
              <select className="input-field" value={exceptionForm.type} onChange={(e) => setExceptionForm({ ...exceptionForm, type: e.target.value as any })}>
                <option value="holiday">Holiday</option>
                <option value="closure">Hospital closure</option>
                <option value="cancelled">Cancelled clinical day</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Reason (optional)</label>
              <input className="input-field" value={exceptionForm.reason} onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })} />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" disabled={submittingException} className="btn-primary">
                {submittingException ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Save exception
              </button>
              <button type="button" onClick={() => setShowExceptionForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        <div className="surface-card divide-y divide-surface-line">
          {exceptions.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-500">
              <CalendarX2 className="mx-auto mb-2 text-ink-300" size={24} /> No exceptions recorded.
            </div>
          )}
          {exceptions.map((it) => (
            <div key={it.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-ink-900">{it.date} — {it.hospital?.name ?? 'All hospitals'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="clinical">{it.type}</Badge>
                  {it.batch && <Badge tone="vital">Batch {it.batch}</Badge>}
                  {it.student_id && <Badge tone="neutral">{students.find((s) => s.id === it.student_id)?.profile?.full_name ?? 'Specific student'}</Badge>}
                </div>
                {it.reason && <p className="mt-1 text-xs text-ink-500">{it.reason}</p>}
              </div>
              <button
                onClick={() => setPendingDeleteException(it)}
                disabled={deletingExceptionId === it.id}
                title="Delete exception"
                className="shrink-0 rounded-lg border border-status-expired/30 p-1.5 text-status-expired hover:bg-status-expired/5"
              >
                {deletingExceptionId === it.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- Special practice days (extra days, outside Mon/Tue/Wed) ---------------- */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink-900">Extra clinical practice days</h2>
            <p className="mt-1 text-sm text-ink-500">
              Adds practice on a day that wouldn't otherwise count (practice normally runs Monday, Tuesday, and Wednesday only) — for example, a makeup day.
            </p>
          </div>
          <button onClick={() => setShowSpecialDayForm((s) => !s)} className="btn-primary">
            <Plus size={16} /> Add practice day
          </button>
        </div>

        {showSpecialDayForm && (
          <form onSubmit={handleSpecialDaySubmit} className="surface-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Hospital (optional — leave blank for all)</label>
              <select className="input-field" value={specialDayForm.hospital_id} onChange={(e) => setSpecialDayForm({ ...specialDayForm, hospital_id: e.target.value })}>
                <option value="">All hospitals</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Date</label>
              <input required type="date" className="input-field" value={specialDayForm.date} onChange={(e) => setSpecialDayForm({ ...specialDayForm, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Batch (optional — leave blank for all)</label>
              <select className="input-field" value={specialDayForm.batch} onChange={(e) => setSpecialDayForm({ ...specialDayForm, batch: e.target.value, student_id: '' })}>
                <option value="">All batches</option>
                {batches.map((b) => <option key={b} value={b}>Batch {b}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Student (optional — leave blank for all)</label>
              <select className="input-field" value={specialDayForm.student_id} onChange={(e) => setSpecialDayForm({ ...specialDayForm, student_id: e.target.value })}>
                <option value="">All students{specialDayForm.batch ? ` in batch ${specialDayForm.batch}` : ''}</option>
                {students
                  .filter((s) => !specialDayForm.batch || s.batch === specialDayForm.batch)
                  .map((s) => <option key={s.id} value={s.id}>{s.profile?.full_name ?? '(profile missing)'}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Reason (optional)</label>
              <input className="input-field" placeholder="e.g. Makeup day for cancelled session" value={specialDayForm.reason} onChange={(e) => setSpecialDayForm({ ...specialDayForm, reason: e.target.value })} />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" disabled={submittingSpecialDay} className="btn-primary">
                {submittingSpecialDay ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus2 size={16} />} Save practice day
              </button>
              <button type="button" onClick={() => setShowSpecialDayForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        <div className="surface-card divide-y divide-surface-line">
          {specialDays.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-500">
              <CalendarPlus2 className="mx-auto mb-2 text-ink-300" size={24} /> No extra practice days added.
            </div>
          )}
          {specialDays.map((it) => (
            <div key={it.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-ink-900">{it.date} — {it.hospital?.name ?? 'All hospitals'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="vital">Extra practice</Badge>
                  {it.batch && <Badge tone="clinical">Batch {it.batch}</Badge>}
                  {it.student_id && <Badge tone="neutral">{students.find((s) => s.id === it.student_id)?.profile?.full_name ?? 'Specific student'}</Badge>}
                </div>
                {it.reason && <p className="mt-1 text-xs text-ink-500">{it.reason}</p>}
              </div>
              <button
                onClick={() => setPendingDeleteSpecialDay(it)}
                disabled={deletingSpecialDayId === it.id}
                title="Delete practice day"
                className="shrink-0 rounded-lg border border-status-expired/30 p-1.5 text-status-expired hover:bg-status-expired/5"
              >
                {deletingSpecialDayId === it.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteException}
        title="Delete this exception?"
        message="Any student who would have been exempt from absence-marking on this day no longer will be — check for missed check-ins may then mark them absent."
        onConfirm={confirmDeleteException}
        onCancel={() => setPendingDeleteException(null)}
      />
      <ConfirmDialog
        open={!!pendingDeleteSpecialDay}
        title="Delete this practice day?"
        message="This day will no longer count as an expected clinical day for the students it applied to."
        onConfirm={confirmDeleteSpecialDay}
        onCancel={() => setPendingDeleteSpecialDay(null)}
      />
    </div>
  );
}
