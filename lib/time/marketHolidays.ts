/**
 * US Market Holiday Calendar
 *
 * NYSE/NASDAQ observe these holidays (market CLOSED all day):
 *  1. New Year's Day (Jan 1, observed)
 *  2. Martin Luther King Jr. Day (3rd Monday in Jan)
 *  3. Presidents' Day (3rd Monday in Feb)
 *  4. Good Friday (Friday before Easter)
 *  5. Memorial Day (Last Monday in May)
 *  6. Juneteenth National Independence Day (Jun 19, observed; since 2022)
 *  7. Independence Day (Jul 4, observed)
 *  8. Labor Day (1st Monday in Sep)
 *  9. Thanksgiving Day (4th Thursday in Nov)
 * 10. Christmas Day (Dec 25, observed)
 *
 * "Observed" rule: if a fixed-date holiday falls on Saturday → observed
 * the preceding Friday. If Sunday → observed the following Monday.
 *
 * All months are 0-indexed (JS convention): 0=Jan, 11=Dec.
 */

// ─── Easter computation (Anonymous Gregorian algorithm) ─────────────────────

function computeEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month: month - 1, day }; // 0-indexed month
}

// ─── Date helpers ───────────────────────────────────────────────────────────

/** Format "YYYY-MM-DD" for set lookup */
function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Shift a fixed-date holiday to its observed date (Sat→Fri, Sun→Mon) */
function observedKey(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day, 12));
  const dow = d.getUTCDay();
  if (dow === 6) {
    // Saturday → Friday
    const fri = new Date(d.getTime() - 86_400_000);
    return dateKey(fri.getUTCFullYear(), fri.getUTCMonth(), fri.getUTCDate());
  }
  if (dow === 0) {
    // Sunday → Monday
    const mon = new Date(d.getTime() + 86_400_000);
    return dateKey(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate());
  }
  return dateKey(year, month, day);
}

/** Find the nth occurrence of a weekday (0=Sun..6=Sat) in a given month */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const firstOfMonth = new Date(Date.UTC(year, month, 1, 12));
  let day = 1 + ((weekday - firstOfMonth.getUTCDay() + 7) % 7);
  day += (n - 1) * 7;
  return day;
}

/** Find the last occurrence of a weekday in a given month */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lastDay = new Date(Date.UTC(year, month, daysInMonth, 12));
  return daysInMonth - ((lastDay.getUTCDay() - weekday + 7) % 7);
}

// ─── Holiday set builder ────────────────────────────────────────────────────

function buildHolidaySet(year: number): Set<string> {
  const holidays = new Set<string>();

  // 1. New Year's Day (Jan 1, observed)
  holidays.add(observedKey(year, 0, 1));

  // 2. Martin Luther King Jr. Day (3rd Monday in Jan)
  holidays.add(dateKey(year, 0, nthWeekday(year, 0, 1, 3)));

  // 3. Presidents' Day (3rd Monday in Feb)
  holidays.add(dateKey(year, 1, nthWeekday(year, 1, 1, 3)));

  // 4. Good Friday (Friday before Easter Sunday)
  const easter = computeEasterSunday(year);
  const easterDate = new Date(Date.UTC(year, easter.month, easter.day, 12));
  const goodFriday = new Date(easterDate.getTime() - 2 * 86_400_000);
  holidays.add(dateKey(goodFriday.getUTCFullYear(), goodFriday.getUTCMonth(), goodFriday.getUTCDate()));

  // 5. Memorial Day (last Monday in May)
  holidays.add(dateKey(year, 4, lastWeekdayOfMonth(year, 4, 1)));

  // 6. Juneteenth (Jun 19, observed) — since 2022
  if (year >= 2022) {
    holidays.add(observedKey(year, 5, 19));
  }

  // 7. Independence Day (Jul 4, observed)
  holidays.add(observedKey(year, 6, 4));

  // 8. Labor Day (1st Monday in Sep)
  holidays.add(dateKey(year, 8, nthWeekday(year, 8, 1, 1)));

  // 9. Thanksgiving Day (4th Thursday in Nov)
  holidays.add(dateKey(year, 10, nthWeekday(year, 10, 4, 4)));

  // 10. Christmas Day (Dec 25, observed)
  holidays.add(observedKey(year, 11, 25));

  return holidays;
}

// ─── Cached lookup ──────────────────────────────────────────────────────────

const cache = new Map<number, Set<string>>();

function getHolidays(year: number): Set<string> {
  if (!cache.has(year)) cache.set(year, buildHolidaySet(year));
  return cache.get(year)!;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a given date is a US market holiday.
 * @param year  Full year (e.g. 2026)
 * @param month 0-indexed month (0=Jan, 11=Dec)
 * @param day   Day of month (1-31)
 */
export function isUSMarketHoliday(year: number, month: number, day: number): boolean {
  const key = dateKey(year, month, day);
  // Check current year's holidays
  if (getHolidays(year).has(key)) return true;
  // Edge case: Jan 1 of next year observed on Dec 31 of this year
  if (month === 11 && day >= 30) {
    if (getHolidays(year + 1).has(key)) return true;
  }
  return false;
}

/**
 * Check if a date is a non-trading day (weekend or holiday).
 * @param year  Full year
 * @param month 0-indexed month
 * @param day   Day of month
 */
export function isNonTradingDay(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month, day, 12));
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return isUSMarketHoliday(year, month, day);
}

/**
 * Find the last trading day of a given month (skips weekends + holidays).
 * @param year  Full year
 * @param month 0-indexed month
 * @returns Day of month (1-31)
 */
export function lastTradingDayOfMonth(year: number, month: number): number {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let day = daysInMonth;
  while (day > 0 && isNonTradingDay(year, month, day)) day--;
  return day;
}

/**
 * Get the full list of holiday date strings for a year (for debugging).
 * Each entry is "YYYY-MM-DD".
 */
export function getUSMarketHolidayList(year: number): string[] {
  return [...getHolidays(year)].sort();
}
