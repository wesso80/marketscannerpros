/**
 * Journal trade/exit dates are calendar dates (Postgres DATE), not instants.
 * - Form defaults must be the user's LOCAL calendar date/time: `toISOString()` is UTC, so east of UTC (e.g. Sydney
 *   before 10:00) it pre-filled yesterday, and the close form showed a wall time 10h off.
 * - A DATE comes back from the API as 'YYYY-MM-DD' or its UTC-midnight ISO form; rendering that through the browser
 *   time zone shifts it to the previous day west of UTC. Format the calendar date itself.
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date, YYYY-MM-DD (value for <input type="date">). */
export function localDateInputValue(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Local wall time, YYYY-MM-DDTHH:mm (value for <input type="datetime-local">). */
export function localDateTimeInputValue(now: Date = new Date()): string {
  return `${localDateInputValue(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Display a journal DATE without a time-zone shift; real timestamps are shown in local time as before. */
export function formatTradeDate(value: string | null | undefined, locale?: string): string {
  if (!value) return '—';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value);
  if (dateOnly) {
    return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
      .toLocaleDateString(locale, { timeZone: 'UTC' });
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString(locale) : '—';
}
