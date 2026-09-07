import type { AttendanceRecord } from '../types/database';

/**
 * Average time between check-in and check-out, in minutes, across whichever
 * attendance rows are passed in. Only rows with BOTH `check_in_time` and
 * `check_out_time` set count — a day where a student checked in but never
 * checked out (forgot, or the day just isn't over yet) has no checkout to
 * measure, and an absent/excused day has neither. Counting either of those
 * as a 0-minute visit would drag the average down for reasons that have
 * nothing to do with how long students actually stay once they're there.
 *
 * Returns null (not 0) when there's nothing to average, so callers can tell
 * "no data yet" apart from "a real average of zero."
 */
export function averageDurationMinutes(records: Pick<AttendanceRecord, 'check_in_time' | 'check_out_time'>[]): number | null {
  const durations = records
    .filter((r) => r.check_in_time && r.check_out_time)
    .map((r) => (new Date(r.check_out_time!).getTime() - new Date(r.check_in_time!).getTime()) / 60000)
    // A negative or zero duration means bad data (clock skew, a corrected
    // record, manual edit) rather than a real visit — excluded rather than
    // let it pull the average toward (or past) zero.
    .filter((mins) => mins > 0);

  if (durations.length === 0) return null;
  return durations.reduce((sum, m) => sum + m, 0) / durations.length;
}

/** Formats minutes as "5h 20m" (or just "45m" under an hour). Rounds to the
 * nearest minute — this is a summary stat, not a timesheet. */
export function formatDurationMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
