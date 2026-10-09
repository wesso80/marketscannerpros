import type { PriceChart } from './symbolPriceChart';
import { lastCompletedUsSessionDate } from '@/lib/time/usSession';
export type ComparisonInput = { symbol: string; source: string; closes: number[]; dates: string[] };
export type SymbolComparison = {
  price?: PriceChart; symbol: string; type: 'equity' | 'crypto'; requestedDays: number; from: string | null; to: string | null;
  dates: string[]; series: Array<{ symbol: string; source: string; values: number[]; changePct: number; correlation: number | null }>;
  returnPairs: number; missing: string[]; basis: string;
};
export function returnCorrelation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 21) return null;
  const ra = a.slice(1).map((v, i) => v / a[i] - 1), rb = b.slice(1).map((v, i) => v / b[i] - 1);
  if (![...ra, ...rb].every(Number.isFinite)) return null;
  const ma = ra.reduce((s, v) => s + v, 0) / ra.length, mb = rb.reduce((s, v) => s + v, 0) / rb.length;
  let va = 0, vb = 0, cov = 0;
  ra.forEach((v, i) => { va += (v - ma) ** 2; vb += (rb[i] - mb) ** 2; cov += (v - ma) * (rb[i] - mb); });
  return va > 1e-20 && vb > 1e-20 ? Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb))) : null;
}
export function buildSymbolComparison(symbol: string, type: 'equity' | 'crypto', inputs: ComparisonInput[], requestedDays: number, now: number): SymbolComparison {
  const cutoff = new Date(now - requestedDays * 86400000).toISOString().slice(0, 10);
  const last = type === 'equity' ? lastCompletedUsSessionDate(now) : new Date(now - 86400000).toISOString().slice(0, 10);
  const requested = [...new Set([symbol, ...(type === 'equity' ? ['SPY', 'QQQ'] : ['BTC'])])];
  const maps = requested.map(name => {
    const input = inputs.find(i => i.symbol === name), values = new Map<string, number>();
    if (input && input.dates.length === input.closes.length) input.dates.forEach((date, i) => {
      const day = date.slice(0, 10), value = input.closes[i];
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day >= cutoff && day <= last && Number.isFinite(value) && value > 0) values.set(day, value);
    });
    return { symbol: name, source: input?.source || 'unavailable', values };
  });
  const missing = maps.filter(m => m.values.size < 2).map(m => `${m.symbol}: completed daily history unavailable.`);
  const available = maps.filter(m => m.values.size >= 2);
  const dates = maps[0].values.size >= 2 ? [...maps[0].values.keys()].filter(d => available.every(m => m.values.has(d))).sort() : [];
  if (dates.length < 2) missing.push('At least two matching completed observations are required.');
  const usableDates = dates.length >= 2 ? dates : [];
  const selected = usableDates.map(d => maps[0].values.get(d)!);
  const series = usableDates.length ? available.map(m => {
    const closes = usableDates.map(d => m.values.get(d)!);
    return { symbol: m.symbol, source: m.source, values: closes.map(v => (v / closes[0] - 1) * 100), changePct: (closes.at(-1)! / closes[0] - 1) * 100,
      correlation: m.symbol === symbol ? null : returnCorrelation(selected, closes) };
  }) : [];
  return { symbol, type, requestedDays, from: usableDates[0] ?? null, to: usableDates.at(-1) ?? null, dates: usableDates, series, returnPairs: Math.max(0, usableDates.length - 1), missing,
    basis: `${type === 'equity' ? 'Split-adjusted daily price closes; dividends excluded' : 'Daily USD closes, UTC'}. Shared dates only; no interpolation. Pearson correlation of returns between matched closes, minimum 20 return pairs. Gaps can span multiple sessions. Historical co-movement is not a forecast.` };
}
