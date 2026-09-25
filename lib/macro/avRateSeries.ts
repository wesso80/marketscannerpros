/**
 * Helpers for Alpha Vantage FRED-backed rate series (TREASURY_YIELD, FEDERAL_FUNDS_RATE).
 *
 * Both endpoints default to `interval=monthly`, whose newest row is LAST month's average
 * (e.g. on 25 Sep 2026 the 10Y "latest" was the August average 4.68% while the daily
 * close was ~5.1%). Callers request `interval=daily` for the headline value and use
 * these helpers to:
 *  - skip non-numeric rows (FRED publishes "." for holidays/no-trade days),
 *  - take the most recent numeric observation (value + observation date),
 *  - rebuild a monthly-average history from the same daily payload, so sparklines
 *    and month-over-month trend logic keep their 12-month shape without extra API calls.
 */

export interface RatePoint {
  date: string;
  value: number;
}

export type AvRateInterval = 'daily' | 'weekly' | 'monthly';

export function isAvRateInterval(v: unknown): v is AvRateInterval {
  return v === 'daily' || v === 'weekly' || v === 'monthly';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Numeric observations from an AV `{ data: [{ date, value }] }` payload, newest first. */
export function numericObservations(payload: unknown): RatePoint[] {
  const rows = (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];
  const out: RatePoint[] = [];
  for (const row of rows) {
    const date = typeof row?.date === 'string' ? row.date : '';
    const raw = row?.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (raw == null || (typeof raw === 'string' && !/^\s*-?\d+(\.\d+)?\s*$/.test(raw))) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Most recent numeric observation, or null. */
export function latestObservation(payload: unknown): RatePoint | null {
  return numericObservations(payload)[0] ?? null;
}

/**
 * Monthly averages (newest first, dated YYYY-MM-01 like AV's monthly series) of COMPLETED
 * calendar months only — the month containing `nowMs` (UTC) is excluded, matching the
 * monthly endpoint, which publishes a month only once it has ended.
 */
export function monthlyAverages(points: RatePoint[], count = 12, nowMs = Date.now()): RatePoint[] {
  const currentMonth = new Date(nowMs).toISOString().slice(0, 7);
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const month = p.date.slice(0, 7);
    if (month >= currentMonth) continue;
    const b = buckets.get(month) ?? { sum: 0, n: 0 };
    b.sum += p.value;
    b.n += 1;
    buckets.set(month, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, count)
    .map(([month, b]) => ({ date: `${month}-01`, value: round2(b.sum / b.n) }));
}
