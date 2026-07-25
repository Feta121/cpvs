import { useMemo, useState } from 'react';
import { ChevronRight, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import Badge from '../ui/Badge';
import type { AttendanceRecord, Hospital, Student, Profile, AttendanceStatus } from '../../types/database';

type Row = AttendanceRecord & { student: (Student & { profile: Profile | null }) | null; hospital: Hospital | null };

const statusOptions: AttendanceStatus[] = ['present', 'late', 'very_late', 'absent', 'excused'];

function badgeTone(status: AttendanceStatus) {
  return status === 'present' ? 'present' : status === 'late' ? 'late' : status === 'very_late' ? 'verylate' : status === 'absent' ? 'expired' : 'neutral';
}

/** Groups rows by "yyyy-MM" and returns [monthKey, label, rows][], newest first. */
function groupByMonth(rows: Row[]): [string, string, Row[]][] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.date.slice(0, 7); // "yyyy-MM"
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, monthRows]) => [key, format(new Date(key + '-01T00:00:00'), 'MMMM yyyy'), monthRows]);
}

/** Groups a month's rows by exact date and returns [date, rows][], newest first. */
function groupByDay(rows: Row[]): [string, Row[]][] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!groups.has(r.date)) groups.set(r.date, []);
    groups.get(r.date)!.push(r);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
}

export default function BatchAttendanceAccordion({
  batch,
  rows,
  colorScheme,
  onCorrectStatus,
}: {
  batch: string;
  rows: Row[];
  colorScheme: 'light' | 'dark';
  onCorrectStatus: (id: string, status: AttendanceStatus) => void;
}) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const months = useMemo(() => groupByMonth(rows), [rows]);

  function toggleMonth(key: string) {
    setExpandedDay(null); // switching months always collapses whichever day was open
    setExpandedMonth((current) => (current === key ? null : key));
  }

  function toggleDay(date: string) {
    setExpandedDay((current) => (current === date ? null : date));
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-sm font-semibold text-ink-700">
        Batch {batch} <span className="font-normal text-ink-300">({rows.length})</span>
      </h2>

      <div className="surface-card divide-y divide-surface-line overflow-hidden">
        {months.map(([monthKey, monthLabel, monthRows]) => {
          const monthOpen = expandedMonth === monthKey;
          const days = groupByDay(monthRows);

          return (
            <div key={monthKey}>
              <button
                onClick={() => toggleMonth(monthKey)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-surface-muted"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  <CalendarDays size={15} className="text-clinical-600" />
                  {monthLabel}
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-300">
                  {monthRows.length} record{monthRows.length === 1 ? '' : 's'}
                  <ChevronRight size={15} className={`transition-transform ${monthOpen ? 'rotate-90' : ''}`} />
                </span>
              </button>

              {monthOpen && (
                <div className="divide-y divide-surface-line border-t border-surface-line bg-surface-muted/40">
                  {days.map(([date, dayRows]) => {
                    const dayOpen = expandedDay === date;
                    return (
                      <div key={date}>
                        <button
                          onClick={() => toggleDay(date)}
                          className="flex w-full items-center justify-between py-2.5 pl-9 pr-5 text-left transition-colors hover:bg-surface-muted"
                        >
                          <span className="text-sm text-ink-700">{format(new Date(date + 'T00:00:00'), 'EEEE, MMM d')}</span>
                          <span className="flex items-center gap-2 text-xs text-ink-300">
                            {dayRows.length} student{dayRows.length === 1 ? '' : 's'}
                            <ChevronRight size={13} className={`transition-transform ${dayOpen ? 'rotate-90' : ''}`} />
                          </span>
                        </button>

                        {dayOpen && (
                          <div className="overflow-x-auto border-t border-surface-line bg-surface">
                            <table className="w-full text-left text-sm">
                              <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
                                <tr>
                                  <th className="px-5 py-2.5 font-medium">Student</th>
                                  <th className="px-5 py-2.5 font-medium">Hospital</th>
                                  <th className="px-5 py-2.5 font-medium">Check-in</th>
                                  <th className="px-5 py-2.5 font-medium">Status</th>
                                  <th className="px-5 py-2.5 font-medium">Correct</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-line">
                                {dayRows.map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-5 py-2.5 font-medium text-ink-900">{r.student?.profile?.full_name ?? '(profile missing)'}</td>
                                    <td className="px-5 py-2.5 text-ink-500">{r.hospital?.name ?? '—'}</td>
                                    <td className="px-5 py-2.5 text-ink-500">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                                    <td className="px-5 py-2.5">
                                      <Badge tone={badgeTone(r.status)}>{r.status?.replace('_', ' ') ?? 'unknown'}</Badge>
                                      {r.corrected_by && <span className="ml-2 text-[10px] text-ink-300">edited</span>}
                                    </td>
                                    <td className="px-5 py-2.5">
                                      <select
                                        value={r.status}
                                        onChange={(e) => onCorrectStatus(r.id, e.target.value as AttendanceStatus)}
                                        className="rounded-lg border border-surface-line bg-surface px-2 py-1 text-xs text-ink-900"
                                        style={{ colorScheme }}
                                      >
                                        {statusOptions.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                      </select>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
