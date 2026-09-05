/**
 * "What day is it in Addis Ababa?" — one answer, used everywhere.
 *
 * WHY THIS EXISTS
 *
 * Several pages computed today's date as `new Date().toISOString().slice(0, 10)`.
 * `toISOString()` always returns UTC, and Ethiopia is UTC+3, so between
 * midnight and 03:00 local time that expression returns YESTERDAY's date.
 * Anything keyed on it — "today's attendance", the check-in page's schedule
 * lookup, the coordinator dashboard's daily counts — silently showed the
 * wrong day during those three hours.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is the correct way to do
 * this in a browser: it uses the platform's own timezone database, so it
 * stays right without hardcoding a +3 offset, and it is unaffected by
 * whatever timezone the student's phone happens to be set to. That last part
 * matters here — a device set to the wrong timezone previously changed which
 * day a student's check-in was recorded against.
 *
 * The database has matching helpers (`addis_today()` / `addis_now()`,
 * migration 0015) and is the authority for anything that gets stored. These
 * are for display and for filtering queries.
 */

const ADDIS_TIME_ZONE = 'Africa/Addis_Ababa';

const WEEKDAY_INDEX = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Today's date in Addis Ababa as `YYYY-MM-DD` — the format Postgres `date`
 * columns compare against directly.
 */
export function addisToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADDIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Day of week in Addis Ababa, 0 = Sunday … 6 = Saturday — the same numbering
 * as `Date.getDay()`, as `extract(dow …)` in Postgres, and as the DAY_KEYS
 * arrays used to read `clinical_days_config`.
 */
export function addisDayIndex(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: ADDIS_TIME_ZONE,
    weekday: 'short',
  }).format(now);

  const index = WEEKDAY_INDEX.indexOf(weekday as (typeof WEEKDAY_INDEX)[number]);
  return index === -1 ? now.getDay() : index;
}
