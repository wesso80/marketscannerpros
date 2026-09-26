/**
 * BT-5: the Inverse (Short) Compare must build the inverse on the same equity basis
 * as the base result. Since PR #67 the base is bar-close marked to market, so the
 * inverse mirrors those marked balances and the Delta compares like with like.
 */
import { describe, expect, it } from 'vitest';
import { runStrategy, computeMarkedBalances } from '../lib/backtest/runStrategy';
import { buildBacktestEngineResult, type BacktestTrade } from '../lib/backtest/engine';
import { buildInverseComparisonSnapshot, mirrorMarkedBalances } from '../lib/backtest/inverseComparison';
import type { PriceData } from '../lib/backtest/providers';

function priceData(closes: number[]): PriceData {
  const data: PriceData = {};
  closes.forEach((close, i) => {
    const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    data[d] = { open: close, high: close * 1.002, low: close * 0.998, close, volume: 1_000_000 };
  });
  return data;
}

/** Same shape as the BT-4 test: RSI entry, ~18% slide while open, rally to a winning exit. */
function dipThenRecoverSeries(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 40; i++) closes.push(i % 2 === 0 ? 100 : 101);
  let p = 100;
  for (let i = 0; i < 25; i++) { p -= 1; closes.push(p); }
  for (let i = 0; i < 25; i++) { p += 2.5; closes.push(p); }
  for (let i = 0; i < 20; i++) closes.push(p);
  return closes;
}

describe('BT-5 inverse compare uses the bar-close basis', () => {
  it('a real runStrategy result: both drawdowns are bar-close and the Delta subtracts matching figures', () => {
    const data = priceData(dipThenRecoverSeries());
    const dates = Object.keys(data).sort();
    const run = runStrategy('rsi_reversal', data, 10_000, dates[0], dates[dates.length - 1], 'SYNTH', 'daily', 'stock');
    expect(run.trades).toHaveLength(1);
    const base = buildBacktestEngineResult(run.trades, run.dates, 10_000, { sourceBarMinutes: 1440, markedBalances: run.markedBalances });
    expect(base.statisticsBasis?.equity).toBe('bar_close_mark_to_market');
    expect(base.maxDrawdown).toBeGreaterThan(10); // open-trade drawdown on the base

    const snap = buildInverseComparisonSnapshot(base)!;
    expect(snap.drawdownBasis).toBe('bar_close_mark_to_market');
    expect(snap.inverse.statisticsBasis?.equity).toBe('bar_close_mark_to_market');

    // The inverse gains while the base trade is underwater, then gives it all back and
    // more by the exit: its marked peak-to-trough is far bigger than the closed-trade loss.
    const closedOnlyInverse = buildInverseComparisonSnapshot({ ...base, statisticsBasis: { ...base.statisticsBasis!, equity: 'closed_trade_balance' } })!;
    expect(closedOnlyInverse.inverse.statisticsBasis?.equity).toBe('closed_trade_balance');
    expect(snap.inverse.maxDrawdown).toBeGreaterThan(closedOnlyInverse.inverse.maxDrawdown);

    // Every bar mirrors the base's open + realised P&L around the starting capital.
    base.equityCurve.forEach((point, i) => {
      expect(snap.inverse.equityCurve[i].date).toBe(point.date);
      expect(snap.inverse.equityCurve[i].equity).toBeCloseTo(20_000 - point.equity, 1);
    });
    // Final balance still equals capital minus the base's realised P&L (same as the trade list).
    expect(snap.inverse.equityCurve.at(-1)!.equity).toBeCloseTo(10_000 - run.trades[0].return, 1);
    expect(snap.inverse.totalReturn).toBe(-base.totalReturn);
    expect(snap.delta.maxDrawdown).toBeCloseTo(snap.inverse.maxDrawdown - base.maxDrawdown, 4);
  });

  it('an open-trade drawdown that closed trades hide shows up in the inverse too', () => {
    // Base LONG runs +20% while open, then exits at a loss. The inverse trade is a closed
    // winner (0% closed-trade drawdown) but was deeply underwater while the base ran up.
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'];
    const closes = [100, 100, 110, 120, 95, 95];
    const trade: BacktestTrade = {
      entryDate: '2026-01-02', exitDate: '2026-01-05', symbol: 'X', side: 'LONG',
      entry: 100, exit: 95, return: -500, returnPercent: -5, holdingPeriodDays: 3,
    };
    const markedBalances = computeMarkedBalances([trade], dates, closes, 10_000, 'stock');
    const base = buildBacktestEngineResult([trade], dates, 10_000, { markedBalances });
    const snap = buildInverseComparisonSnapshot(base)!;

    expect(base.maxDrawdown).toBeGreaterThan(20); // peak ~11.9k during the run-up down to 9.5k
    expect(snap.inverse.trades[0].return).toBe(500);
    expect(snap.inverse.maxDrawdown).toBeGreaterThan(15); // inverse dips to ~8.1k while open
    // Old behaviour for comparison: closed-trade inverse shows no drawdown at all.
    const closedInverse = buildInverseComparisonSnapshot({ ...base, statisticsBasis: { ...base.statisticsBasis!, equity: 'closed_trade_balance' } })!;
    expect(closedInverse.inverse.maxDrawdown).toBe(0);
    expect(snap.delta.maxDrawdown).toBeCloseTo(snap.inverse.maxDrawdown - base.maxDrawdown, 4);
  });

  it('mirrors around each result\'s own starting capital, and leaves closed-trade bases on closed trades', () => {
    const base = { initialCapital: 10_000, statisticsBasis: { sourceBarMinutes: 1440, equity: 'bar_close_mark_to_market' as const },
      totalReturn: 0, winRate: 0, maxDrawdown: 0, profitFactor: null, trades: [],
      equityCurve: [{ date: '2026-01-01', equity: 10_000, drawdown: 0 }, { date: '2026-01-02', equity: 10_400, drawdown: 0 }] };
    expect([...mirrorMarkedBalances(base, 20_000)!.values()]).toEqual([20_000, 19_600]);
    expect(mirrorMarkedBalances({ ...base, statisticsBasis: { sourceBarMinutes: 1440, equity: 'closed_trade_balance' } }, 10_000)).toBeUndefined();
    expect(mirrorMarkedBalances({ ...base, statisticsBasis: undefined }, 10_000)).toBeUndefined();
  });
});
