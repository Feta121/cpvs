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

function StatusSelect({ row, colorScheme, onCorrectStatus }: { row: Row; colorScheme: 'light' | 'dark'; onCorrectStatus: (id: string, status: AttendanceStatus) => void }) {
  return (
    <select
      value={row.status}
      onChange={(e) => onCorrectStatus(row.id, e.target.value as AttendanceStatus)}
      className="rounded-lg border border-surface-line bg-surface px-2 py-1 text-xs text-ink-900"
      style={{ colorScheme }}
    >
      {statusOptions.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
    </select>
  );
}

export default function BatchAttendanceAccordion({
  batch,
  rows,
  colorScheme,
  onCorrectStatus,
  isSingleStudent = false,
}: {
  batch: string;
  rows: Row[];
  colorScheme: 'light' | 'dark';
  onCorrectStatus: (id: string, status: AttendanceStatus) => void;
  /** When true (a specific student is filtered), clicking a month shows a
   * flat table of that whole month's records with Date + Day columns,
   * instead of drilling into individual days — day-by-day navigation isn't
   * useful when there's only ever one student per day anyway. */
  isSingleStudent?: boolean;
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

          return (
            <div key={monthKey}>
              {/* Level 1: month */}
              <button
                onClick={() => toggleMonth(monthKey)}
                className={`flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors ${
                  monthOpen ? 'bg-clinical-50' : 'hover:bg-surface-muted'
                }`}
              >
                <span className={`flex items-center gap-2 text-sm font-medium ${monthOpen ? 'text-clinical-700' : 'text-ink-900'}`}>
                  <CalendarDays size={15} className={monthOpen ? 'text-clinical-600' : 'text-ink-300'} />
                  {monthLabel}
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-300">
                  {monthRows.length} record{monthRows.length === 1 ? '' : 's'}
                  <ChevronRight size={15} className={`transition-transform ${monthOpen ? 'rotate-90 text-clinical-600' : ''}`} />
                </span>
              </button>

              {monthOpen && isSingleStudent && (
                // Single-student view: skip the day level entirely and show
                // the whole month at once, with explicit Date + Day columns.
                <div className="overflow-x-auto border-l-2 border-clinical-200 border-t border-surface-line bg-surface-muted/40 pl-4">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Day</th>
                        <th className="px-4 py-2.5 font-medium">Hospital</th>
                        <th className="px-4 py-2.5 font-medium">Check-in</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 font-medium">Correct</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-line bg-surface">
                      {[...monthRows].sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2.5 text-ink-500">{format(new Date(r.date + 'T00:00:00'), 'MMM d, yyyy')}</td>
                          <td className="px-4 py-2.5 text-ink-500">{format(new Date(r.date + 'T00:00:00'), 'EEEE')}</td>
                          <td className="px-4 py-2.5 text-ink-500">{r.hospital?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-ink-500">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={badgeTone(r.status)}>{r.status?.replace('_', ' ') ?? 'unknown'}</Badge>
                            {r.corrected_by && <span className="ml-2 text-[10px] text-ink-300">edited</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusSelect row={r} colorScheme={colorScheme} onCorrectStatus={onCorrectStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {monthOpen && !isSingleStudent && (
                // All-students view: drill down one more level, into days.
                <div className="divide-y divide-surface-line border-l-2 border-clinical-200 border-t border-surface-line bg-surface-muted/40">
                  {groupByDay(monthRows).map(([date, dayRows]) => {
                    const dayOpen = expandedDay === date;
                    return (
                      <div key={date}>
                        {/* Level 2: day */}
                        <button
                          onClick={() => toggleDay(date)}
                          className={`flex w-full items-center justify-between py-2.5 pl-8 pr-5 text-left transition-colors ${
                            dayOpen ? 'bg-vital-50' : 'hover:bg-surface-muted'
                          }`}
                        >
                          <span className={`text-sm ${dayOpen ? 'font-medium text-vital-700' : 'text-ink-700'}`}>
                            {format(new Date(date + 'T00:00:00'), 'EEEE, MMM d')}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-ink-300">
                            {dayRows.length} student{dayRows.length === 1 ? '' : 's'}
                            <ChevronRight size={13} className={`transition-transform ${dayOpen ? 'rotate-90 text-vital-600' : ''}`} />
                          </span>
                        </button>

                        {dayOpen && (
                          // Level 3: students for that day
                          <div className="overflow-x-auto border-l-2 border-vital-200 border-t border-surface-line bg-surface pl-4">
                            <table className="w-full text-left text-sm">
                              <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
                                <tr>
                                  <th className="px-4 py-2.5 font-medium">Student</th>
                                  <th className="px-4 py-2.5 font-medium">Hospital</th>
                                  <th className="px-4 py-2.5 font-medium">Check-in</th>
                                  <th className="px-4 py-2.5 font-medium">Status</th>
                                  <th className="px-4 py-2.5 font-medium">Correct</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-line">
                                {dayRows.map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-4 py-2.5 font-medium text-ink-900">{r.student?.profile?.full_name ?? '(profile missing)'}</td>
                                    <td className="px-4 py-2.5 text-ink-500">{r.hospital?.name ?? '—'}</td>
                                    <td className="px-4 py-2.5 text-ink-500">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                                    <td className="px-4 py-2.5">
                                      <Badge tone={badgeTone(r.status)}>{r.status?.replace('_', ' ') ?? 'unknown'}</Badge>
                                      {r.corrected_by && <span className="ml-2 text-[10px] text-ink-300">edited</span>}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <StatusSelect row={r} colorScheme={colorScheme} onCorrectStatus={onCorrectStatus} />
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
