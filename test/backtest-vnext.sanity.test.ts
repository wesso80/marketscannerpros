import { describe, expect, it } from 'vitest';
import { computeCoverage, parseBacktestTimeframe, resamplePriceData } from '../lib/backtest/timeframe';
import { enrichTradesWithMetadata } from '../lib/backtest/tradeForensics';

function makeMinuteBars(count: number) {
  const out: Record<string, { open: number; high: number; low: number; close: number; volume: number }> = {};
  const start = new Date('2024-01-01T00:00:00Z').getTime();

  for (let i = 0; i < count; i++) {
    const ts = new Date(start + i * 60_000).toISOString().replace('T', ' ').slice(0, 19);
    const base = 100 + i * 0.05;
    out[ts] = {
      open: base,
      high: base + 0.2,
      low: base - 0.2,
      close: base + 0.1,
      volume: 100 + i,
    };
  }

  return out;
}

describe('backtest vNext sanity checks', () => {
  it('keeps MFE non-negative and MAE non-positive for long and short trades', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'];
    const highs = [101, 103, 104, 102];
    const lows = [99, 97, 98, 96];

    const enriched = enrichTradesWithMetadata(
      [
        {
          entryDate: '2024-01-01',
          exitDate: '2024-01-04',
          symbol: 'SPY',
          side: 'LONG',
          entry: 100,
          exit: 101,
          return: 95,
          returnPercent: 1,
          holdingPeriodDays: 4,
        },
        {
          entryDate: '2024-01-01',
          exitDate: '2024-01-04',
          symbol: 'SPY',
          side: 'SHORT',
          entry: 100,
          exit: 99,
          return: 95,
          returnPercent: 1,
          holdingPeriodDays: 4,
        },
      ],
      dates,
      highs,
      lows,
    );

    const [longTrade, shortTrade] = enriched;

    expect(longTrade.mfe ?? -1).toBeGreaterThanOrEqual(0);
    expect(longTrade.mae ?? 1).toBeLessThanOrEqual(0);

    expect(shortTrade.mfe ?? -1).toBeGreaterThanOrEqual(0);
    expect(shortTrade.mae ?? 1).toBeLessThanOrEqual(0);
  });

  it('normalizes equivalent timeframe inputs to equivalent resampled bars', () => {
    const bars = makeMinuteBars(240);

    const tf120m = parseBacktestTimeframe('120m');
    const tf2h = parseBacktestTimeframe('2h');
    const tf2hour = parseBacktestTimeframe('2hour');
    const tf6m = parseBacktestTimeframe('6m');
    const tf6min = parseBacktestTimeframe('6min');

    expect(tf120m?.minutes).toBe(120);
    expect(tf2h?.minutes).toBe(120);
    expect(tf2hour?.minutes).toBe(120);

    const a = resamplePriceData(bars, tf120m!.minutes, 1);
    const b = resamplePriceData(bars, tf2h!.minutes, 1);
    const c = resamplePriceData(bars, tf2hour!.minutes, 1);

    expect(Object.keys(a).length).toBe(Object.keys(b).length);
    expect(Object.keys(b).length).toBe(Object.keys(c).length);
    expect(a).toEqual(b);
    expect(b).toEqual(c);

    expect(tf6m?.normalized).toBe('6min');
    expect(tf6min?.normalized).toBe('6min');
    expect(tf6m?.minutes).toBe(tf6min?.minutes);
  });

  it('clamps applied coverage to available data and bar count reflects applied range', () => {
    const priceData = {
      '2024-06-10 09:30:00': { open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      '2024-06-11 09:30:00': { open: 101, high: 103, low: 100, close: 102, volume: 1200 },
      '2024-06-12 09:30:00': { open: 102, high: 104, low: 101, close: 103, volume: 1100 },
    };

    const requestedStart = '2024-01-01';
    const requestedEnd = '2024-12-31';
    const coverage = computeCoverage(priceData, requestedStart, requestedEnd);

    expect(coverage.minAvailable).toBe('2024-06-10');
    expect(coverage.maxAvailable).toBe('2024-06-12');
    expect(coverage.appliedStartDate).toBe('2024-06-10');
    expect(coverage.appliedEndDate).toBe('2024-06-12');

    const appliedBars = Object.keys(priceData).filter((key) => {
      const day = key.split(' ')[0];
      return day >= coverage.appliedStartDate && day <= coverage.appliedEndDate;
    });

    expect(coverage.bars).toBe(appliedBars.length);
    expect(coverage.bars).toBe(3);
  });
});
