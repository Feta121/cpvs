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
        <h1 className="font-display text-2xl font-semibold text-ink-900">Attendance history</h1>
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
            <div key={s.label} className={`surface-card p-4 text-center`}>
              <p className={`font-display text-2xl font-semibold ${c.text}`}>{s.value}</p>
              <p className="mt-1 text-xs text-ink-500">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="surface-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setMonth((m) => subMonths(m, 1))} className="rounded-lg p-1.5 hover:bg-surface-muted">
            <ChevronLeft size={18} />
          </button>
          <h2 className="font-display text-sm font-semibold text-ink-900">{format(month, 'MMMM yyyy')}</h2>
          <button onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded-lg p-1.5 hover:bg-surface-muted">
            <ChevronRight size={18} />
          </button>
        </div>

        {loading ? (
          <FullScreenLoader label="Loading calendar…" />
        ) : (
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="pb-1 text-[11px] font-medium text-ink-300">{d}</div>
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
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs ${
                    c ? `${c.bg} ${c.text} font-semibold` : 'text-ink-300'
                  }`}
                  title={rec ? rec.status.replace('_', ' ') : undefined}
                >
                  {format(day, 'd')}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
