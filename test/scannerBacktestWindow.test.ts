import { describe, expect, it } from 'vitest';
import { runScannerBacktest, type ScannerBacktestParams } from '../lib/backtest/scannerBacktest';

const bars = Array.from({ length: 730 }, (_, i) => {
  const close = 100 + i * 0.4 + Math.sin(i / 10) * 8;
  return { date: new Date(Date.UTC(2023, 0, 1) + i * 86400000).toISOString().slice(0, 10), open: close - 0.2, high: close + 2, low: close - 2, close, volume: 10000 + i * 10 };
});
const params: ScannerBacktestParams = {
  symbol: 'META', bars, initialCapital: 10000, minScore: 50,
  stopMultiplier: 1.5, targetMultiplier: 3, maxHoldBars: 10, allowShorts: true,
  startDate: '2024-01-01', endDate: '2024-03-31', sourceBarMinutes: 1440,
};

describe('scanner historical trading window', () => {
  it('uses earlier history only for warmup and never trades or scores outside the requested window', () => {
    const result = runScannerBacktest(params);
    expect(result.scoreSeries[0].date).toBe(params.startDate);
    expect(result.scoreSeries.at(-1)?.date).toBe(params.endDate);
    expect(result.scoreSeries).toHaveLength(91);
    expect(result.trades.length).toBeGreaterThan(0);
    for (const trade of result.trades) {
      expect(trade.entryDate >= params.startDate!).toBe(true);
      expect(trade.exitDate <= params.endDate!).toBe(true);
    }
  });

  it('cannot change an earlier-window result by changing future prices', () => {
    const result = runScannerBacktest(params);
    const altered = bars.map(bar => bar.date > params.endDate! ? { ...bar, close: bar.close * 100, high: bar.high * 100, low: bar.low * 100 } : bar);
    expect(runScannerBacktest({ ...params, bars: altered })).toEqual(result);
  });

  it('returns no trades or scores when the requested range is outside available history', () => {
    const result = runScannerBacktest({ ...params, startDate: '2026-01-01', endDate: '2026-02-01' });
    expect(result.scoreSeries).toEqual([]);
    expect(result.trades).toEqual([]);
  });

  it('includes all intraday bars on the requested end date without spilling into the next date', () => {
    const intraday = bars.flatMap(bar => ['09:30:00', '16:00:00'].map(time => ({ ...bar, date: `${bar.date} ${time}` })));
    const result = runScannerBacktest({ ...params, bars: intraday, sourceBarMinutes: 60 });
    expect(result.scoreSeries[0].date).toBe('2024-01-01 09:30:00');
    expect(result.scoreSeries.at(-1)?.date).toBe('2024-03-31 16:00:00');
    expect(result.trades.every(trade => trade.exitDate.slice(0, 10) <= params.endDate!)).toBe(true);
  });
});
