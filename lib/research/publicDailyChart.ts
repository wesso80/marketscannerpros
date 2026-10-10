import { partialBarDate } from '@/lib/research/priceEvidence';

/** Same window the Symbol chart asked `/api/bars` for. */
export const PUBLIC_DAILY_CHART_LIMIT = 140;

export type PublicDailyBar = { t: string; h: number; l: number; c: number };
export type PublicDailyChart = { basis: string; bars: PublicDailyBar[] };

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Chart bars from the daily series the report already fetched.
 * The unfinished session bar is left off, matching price evidence, so the last
 * candle is the same completed session the source line names.
 */
export function publicDailyChart(input: {
  assetClass: 'equity' | 'crypto' | 'forex';
  timeframeKey: string;
  source?: string | null;
  nowMs: number;
  dates?: string[] | null;
  closes?: number[] | null;
  highs?: number[] | null;
  lows?: number[] | null;
}): PublicDailyChart | null {
  if (input.timeframeKey !== 'daily' || input.assetClass === 'forex') return null;
  const dates = input.dates ?? [];
  const closes = input.closes ?? [];
  if (!dates.length || dates.length !== closes.length) return null;
  const highs = input.highs ?? [];
  const lows = input.lows ?? [];
  const alignedHigh = highs.length === dates.length;
  const alignedLow = lows.length === dates.length;
  const rows: PublicDailyBar[] = [];
  for (let i = 0; i < dates.length; i++) {
    const t = String(dates[i] ?? '').slice(0, 10);
    const c = closes[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !positive(c)) continue;
    rows.push({
      t,
      c,
      h: alignedHigh && positive(highs[i]) ? highs[i] : c,
      l: alignedLow && positive(lows[i]) ? lows[i] : c,
    });
  }
  rows.sort((a, b) => a.t.localeCompare(b.t));
  const partial = rows.length ? partialBarDate(rows[rows.length - 1].t, input.assetClass, input.nowMs) : null;
  const done = partial && rows[rows.length - 1].t === partial ? rows.slice(0, -1) : rows;
  const bars = done.slice(-PUBLIC_DAILY_CHART_LIMIT);
  if (bars.length < 2) return null;
  return { basis: input.source?.trim() || 'Daily bars', bars };
}
