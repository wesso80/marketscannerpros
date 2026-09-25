/**
 * BT-4: the strategy backtester's max drawdown must include open-position
 * losses (bar-close mark to market), not only closed-trade balance changes.
 * The page uses this drawdown for its LOW/MODERATE/HIGH risk and EXECUTE labels.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runStrategy, computeMarkedBalances } from '../lib/backtest/runStrategy';
import { buildBacktestEngineResult, type BacktestTrade } from '../lib/backtest/engine';
import type { PriceData } from '../lib/backtest/providers';
import { BACKTEST_SLIPPAGE_BPS, BACKTEST_COMMISSION_BPS } from '../lib/backtest/assumptions';

function priceData(closes: number[]): PriceData {
  const data: PriceData = {};
  closes.forEach((close, i) => {
    const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    data[d] = { open: close, high: close * 1.002, low: close * 0.998, close, volume: 1_000_000 };
  });
  return data;
}

/**
 * Zig-zag warm-up, a slide that pushes RSI(14) below 30 (entry), a further
 * ~18% slide while the trade is open, then a rally that pushes RSI above 70
 * and closes the trade ABOVE its entry. One winning trade, deep open drawdown.
 */
function dipThenRecoverSeries(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 40; i++) closes.push(i % 2 === 0 ? 100 : 101);
  let p = 100;
  for (let i = 0; i < 25; i++) { p -= 1; closes.push(p); }   // 99 .. 75
  for (let i = 0; i < 25; i++) { p += 2.5; closes.push(p); } // 77.5 .. 137.5
  for (let i = 0; i < 20; i++) closes.push(p);
  return closes;
}

describe('BT-4 mark-to-market drawdown', () => {
  it('an open trade that draws down before closing positive shows non-zero max drawdown', () => {
    const data = priceData(dipThenRecoverSeries());
    const dates = Object.keys(data).sort();
    const result = runStrategy('rsi_reversal', data, 10_000, dates[0], dates[dates.length - 1], 'SYNTH', 'daily', 'stock');

    expect(result.trades).toHaveLength(1);
    const [trade] = result.trades;
    expect(trade.return).toBeGreaterThan(0);

    // Old behaviour: closed-trade balance only -> a single winner can never draw down.
    const closedOnly = buildBacktestEngineResult(result.trades, result.dates, 10_000, { sourceBarMinutes: 1440 });
    expect(closedOnly.maxDrawdown).toBe(0);

    // New behaviour: marks the open position at every bar close.
    const marked = buildBacktestEngineResult(result.trades, result.dates, 10_000, { sourceBarMinutes: 1440, markedBalances: result.markedBalances });
    expect(marked.maxDrawdown).toBeGreaterThan(10);
    expect(marked.statisticsBasis?.equity).toBe('bar_close_mark_to_market');
    // Final equity still equals initial capital plus the realised trade P&L.
    expect(marked.equityCurve[marked.equityCurve.length - 1].equity).toBeCloseTo(10_000 + trade.return, 1);
    expect(marked.totalReturn).toBe(closedOnly.totalReturn);
  });

  it('marks are realised P&L plus the open position at the bar close, net of exit costs', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'];
    const closes = [100, 90, 80, 95, 110];
    const trade: BacktestTrade = {
      entryDate: '2026-01-02', exitDate: '2026-01-04', symbol: 'X', side: 'LONG',
      entry: 100, exit: 95, return: -60, returnPercent: -0.6, holdingPeriodDays: 3,
    };
    const marks = computeMarkedBalances([trade], dates, closes, 10_000, 'stock');
    expect(marks.get('2026-01-01')).toBe(10_000);
    // 95 shares marked at close 90 with the same exit slippage and per-leg
    // commission used for realised trades.
    const markExit = 90 * (1 - BACKTEST_SLIPPAGE_BPS / 10_000);
    const expected = 10_000 + (markExit - 100) * 95 - (100 * 95 + markExit * 95) * (BACKTEST_COMMISSION_BPS.stock / 10_000);
    expect(marks.get('2026-01-02')!).toBeCloseTo(expected, 6);
    expect(marks.get('2026-01-02')!).toBeLessThan(10_000 + (90 - 100) * 95);
    expect(marks.get('2026-01-03')!).toBeLessThan(marks.get('2026-01-02')!);
    expect(marks.get('2026-01-04')).toBe(10_000 - 60); // exit bar uses the realised return
    expect(marks.get('2026-01-05')).toBe(10_000 - 60); // flat after the exit

    const short = computeMarkedBalances([{ ...trade, side: 'SHORT' }], dates, closes, 10_000, 'stock');
    expect(short.get('2026-01-03')!).toBeGreaterThan(10_000); // price fell: short is in profit while open
  });

  it('the backtest API passes marked balances into the engine', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/backtest/route.ts'), 'utf8');
    expect(route).toContain('const { trades, dates, markedBalances } = runStrategy(');
    expect(route).toMatch(/buildBacktestEngineResult\(trades, dates, initialCapital, \{[^}]*markedBalances/);
  });
});
