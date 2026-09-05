import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import Badge from '../ui/Badge';
import Select from '../ui/Select';
import type { AttendanceRecord, Hospital, Student, Profile, AttendanceStatus } from '../../types/database';

type Row = AttendanceRecord & { student: (Student & { profile: Profile | null }) | null; hospital: Hospital | null };

const statusOptions: AttendanceStatus[] = ['present', 'late', 'very_late', 'absent', 'excused'];

function badgeTone(status: AttendanceStatus) {
  return status === 'present' ? 'present' : status === 'late' ? 'late' : status === 'very_late' ? 'verylate' : status === 'absent' ? 'expired' : 'neutral';
}

/** Shared expand/collapse timing for all three accordion levels below, so
 * month/day/table sections all animate at the same speed and feel. */
const expandTransition = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

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

function StatusSelect({ row, onCorrectStatus, disabled }: { row: Row; colorScheme: 'light' | 'dark'; onCorrectStatus: (id: string, status: AttendanceStatus) => void; disabled?: boolean }) {
  return (
    <Select value={row.status} onChange={(v) => onCorrectStatus(row.id, v as AttendanceStatus)} disabled={disabled} compact>
      {statusOptions.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
    </Select>
  );
}

export default function BatchAttendanceAccordion({
  batch,
  rows,
  colorScheme,
  onCorrectStatus,
  isSingleStudent = false,
  canEdit = true,
}: {
  batch: string;
  rows: Row[];
  colorScheme: 'light' | 'dark';
  onCorrectStatus: (id: string, status: AttendanceStatus) => void;
  /** Added in migration 0012 (coordinator permissions). Gates the status
   * correction dropdown only — everything else on this accordion (viewing
   * records, expanding months/days) stays available regardless, since
   * this system gates writes, not read access. Defaults true so existing
   * callers that don't pass it keep working exactly as before. */
  canEdit?: boolean;
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
      <h2 className="section-label flex items-center gap-2.5">
        Batch {batch}
        <span className="chip py-0 text-[11px] tabular-nums">{rows.length}</span>
        <span className="hairline flex-1" />
      </h2>

      <div className="surface-card divide-y divide-surface-line overflow-hidden">
        {months.map(([monthKey, monthLabel, monthRows]) => {
          const monthOpen = expandedMonth === monthKey;

          return (
            <div key={monthKey}>
              {/* Level 1: month */}
              <button
                onClick={() => toggleMonth(monthKey)}
                className={`relative flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors duration-300 ${
                  monthOpen
                    ? 'bg-gradient-to-r from-clinical-500/12 via-clinical-500/6 to-transparent'
                    : 'hover:bg-surface-muted'
                }`}
              >
                {monthOpen && (
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-clinical-500 to-vital-500" />
                )}
                <span className={`flex items-center gap-2.5 text-sm font-semibold ${monthOpen ? 'text-clinical-700' : 'text-ink-900'}`}>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ${
                      monthOpen
                        ? 'bg-clinical-500/15 text-clinical-600 ring-1 ring-inset ring-clinical-500/25'
                        : 'bg-surface-alt text-ink-400 ring-1 ring-inset ring-surface-line'
                    }`}
                  >
                    <CalendarDays size={14} strokeWidth={2.25} />
                  </span>
                  {monthLabel}
                </span>
                <span className="flex items-center gap-2 text-xs tabular-nums text-ink-400">
                  {monthRows.length} record{monthRows.length === 1 ? '' : 's'}
                  <ChevronRight size={15} className={`transition-transform duration-300 ease-spring ${monthOpen ? 'rotate-90 text-clinical-600' : ''}`} />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {monthOpen && isSingleStudent && (
                  // Single-student view: skip the day level entirely and show
                  // the whole month at once, with explicit Date + Day columns.
                  <motion.div
                    key="single-student-table"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={expandTransition}
                    className="overflow-hidden"
                  >
                  <div className="overflow-x-auto border-l-[3px] border-clinical-400/60 border-t border-surface-line bg-surface-muted/40 pl-5">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                      <thead className="border-b border-surface-line text-2xs font-semibold uppercase tracking-widest text-ink-400">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Day</th>
                          <th className="px-4 py-3">Hospital</th>
                          <th className="px-4 py-3">Check-in</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Correct</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-line bg-surface">
                        {[...monthRows].sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
                          <tr key={r.id} className="transition-colors duration-200 hover:bg-clinical-500/[0.04]">
                            <td className="px-4 py-2.5 font-medium tabular-nums text-ink-700">{format(new Date(r.date + 'T00:00:00'), 'MMM d, yyyy')}</td>
                            <td className="px-4 py-2.5 text-ink-500">{format(new Date(r.date + 'T00:00:00'), 'EEEE')}</td>
                            <td className="px-4 py-2.5 text-ink-500">{r.hospital?.name ?? '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums text-ink-500">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                            <td className="px-4 py-2.5">
                              <Badge tone={badgeTone(r.status)}>{r.status?.replace('_', ' ') ?? 'unknown'}</Badge>
                              {r.corrected_by && <span className="ml-2 text-2xs font-medium uppercase tracking-wider text-ink-400">edited</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusSelect row={r} colorScheme={colorScheme} onCorrectStatus={onCorrectStatus} disabled={!canEdit} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {monthOpen && !isSingleStudent && (
                  // All-students view: drill down one more level, into days.
                  <motion.div
                    key="days-list"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={expandTransition}
                    className="overflow-hidden"
                  >
                  <div className="divide-y divide-surface-line border-l-[3px] border-clinical-400/60 border-t border-surface-line bg-surface-muted/40">
                    {groupByDay(monthRows).map(([date, dayRows]) => {
                      const dayOpen = expandedDay === date;
                      return (
                        <div key={date}>
                          {/* Level 2: day */}
                          <button
                            onClick={() => toggleDay(date)}
                            className={`flex w-full items-center justify-between py-2.5 pl-8 pr-5 text-left transition-colors duration-300 ${
                              dayOpen
                                ? 'bg-gradient-to-r from-vital-500/12 via-vital-500/6 to-transparent'
                                : 'hover:bg-surface-muted'
                            }`}
                          >
                            <span className={`text-sm ${dayOpen ? 'font-semibold text-vital-700' : 'text-ink-700'}`}>
                              {format(new Date(date + 'T00:00:00'), 'EEEE, MMM d')}
                            </span>
                            <span className="flex items-center gap-2 text-xs tabular-nums text-ink-400">
                              {dayRows.length} student{dayRows.length === 1 ? '' : 's'}
                              <ChevronRight size={13} className={`transition-transform duration-300 ease-spring ${dayOpen ? 'rotate-90 text-vital-600' : ''}`} />
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {dayOpen && (
                              // Level 3: students for that day. ml-8 shifts
                              // this block (and its left accent rail) right
                              // to align under the day row's own text above.
                              <motion.div
                                key={`${date}-table`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={expandTransition}
                                className="overflow-hidden"
                              >
                              <div className="overflow-x-auto ml-8 border-l-[3px] border-vital-400/60 border-t border-surface-line bg-surface pl-4">
                                <table className="w-full whitespace-nowrap text-left text-sm">
                                  <thead className="border-b border-surface-line text-2xs font-semibold uppercase tracking-widest text-ink-400">
                                    <tr>
                                      <th className="px-4 py-3">Student</th>
                                      <th className="px-4 py-3">Hospital</th>
                                      <th className="px-4 py-3">Check-in</th>
                                      <th className="px-4 py-3">Status</th>
                                      <th className="px-4 py-3">Correct</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-surface-line">
                                    {dayRows.map((r) => (
                                      <tr key={r.id} className="transition-colors duration-200 hover:bg-vital-500/[0.05]">
                                        <td className="px-4 py-2.5 font-semibold text-ink-900">{r.student?.profile?.full_name ?? '(profile missing)'}</td>
                                        <td className="px-4 py-2.5 text-ink-500">{r.hospital?.name ?? '—'}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-ink-500">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                                        <td className="px-4 py-2.5">
                                          <Badge tone={badgeTone(r.status)}>{r.status?.replace('_', ' ') ?? 'unknown'}</Badge>
                                          {r.corrected_by && <span className="ml-2 text-2xs font-medium uppercase tracking-wider text-ink-400">edited</span>}
                                        </td>
                                        <td className="px-4 py-2.5">
                                          <StatusSelect row={r} colorScheme={colorScheme} onCorrectStatus={onCorrectStatus} disabled={!canEdit} />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
