import { describe, expect, it } from 'vitest';
import { buildSymbolComparison, returnCorrelation } from '@/lib/research/symbolComparison';
const now = Date.parse('2026-10-08T12:00:00Z');
const dates = Array.from({ length: 25 }, (_, i) => new Date(now - (26 - i) * 86400000).toISOString().slice(0, 10));
const prices = dates.map((_, i) => 100 + i + Math.sin(i) * 2);
const input = (symbol: string, multiplier = 1) => ({ symbol, dates, closes: prices.map(v => v * multiplier), source: 'fixture' });
describe('benchmark calculations', () => {
  it('rebases different price scales and correlates matched returns, not price levels', () => {
    const r = buildSymbolComparison('AAPL', 'equity', [input('AAPL'), input('SPY', 5), input('QQQ', 3)], 90, now);
    expect(r.series.map(s => s.values[0])).toEqual([0, 0, 0]);
    expect(r.series[1].correlation).toBeCloseTo(1);
    expect(r.series[1].changePct).toBeCloseTo(r.series[0].changePct);
    expect(r.returnPairs).toBe(24);
  });
  it('does not interpolate missing dates or include the unfinished bar', () => {
    const selected = { ...input('ETH'), dates: [...dates, '2026-10-08'], closes: [...prices, 999] };
    const btc = { ...input('BTC'), dates: dates.slice(1), closes: prices.slice(1) };
    const r = buildSymbolComparison('ETH', 'crypto', [selected, btc], 90, now);
    expect(r.dates).toEqual(dates.slice(1)); expect(r.series[0].values[0]).toBe(0);
  });
  it('reports missing benchmarks without inventing a curve', () => {
    const r = buildSymbolComparison('AAPL', 'equity', [input('AAPL'), input('SPY')], 90, now);
    expect(r.series.map(s => s.symbol)).toEqual(['AAPL', 'SPY']); expect(r.missing.join()).toContain('QQQ');
    expect(buildSymbolComparison('AAPL', 'equity', [input('SPY')], 90, now).series).toEqual([]);
  });
  it('deduplicates self benchmarks and leaves insufficient or constant-return correlation unavailable', () => {
    expect(buildSymbolComparison('BTC', 'crypto', [input('BTC')], 90, now).series).toHaveLength(1);
    expect(returnCorrelation(prices.slice(0, 10), prices.slice(0, 10))).toBeNull();
    expect(returnCorrelation(Array(25).fill(100), prices)).toBeNull();
  });
  it('rejects invalid closes and misaligned date/close arrays', () => {
    const r = buildSymbolComparison('BTC', 'crypto', [{ ...input('BTC'), closes: [0] }], 90, now);
    expect(r.series).toEqual([]);
  });
});
