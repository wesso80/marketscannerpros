/**
 * Freshness for Alpha Vantage commodity series that are only published MONTHLY (ALUMINUM, COTTON, COFFEE, and COPPER /
 * WHEAT / CORN / SUGAR when their ETF proxy is unavailable — https://www.alphavantage.co/documentation/#commodities).
 *
 * A monthly observation is dated the first of its month and is published with a lag of a few weeks, so on 26 Sep the
 * newest value is typically July's or August's. Judging it by day age (it used to be "> 45 days → STALE") dropped
 * current monthly values and marked the whole lens degraded. Rule: current while it is at most 2 months behind the
 * current month (UTC); older than that is STALE.
 */
export const MONTHLY_MAX_MONTHS_BEHIND = 2;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function yearMonth(date: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '');
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

/** Whole months between the observation's month and the current month (UTC); null for an unreadable date. */
export function monthsBehind(date: string, nowMs: number = Date.now()): number | null {
  const obs = yearMonth(date);
  if (!obs) return null;
  const now = new Date(nowMs);
  return (now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) - (obs.y * 12 + obs.m);
}

export function isMonthlyObservationCurrent(date: string, nowMs: number = Date.now()): boolean {
  const behind = monthsBehind(date, nowMs);
  return behind != null && behind >= 0 && behind <= MONTHLY_MAX_MONTHS_BEHIND;
}

/** "monthly, as of Aug 2026" — null for an unreadable date. */
export function monthlyAsOfLabel(date: string): string | null {
  const obs = yearMonth(date);
  return obs ? `monthly, as of ${MONTHS[obs.m - 1]} ${obs.y}` : null;
}
