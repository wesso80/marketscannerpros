/**
 * Spot FX trading calendar for data freshness.
 *
 * The FX market trades 24 hours a day from Sunday 17:00 to Friday 17:00 New York time (DST-aware) and is shut in
 * between. Holiday closures (e.g. 25 Dec / 1 Jan thin sessions) are not modelled.
 *
 * Alpha Vantage FX_DAILY (the only daily FX source in the app) dates bars by UTC calendar day ("6. Time Zone": "UTC"),
 * Monday to Friday only (no weekend bars), and a day's bar is published after that UTC day ends (checked 26 Sep 2026: at
 * 21:30 UTC Friday the newest bar was Thursday's; by 04:00 UTC Saturday Friday's bar was there). So bar D is complete at
 * 00:00 UTC on D+1, and Friday's bar stays the latest completed bar until Monday's completes (00:00 UTC Tuesday).
 */

const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** True while the FX market is shut: Friday 17:00 to Sunday 17:00 New York time. */
export function isForexClosed(ms: number): boolean {
  const parts = NY.formatToParts(new Date(ms));
  const dow = DOW[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? 0;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return dow === 6 || (dow === 5 && hour >= 17) || (dow === 0 && hour < 17);
}

const STEP_MS = 15 * 60_000;

/**
 * Minutes the FX market was OPEN between two instants (weekend closure excluded), at 15-minute resolution (the weekly
 * open/close fall on whole hours). Spans over 21 days are scaled by 5/7: clearly stale either way.
 */
export function forexOpenMinutesBetween(fromMs: number, toMs: number): number {
  if (!(toMs > fromMs)) return 0;
  if (toMs - fromMs > 21 * 86_400_000) return ((toMs - fromMs) / 60_000) * (5 / 7);
  let open = 0;
  for (let t = fromMs; t < toMs; t += STEP_MS) {
    if (!isForexClosed(t)) open += Math.min(STEP_MS, toMs - t);
  }
  return open / 60_000;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isWeekdayUtc = (ms: number) => { const d = new Date(ms).getUTCDay(); return d !== 0 && d !== 6; };

/** Newest FX daily bar date (YYYY-MM-DD, UTC weekday) that is complete as of `nowMs`: the last weekday before today (UTC). */
export function lastCompletedForexDailyBar(nowMs: number): string {
  const d = new Date(nowMs);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 86_400_000;
  for (let i = 0; i < 7 && !isWeekdayUtc(t); i++) t -= 86_400_000;
  return ymd(t);
}

/** FX daily sessions (UTC weekdays) after `fromYmd` up to and including `toYmd`; 0 when `toYmd` <= `fromYmd`. */
export function forexSessionsBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toYmd.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  if (b - a > 400 * 86_400_000) return Math.round(((b - a) / 86_400_000) * (5 / 7));
  let n = 0;
  for (let t = a + 86_400_000; t <= b; t += 86_400_000) if (isWeekdayUtc(t)) n++;
  return n;
}
