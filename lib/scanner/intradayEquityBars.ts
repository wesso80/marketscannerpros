/**
 * Helpers for Alpha Vantage intraday equity bars, which are stamped in US/Eastern wall time with no offset
 * ("2026-09-25 14:15:00") and include pre-/post-market bars.
 */
import { zonedTimeToUtc } from '@/lib/macro/calendar/time';

const NAIVE_WALL_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/** Naive US/Eastern "YYYY-MM-DD HH:mm(:ss)" → epoch ms, or NaN when the string is not in that form. */
export function easternWallTimeToMs(stamp: string | null | undefined): number {
  const m = stamp ? NAIVE_WALL_TIME.exec(stamp.trim()) : null;
  if (!m) return NaN;
  try {
    return zonedTimeToUtc(m[1], m[2], 'America/New_York').getTime() + Number(m[3] ?? 0) * 1000;
  } catch {
    return NaN;
  }
}

/** Naive US/Eastern bar stamp → ISO UTC, or null. */
export function easternBarTimeToIso(stamp: string | null | undefined): string | null {
  const ms = easternWallTimeToMs(stamp);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Average whole-day volume over the COMPLETED US/Eastern dates in an intraday window (the latest date, which may still be
 * trading, is excluded). Used as the liquidity basis so one quiet pre-/post-market bar never reads as the day's volume.
 */
export function intradayAvgDailyVolume(candles: ReadonlyArray<{ date: string; volume: number }>, maxDays = 20): number | null {
  const byDate = new Map<string, number>();
  for (const c of candles) {
    const d = c.date.slice(0, 10);
    byDate.set(d, (byDate.get(d) ?? 0) + (Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0));
  }
  const days = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, -1)
    .slice(-maxDays)
    .map(([, v]) => v)
    .filter((v) => v > 0);
  return days.length ? days.reduce((sum, v) => sum + v, 0) / days.length : null;
}
