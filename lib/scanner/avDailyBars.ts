/**
 * Parse an Alpha Vantage TIME_SERIES_DAILY(_ADJUSTED) payload into oldest-first daily bars on today's share basis.
 *
 * AV *_ADJUSTED only adjusts '5. adjusted close'; raw O/H/L/C keep pre-split prices, so older bars are divided by
 * the cumulative '8. split coefficient' (same rule as lib/goldenEggFetchers). Dividends are not back-adjusted, which
 * matches TradingView's default (non-adjusted for dividends) daily chart.
 */
import type { Bar } from '@/lib/scanner/barAggregation';

export function parseAlphaVantageDailyBars(payload: unknown, maxBars = 1000): Bar[] {
  const data = payload as Record<string, any> | null;
  const ts = data?.['Time Series (Daily)'];
  if (!ts || typeof ts !== 'object') return [];
  const newestFirst = Object.keys(ts).sort().reverse();
  const factor = new Map<string, number>();
  let f = 1;
  for (const d of newestFirst) {
    factor.set(d, f);
    const coef = parseFloat(ts[d]?.['8. split coefficient'] ?? '1');
    if (Number.isFinite(coef) && coef > 0 && Math.abs(coef - 1) > 1e-9) f *= coef;
  }
  const bars: Bar[] = [];
  for (const d of newestFirst.slice(0, maxBars).reverse()) {
    const row = ts[d] ?? {};
    const k = factor.get(d) ?? 1;
    const px = (field: string) => parseFloat(row[field]) / k;
    const open = px('1. open'), high = px('2. high'), low = px('3. low'), close = px('4. close');
    const rawVol = parseFloat(row['6. volume'] ?? row['5. volume']);
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) continue;
    bars.push({ t: `${d}T00:00:00.000Z`, open, high, low, close, volume: Number.isFinite(rawVol) && rawVol >= 0 ? rawVol * k : null });
  }
  return bars;
}
