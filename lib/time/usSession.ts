/**
 * US equity session dates (America/New_York calendar, NYSE weekends + holidays via ./marketHolidays).
 *
 * Used to date daily scans by the market session their data belongs to, instead of the server's UTC calendar day
 * (or the viewer's). Pure: no I/O.
 */
import { isNonTradingDay, isUSEquityEarlyClose } from './marketHolidays';

const NY_TZ = 'America/New_York';
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const EARLY_CLOSE_MIN = 13 * 60;

const nyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NY_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** New York calendar date (YYYY-MM-DD) and minutes after midnight for an instant. */
export function nyDateTime(nowMs: number): { ymd: string; minutes: number } {
  const parts: Record<string, string> = {};
  for (const p of nyFormatter.formatToParts(new Date(nowMs))) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

function ymdParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y, m - 1, d];
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymdParts(ymd);
  return new Date(Date.UTC(y, m, d + days)).toISOString().slice(0, 10);
}

export function isUsTradingDay(ymd: string): boolean {
  const [y, m, d] = ymdParts(ymd);
  return !isNonTradingDay(y, m, d);
}

export function previousUsTradingDay(ymd: string): string {
  let d = addDays(ymd, -1);
  for (let i = 0; i < 15 && !isUsTradingDay(d); i++) d = addDays(d, -1);
  return d;
}

/** The first NYSE trading day strictly after `ymd`. */
export function nextUsTradingDay(ymd: string): string {
  let d = addDays(ymd, 1);
  for (let i = 0; i < 15 && !isUsTradingDay(d); i++) d = addDays(d, 1);
  return d;
}

/** UTC epoch ms of a New York wall-clock time (minutes after midnight) on `ymd`, DST-aware (EDT −4 h / EST −5 h). */
export function nyWallTimeMs(ymd: string, minutes: number): number {
  const [y, m, d] = ymdParts(ymd);
  for (const offsetHours of [4, 5]) {
    const candidate = Date.UTC(y, m, d, 0, minutes) + offsetHours * 3_600_000;
    const got = nyDateTime(candidate);
    if (got.ymd === ymd && got.minutes === minutes) return candidate;
  }
  return Date.UTC(y, m, d, 0, minutes) + 5 * 3_600_000;
}

/** 09:30 ET session open of `ymd` as UTC epoch ms. */
export function usSessionOpenMs(ymd: string): number {
  return nyWallTimeMs(ymd, OPEN_MIN);
}

/** Session close in NY minutes (13:00 on scheduled early-close days, else 16:00). */
export function usSessionCloseMinutes(ymd: string): number {
  const [y, m, d] = ymdParts(ymd);
  return isUSEquityEarlyClose(y, m, d) ? EARLY_CLOSE_MIN : CLOSE_MIN;
}

/**
 * The US session a scan run at `nowMs` belongs to: the most recent trading day whose 9:30 ET open has passed.
 * For a run after the close (the daily scan) this is the session that just completed; for a run during the session it
 * is the session in progress; before the open, over a weekend or on a holiday it is the previous trading day.
 */
export function latestUsSessionDate(nowMs: number): string {
  const { ymd, minutes } = nyDateTime(nowMs);
  if (isUsTradingDay(ymd) && minutes >= OPEN_MIN) return ymd;
  return previousUsTradingDay(ymd);
}

/** True during the US regular session (09:30 ET to the 16:00 / early close) on an NYSE trading day. */
export function isUsRegularSessionOpen(nowMs: number = Date.now()): boolean {
  const { ymd, minutes } = nyDateTime(nowMs);
  return isUsTradingDay(ymd) && minutes >= OPEN_MIN && minutes < usSessionCloseMinutes(ymd);
}

/** The most recent US session that has CLOSED by `nowMs` (16:00 ET, or 13:00 ET on early-close days). */
export function lastCompletedUsSessionDate(nowMs: number): string {
  const { ymd, minutes } = nyDateTime(nowMs);
  if (isUsTradingDay(ymd) && minutes >= usSessionCloseMinutes(ymd)) return ymd;
  return previousUsTradingDay(ymd);
}

/** Number of US trading sessions after `from` up to and including `to` (0 when to <= from). */
export function usSessionsBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let n = 0;
  for (let d = addDays(from, 1), i = 0; d <= to && i < 400; d = addDays(d, 1), i++) if (isUsTradingDay(d)) n++;
  return n;
}

/**
 * YYYY-MM-DD from a DATE value. node-postgres returns DATE as a JS Date at LOCAL midnight, so the local calendar
 * fields are the stored date (toISOString() would shift it a day on a server east of UTC). Strings keep their date part.
 */
export function toYmd(value: unknown): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ''));
  return m ? m[1] : null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 25 Sep 2026" for a YYYY-MM-DD session date (no time-zone shift, no locale variation). */
export function formatSessionDate(ymd: string): string {
  const [y, m, d] = ymdParts(ymd);
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
  return `${WEEKDAYS[dow]} ${d} ${MONTHS[m]} ${y}`;
}
