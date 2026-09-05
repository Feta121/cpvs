import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { statusColors } from '../../utils/geofence';
import type { AttendanceRecord } from '../../types/database';
import FullScreenLoader from '../../components/ui/FullScreenLoader';

export default function AttendanceHistory() {
  const { student } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!student) return;
    (async () => {
      setLoading(true);
      const start = startOfMonth(month).toISOString().slice(0, 10);
      const end = endOfMonth(month).toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', student.id)
        .gte('date', start)
        .lte('date', end);
      setRecords(data ?? []);
      setLoading(false);
    })();
  }, [student, month]);

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }),
    [month]
  );
  const leadingBlanks = getDay(startOfMonth(month));

  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const veryLate = records.filter((r) => r.status === 'very_late').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const excused = records.filter((r) => r.status === 'excused').length;
    return { total, present, late, veryLate, absent, excused };
  }, [records]);

  function recordFor(day: Date) {
    return records.find((r) => isSameDay(new Date(r.date), day));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">Attendance history</h1>
        <p className="mt-1 text-sm text-ink-500">Review your clinical attendance by month.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Present', value: stats.present, tone: 'present' as const },
          { label: 'Late', value: stats.late, tone: 'late' as const },
          { label: 'Very Late', value: stats.veryLate, tone: 'very_late' as const },
          { label: 'Absent', value: stats.absent, tone: 'absent' as const },
          { label: 'Excused', value: stats.excused, tone: 'excused' as const },
        ].map((s) => {
          const c = statusColors(s.tone);
          return (
            <div
              key={s.label}
              className={`surface-card relative overflow-hidden p-4 text-center transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:shadow-lift`}
            >
              <span className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] ${c.dot}`} />
              <p className={`stat-value text-3xl ${c.text}`}>{s.value}</p>
              <p className="section-label mt-1.5">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="surface-card p-5">
        <div className="mb-5 flex items-center justify-between">
          <button onClick={() => setMonth((m) => subMonths(m, 1))} className="btn-icon h-9 w-9" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">{format(month, 'MMMM yyyy')}</h2>
          <button onClick={() => setMonth((m) => addMonths(m, 1))} className="btn-icon h-9 w-9" aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        {loading ? (
          <FullScreenLoader label="Loading calendar…" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="pb-2 text-2xs font-semibold uppercase tracking-widest text-ink-400">{d}</div>
              ))}
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {days.map((day) => {
                const rec = recordFor(day);
                const c = rec ? statusColors(rec.status) : null;
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-xs tabular-nums transition-all duration-200 ${
                      c
                        ? `${c.bg} ${c.text} ${c.border} font-bold hover:scale-105 hover:shadow-card`
                        : 'border-surface-line/60 text-ink-400'
                    }`}
                    title={rec ? rec.status.replace('_', ' ') : undefined}
                  >
                    {format(day, 'd')}
                  </div>
                );
              })}
            </div>

            {/* Legend — reuses statusColors so it can never drift from the grid. */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-surface-line pt-4">
              {[
                { label: 'Present', tone: 'present' as const },
                { label: 'Late', tone: 'late' as const },
                { label: 'Very Late', tone: 'very_late' as const },
                { label: 'Absent', tone: 'absent' as const },
                { label: 'Excused', tone: 'excused' as const },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-ink-500">
                  <span className={`h-2 w-2 rounded-full ${statusColors(l.tone).dot}`} />
                  {l.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
