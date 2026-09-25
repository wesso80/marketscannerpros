import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  backtestAction,
  formatProfitFactorValue,
  hasNoLosses,
  isBlockedBySampleSize,
  MIN_TRADES_FOR_EXECUTE,
  PROFIT_FACTOR_SCORE_CAP,
  scoreProfitFactor,
} from '../lib/backtest/profitFactorScore';

// Edge score formula used on the backtest page.
const edgeScore = (r: Parameters<typeof scoreProfitFactor>[0] & { winRate: number; maxDrawdown: number }) =>
  Math.max(1, Math.min(99, Math.round(scoreProfitFactor(r) * 25 + r.winRate * 0.35 - r.maxDrawdown * 0.45)));
// Timeframe / universe scan ranking score used on the backtest page.
const rankScore = (r: Parameters<typeof scoreProfitFactor>[0] & { totalReturn: number; winRate: number; maxDrawdown: number }) =>
  r.totalReturn + r.winRate * 0.15 + scoreProfitFactor(r) * 8 - r.maxDrawdown * 0.3;

describe('BT-6: profit factor with winners and no losers', () => {
  const allWinners = { profitFactor: null, totalTrades: 10, winningTrades: 10, losingTrades: 0, totalReturn: 12, winRate: 100, maxDrawdown: 4 };
  const losingRun = { profitFactor: 0.6, totalTrades: 10, winningTrades: 3, losingTrades: 7, totalReturn: -8, winRate: 30, maxDrawdown: 12 };

  it('scores no-loss runs at the top of the scale instead of 0', () => {
    expect(hasNoLosses(allWinners)).toBe(true);
    expect(scoreProfitFactor(allWinners)).toBe(PROFIT_FACTOR_SCORE_CAP);
    expect(edgeScore(allWinners)).toBeGreaterThan(edgeScore(losingRun));
    expect(rankScore(allWinners)).toBeGreaterThan(rankScore(losingRun));
    expect(backtestAction(allWinners)).toBe('EXECUTE');
  });

  it('infers no losses on scan rows that only carry totals', () => {
    const row = { profitFactor: null, totalTrades: 6, totalReturn: 5.2 };
    expect(hasNoLosses(row)).toBe(true);
    expect(scoreProfitFactor(row)).toBe(PROFIT_FACTOR_SCORE_CAP);
    expect(formatProfitFactorValue(row)).toBe('∞ (no losses)');
  });

  it('keeps zero-trade and break-even-only runs at 0 (unchanged)', () => {
    const none = { profitFactor: null, totalTrades: 0, totalReturn: 0, maxDrawdown: 0 };
    const flat = { profitFactor: null, totalTrades: 3, winningTrades: 0, losingTrades: 0, totalReturn: 0, maxDrawdown: 0 };
    expect(scoreProfitFactor(none)).toBe(0);
    expect(scoreProfitFactor(flat)).toBe(0);
    expect(backtestAction(none)).toBe('WAIT');
    expect(backtestAction(flat)).toBe('WAIT');
    expect(formatProfitFactorValue(none)).toBe('n/a');
    expect(formatProfitFactorValue(flat)).toBe('n/a');
  });

  it('does not turn a small lucky sample into EXECUTE', () => {
    const twoForTwo = { profitFactor: null, totalTrades: 2, winningTrades: 2, losingTrades: 0, totalReturn: 3, maxDrawdown: 1 };
    expect(scoreProfitFactor(twoForTwo)).toBe(PROFIT_FACTOR_SCORE_CAP);
    expect(backtestAction(twoForTwo)).toBe('PREP');
    expect(isBlockedBySampleSize(twoForTwo)).toBe(true);
    const enough = { ...twoForTwo, totalTrades: MIN_TRADES_FOR_EXECUTE, winningTrades: MIN_TRADES_FOR_EXECUTE };
    expect(backtestAction(enough)).toBe('EXECUTE');
    expect(isBlockedBySampleSize(enough)).toBe(false);
  });

  it('applies the sample rule to numeric profit factors too, and caps them', () => {
    const strongButThin = { profitFactor: 2.4, totalTrades: 5, totalReturn: 6, maxDrawdown: 5 };
    expect(backtestAction(strongButThin)).toBe('PREP');
    expect(backtestAction({ ...strongButThin, totalTrades: 20 })).toBe('EXECUTE');
    expect(backtestAction({ ...strongButThin, totalTrades: 20, maxDrawdown: 25 })).toBe('PREP');
    expect(backtestAction({ profitFactor: 0.8, totalTrades: 20, maxDrawdown: 5 })).toBe('WAIT');
    expect(scoreProfitFactor({ profitFactor: 9, totalTrades: 20 })).toBe(PROFIT_FACTOR_SCORE_CAP);
    expect(scoreProfitFactor({ profitFactor: 1.5, totalTrades: 20 })).toBe(1.5);
    expect(formatProfitFactorValue({ profitFactor: 1.5, totalTrades: 20 })).toBe('1.50');
  });

  it('matches the live SPY RSI example: 1 winning trade is PREP with an insufficient sample, not WAIT', () => {
    const spy = { profitFactor: null, totalTrades: 1, winningTrades: 1, losingTrades: 0, totalReturn: 9.01, winRate: 100, maxDrawdown: 1.3 };
    expect(backtestAction(spy)).toBe('PREP');
    expect(isBlockedBySampleSize(spy)).toBe(true);
    expect(formatProfitFactorValue(spy)).toBe('∞ (no losses)');
  });

  it('the backtest page uses the shared scoring everywhere (no null → 0 local helper)', () => {
    const src = readFileSync(path.join(__dirname, '../app/tools/backtest/page.tsx'), 'utf8');
    expect(src).not.toMatch(/function scoreProfitFactor/);
    expect(src).not.toMatch(/scoreProfitFactor\([a-zA-Z.]*\.profitFactor\)/);
    expect(src).toMatch(/from '@\/lib\/backtest\/profitFactorScore'/);
    expect(src).toMatch(/const action = backtestAction\(results\)/);
    expect(src).toMatch(/INSUFFICIENT SAMPLE/);
  });
});
