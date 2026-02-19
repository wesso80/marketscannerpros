import { describe, expect, it } from 'vitest';
import {
  buildBacktestDiagnostics,
  inferStrategyDirection,
} from '../lib/backtest/diagnostics';
import type { BacktestEngineResult } from '../lib/backtest/engine';

function makeResult(overrides: Partial<BacktestEngineResult>): BacktestEngineResult {
  return {
    totalTrades: 20,
    winningTrades: 12,
    losingTrades: 8,
    winRate: 60,
    totalReturn: 12,
    maxDrawdown: 8,
    sharpeRatio: 1.4,
    profitFactor: 1.5,
    avgWin: 120,
    avgLoss: -80,
    cagr: 14,
    volatility: 18,
    sortinoRatio: 1.7,
    calmarRatio: 1.3,
    timeInMarket: 45,
    bestTrade: null,
    worstTrade: null,
    equityCurve: [],
    trades: [],
    ...overrides,
  };
}

describe('backtest diagnostics acceptance', () => {
  it('marks setup invalidated when expectancy is negative', () => {
    const result = makeResult({
      totalReturn: -14,
      profitFactor: 0.78,
      winRate: 36,
      maxDrawdown: 28,
      totalTrades: 6,
      avgWin: 55,
      avgLoss: -120,
    });

    const diagnostics = buildBacktestDiagnostics(result, 'bullish', '6min', 90);

    expect(diagnostics.verdict).toBe('invalidated');
    expect(diagnostics.invalidation.status).toBe('invalidated');
    expect(diagnostics.failureTags).toContain('negative_expectancy');
    expect(diagnostics.adjustments.length).toBeGreaterThan(0);
  });

  it('keeps setup valid for healthy metrics', () => {
    const result = makeResult({});
    const diagnostics = buildBacktestDiagnostics(result, 'bullish', 'daily', 320);

    expect(diagnostics.verdict).toBe('healthy');
    expect(diagnostics.invalidation.status).toBe('valid');
  });

  it('infers bi-directional mode when both long and short trades exist', () => {
    const direction = inferStrategyDirection('brain_signal_replay', [
      {
        entryDate: '2024-01-01',
        exitDate: '2024-01-02',
        symbol: 'SPY',
        side: 'LONG',
        entry: 100,
        exit: 101,
        return: 95,
        returnPercent: 1,
        holdingPeriodDays: 2,
      },
      {
        entryDate: '2024-01-03',
        exitDate: '2024-01-04',
        symbol: 'SPY',
        side: 'SHORT',
        entry: 102,
        exit: 100,
        return: 190,
        returnPercent: 1.96,
        holdingPeriodDays: 2,
      },
    ]);

    expect(direction).toBe('both');
  });
});
