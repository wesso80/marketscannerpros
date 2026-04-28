import { describe, expect, it } from 'vitest';
import { buildBacktestEngineResult, type BacktestTrade } from '../lib/backtest/engine';

function trade(overrides: Partial<BacktestTrade>): BacktestTrade {
  return {
    entryDate: '2026-01-01',
    exitDate: '2026-01-01',
    symbol: 'SPY',
    side: 'LONG',
    entry: 100,
    exit: 100,
    return: 0,
    returnPercent: 0,
    holdingPeriodDays: 1,
    ...overrides,
  };
}

const dates = [
  '2026-01-01',
  '2026-01-02',
  '2026-01-03',
  '2026-01-04',
  '2026-01-05',
  '2026-01-06',
];

describe('backtest engine metrics', () => {
  it('classifies breakeven trades separately from losses', () => {
    const result = buildBacktestEngineResult([
      trade({ return: 100, returnPercent: 1 }),
      trade({ return: 0, returnPercent: 0 }),
      trade({ return: -50, returnPercent: -0.5 }),
    ], dates, 10_000);

    expect(result.winningTrades).toBe(1);
    expect(result.losingTrades).toBe(1);
    expect(result.breakevenTrades).toBe(1);
    expect(result.avgLoss).toBe(-50);
    expect(result.profitFactor).toBe(2);
  });

  it('returns null profit factor with an explanatory label when there are no losing trades', () => {
    const result = buildBacktestEngineResult([
      trade({ return: 100, returnPercent: 1 }),
      trade({ return: 0, returnPercent: 0 }),
    ], dates, 10_000);

    expect(result.losingTrades).toBe(0);
    expect(result.breakevenTrades).toBe(1);
    expect(result.profitFactor).toBeNull();
    expect(result.profitFactorLabel).toBe('No losing trades in sample');
  });

  it('merges overlapping exposure windows when calculating time in market', () => {
    const result = buildBacktestEngineResult([
      trade({ entryDate: '2026-01-01', exitDate: '2026-01-03', holdingPeriodDays: 3, return: 100, returnPercent: 1 }),
      trade({ entryDate: '2026-01-02', exitDate: '2026-01-04', holdingPeriodDays: 3, return: -50, returnPercent: -0.5 }),
      trade({ entryDate: '2026-01-06', exitDate: '2026-01-06', holdingPeriodDays: 1, return: 25, returnPercent: 0.25 }),
    ], dates, 10_000);

    expect(result.timeInMarket).toBe(83.33);
  });

  it('uses a deterministic Monte Carlo seed', () => {
    const trades = Array.from({ length: 8 }, (_, index) => trade({
      entryDate: dates[index % dates.length],
      exitDate: dates[index % dates.length],
      return: index % 2 === 0 ? 100 : -80,
      returnPercent: index % 2 === 0 ? 1 : -0.8,
    }));

    const first = buildBacktestEngineResult(trades, dates, 10_000).monteCarlo;
    const second = buildBacktestEngineResult(trades, dates, 10_000).monteCarlo;

    expect(first?.seed).toBe(20260427);
    expect(first).toEqual(second);
  });
});
