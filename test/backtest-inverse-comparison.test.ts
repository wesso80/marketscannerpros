import { describe, expect, it } from 'vitest';
import { buildInverseComparisonSnapshot } from '../lib/backtest/inverseComparison';

describe('inverse backtest comparison', () => {
  it('mirrors trade direction and returns for inverse replay', () => {
    const base = {
      totalTrades: 2,
      winningTrades: 1,
      losingTrades: 1,
      winRate: 50,
      totalReturn: 2,
      maxDrawdown: 4,
      sharpeRatio: 1.2,
      profitFactor: 1.4,
      avgWin: 6,
      avgLoss: -4,
      cagr: 8,
      volatility: 14,
      sortinoRatio: 1.5,
      calmarRatio: 1.1,
      timeInMarket: 42,
      bestTrade: null,
      worstTrade: null,
      equityCurve: [],
      trades: [
        {
          entryDate: '2025-01-01',
          exitDate: '2025-01-03',
          symbol: 'SPY',
          side: 'LONG' as const,
          entry: 100,
          exit: 106,
          return: 6,
          returnPercent: 6,
          holdingPeriodDays: 2,
        },
        {
          entryDate: '2025-01-04',
          exitDate: '2025-01-05',
          symbol: 'SPY',
          side: 'LONG' as const,
          entry: 106,
          exit: 101.76,
          return: -4.24,
          returnPercent: -4,
          holdingPeriodDays: 1,
        },
      ],
    };

    const snapshot = buildInverseComparisonSnapshot(base);

    expect(snapshot.inverse.trades[0].side).toBe('SHORT');
    expect(snapshot.inverse.trades[0].returnPercent).toBe(-6);
    expect(snapshot.inverse.trades[1].returnPercent).toBe(4);

    expect(snapshot.inverse.totalReturn).toBe(-2);
    expect(snapshot.inverse.winRate).toBe(50);
    expect(snapshot.inverse.sharpeRatio).toBe(-1.2);
    expect(snapshot.inverse.cagr).toBe(-8);

    expect(snapshot.delta.totalReturn).toBe(-4);
  });
});
