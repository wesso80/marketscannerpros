import { describe, expect, it } from 'vitest';
import { buildBacktestEngineResult, type BacktestEngineResult, type BacktestTrade } from '../lib/backtest/engine';
import { buildBacktestDiagnostics } from '../lib/backtest/diagnostics';
import { buildValidationPayload } from '../lib/backtest/validationPayload';
import { assessBacktestEdge } from '../lib/backtest/edgeAssessment';
import { PROFIT_FACTOR_SCORE_CAP } from '../lib/backtest/profitFactorScore';

function result(overrides: Partial<BacktestEngineResult>): BacktestEngineResult {
  const base = buildBacktestEngineResult([], ['2026-01-01'], 10000);
  return { ...base, ...overrides };
}

function trade(date: string, pnl: number): BacktestTrade {
  return { symbol: 'SPY', side: 'LONG', entryDate: date, exitDate: date,
    entry: 100, exit: 100 + pnl / 10, return: pnl, returnPercent: pnl / 10, holdingPeriodDays: 1 };
}

describe('BT-7: one invalidation rule for the badge and the diagnostics panel', () => {
  // Live example: EMA 9/21 SPY daily, +3.5%, PF 1.86, WR 28.6% (2 of 7) showed "Invalidated" next to "70/100 healthy".
  const emaSpy = result({ totalTrades: 7, winningTrades: 2, losingTrades: 5, winRate: 28.6, totalReturn: 3.5, profitFactor: 1.86, maxDrawdown: 5.9 });

  it('a low win rate with a positive return and PF > 1 is flagged, not invalidated', () => {
    const validation = buildValidationPayload('ema_crossover', 'bullish', emaSpy);
    const diagnostics = buildBacktestDiagnostics(emaSpy, 'bullish', 'daily', 250);
    expect(validation.status).toBe('mixed');
    expect(validation.reason).toContain('low win rate');
    expect(validation.suggestedAlternatives).toBeUndefined();
    expect(diagnostics.invalidation.status).toBe('watch');
    expect(diagnostics.verdict).not.toBe('invalidated');
    expect(diagnostics.failureTags).toContain('low_win_rate');
  });

  it('with a large enough sample the same stats are healthy and the badge stays mixed (flag), never invalidated', () => {
    const bigger = { ...emaSpy, totalTrades: 21, winningTrades: 6, losingTrades: 15 };
    const diagnostics = buildBacktestDiagnostics(bigger, 'bullish', 'daily', 250);
    expect(diagnostics.score).toBeGreaterThanOrEqual(60);
    expect(diagnostics.verdict).toBe('healthy');
    expect(buildValidationPayload('ema_crossover', 'bullish', bigger).status).toBe('mixed');
  });

  it('invalidated only when return < 0 and PF < 1, in both places, for every direction', () => {
    const losing = result({ totalTrades: 20, winningTrades: 8, losingTrades: 12, winRate: 40, totalReturn: -6, profitFactor: 0.7, maxDrawdown: 9 });
    for (const dir of ['bullish', 'bearish', 'both'] as const) {
      expect(buildValidationPayload('ema_crossover', dir, losing).status).toBe('invalidated');
      const d = buildBacktestDiagnostics(losing, dir, 'daily', 250);
      expect(d.invalidation.status).toBe('invalidated');
      expect(d.verdict).toBe('invalidated');
      expect(d.invalidation.rule).toContain('return < 0% and profit factor < 1.00');
    }
    // Negative return but PF >= 1, or positive return with PF < 1: a flag, not invalidation.
    const pfOk = { ...losing, profitFactor: 1.05 };
    const retOk = { ...losing, totalReturn: 0.4 };
    for (const r of [pfOk, retOk]) {
      expect(buildValidationPayload('ema_crossover', 'bullish', r).status).toBe('mixed');
      expect(buildBacktestDiagnostics(r, 'bullish', 'daily', 250).invalidation.status).toBe('watch');
    }
  });

  it('badge and diagnostics always agree on invalidated vs not', () => {
    const cases = [
      { winRate: 20, totalReturn: 5, profitFactor: 2 },
      { winRate: 60, totalReturn: -1, profitFactor: 0.9 },
      { winRate: 35, totalReturn: -2, profitFactor: 1.1 },
      { winRate: 55, totalReturn: 8, profitFactor: 1.6 },
      { winRate: 0, totalReturn: 0, profitFactor: null },
    ];
    for (const c of cases) {
      const r = result({ totalTrades: 12, winningTrades: 6, losingTrades: 6, maxDrawdown: 4, ...c });
      const v = buildValidationPayload('x', 'bullish', r).status;
      const d = buildBacktestDiagnostics(r, 'bullish', 'daily', 250).invalidation.status;
      expect(v === 'invalidated').toBe(d === 'invalidated');
      expect(v === 'validated').toBe(d === 'valid');
    }
  });

  it('a clean run is validated and valid', () => {
    const clean = result({ totalTrades: 30, winningTrades: 17, losingTrades: 13, winRate: 56.7, totalReturn: 12, profitFactor: 1.7, maxDrawdown: 6 });
    expect(buildValidationPayload('x', 'bullish', clean).status).toBe('validated');
    const d = buildBacktestDiagnostics(clean, 'bullish', 'daily', 250);
    expect(d.invalidation.status).toBe('valid');
    expect(d.verdict).toBe('healthy');
  });
});

describe('BT-6: winners and no losers score as the best profit factor', () => {
  const dates = ['2026-01-01', '2026-01-02'];

  it('RSI SPY live example: 1 trade, 100% WR, +9% no longer scores PF as 0, and keeps the low-sample warning', () => {
    const spy = buildBacktestEngineResult([trade(dates[1], 901)], dates, 10000);
    expect(spy.profitFactor).toBeNull();
    expect(assessBacktestEdge(spy).profitFactorScore).toBe(PROFIT_FACTOR_SCORE_CAP);
    const d = buildBacktestDiagnostics(spy, 'bullish', 'daily', 250);
    expect(d.score).toBeGreaterThan(37);
    expect(d.failureTags).toContain('low_sample_size');
    expect(d.verdict).toBe('watch'); // one trade is not a healthy edge
    expect(d.summary).toContain('only 1 trade');
    expect(d.invalidation.reason).toContain('∞');
    const v = buildValidationPayload('rsi_reversal', 'bullish', spy);
    expect(v.status).toBe('mixed');
    expect(v.reason).toContain('small sample');
    expect(v.reason).toContain('∞ (no losses)');
  });

  it('an all-winner run with a real sample can be healthy and validated (healthy no longer needs a numeric PF)', () => {
    const wins = buildBacktestEngineResult(Array.from({ length: 10 }, (_, i) => trade(dates[1], 50 + i)), dates, 10000);
    expect(wins.profitFactor).toBeNull();
    const d = buildBacktestDiagnostics(wins, 'bullish', 'daily', 250);
    expect(d.verdict).toBe('healthy');
    expect(d.invalidation.status).toBe('valid');
    expect(buildValidationPayload('x', 'bullish', wins).status).toBe('validated');
  });

  it('break-even-only and zero-trade runs still score PF 0', () => {
    const flat = buildBacktestEngineResult(Array.from({ length: 10 }, () => trade(dates[1], 0)), dates, 10000);
    expect(buildBacktestDiagnostics(flat, 'bullish', 'daily', 250).score).toBe(0);
    const none = buildBacktestEngineResult([], dates, 10000);
    expect(buildValidationPayload('x', 'bullish', none).status).toBe('mixed');
    expect(buildBacktestDiagnostics(none, 'bullish', 'daily', 0).verdict).toBe('watch');
  });
});
