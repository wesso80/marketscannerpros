import { describe, expect, it } from 'vitest';
import { buildBacktestEngineResult, type BacktestTrade } from '../lib/backtest/engine';
import { buildInverseComparisonSnapshot } from '../lib/backtest/inverseComparison';
import { buildBacktestDiagnostics } from '../lib/backtest/diagnostics';
import { buildValidationPayload } from '../lib/backtest/validationPayload';
import { sampledMetric } from '../lib/backtest/displayMetric';

function trade(date: string, pnl: number, percent = pnl / 10): BacktestTrade {
  return { symbol: 'SYNTHETIC', side: 'LONG', entryDate: date, exitDate: date,
    entry: 100, exit: 100 + percent, return: pnl, returnPercent: percent, holdingPeriodDays: 1 };
}

describe('realised backtest balance statistics', () => {
  it('never treats unavailable profit factor as a favourable score', () => {
    const dates = ['2026-01-01', '2026-01-02'];
    const breakeven = buildBacktestEngineResult(Array.from({ length: 10 }, () => trade(dates[1], 0)), dates, 1000);
    const diagnostic = buildBacktestDiagnostics(breakeven, 'bullish', 'daily', 300);
    expect(diagnostic.score).toBe(0);
    expect(diagnostic.verdict).not.toBe('healthy');
    expect(diagnostic.invalidation.reason).toContain('No gains or losses');
    const allWin = buildBacktestEngineResult([trade(dates[1], 10)], dates, 1000);
    expect(buildValidationPayload('ema_crossover', 'bullish', allWin).status).toBe('mixed');
    const extreme = buildBacktestEngineResult([trade(dates[1], 10000)], dates, 1000);
    expect(buildBacktestDiagnostics(extreme, 'bullish', 'daily', 300).verdict).toBe('watch');
  });

  it('includes the initial loss and uses full-sample downside and sample variance', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const result = buildBacktestEngineResult([trade(dates[0], -100), trade(dates[1], 180)], dates, 1000);
    // Independent daily returns: -10%, +20%, 0%; starting capital is 1000.
    const mean = 0.1 / 3;
    const sampleStd = Math.sqrt(((-0.1 - mean) ** 2 + (0.2 - mean) ** 2 + mean ** 2) / 2);
    expect(result.sharpeRatio).toBeCloseTo(mean / sampleStd * Math.sqrt(365.25), 2);
    expect(result.sortinoRatio).toBeCloseTo(mean / Math.sqrt(0.01 / 3) * Math.sqrt(365.25), 2);
    expect(result.volatility).toBeCloseTo(sampleStd * Math.sqrt(365.25) * 100, 2);
    expect(result.maxDrawdown).toBe(10);
    expect(result.totalReturn).toBe(8);
    expect(result.statisticsBasis?.observations).toBe(3);
  });

  it('produces identical annual statistics when idle intraday bars are inserted', () => {
    const dates = ['2026-01-01 16:00:00', '2026-01-02 16:00:00', '2026-01-03 16:00:00'];
    const trades = [trade(dates[0], -100), trade(dates[1], 180)];
    const daily = buildBacktestEngineResult(trades, dates, 1000);
    const dense = buildBacktestEngineResult(trades, dates.flatMap(date => [date.replace('16:', '09:'), date]), 1000);
    for (const key of ['sharpeRatio', 'sortinoRatio', 'volatility', 'cagr', 'calmarRatio'] as const) {
      expect(dense[key]).toBe(daily[key]);
    }
  });

  it('uses elapsed calendar days, including idle weekends, for CAGR', () => {
    const result = buildBacktestEngineResult([trade('2025-12-31', 100)], ['2025-01-01', '2025-12-31'], 1000);
    expect(result.cagr).toBeCloseTo((1.1 ** (365.25 / 365) - 1) * 100, 2);
    expect(result.statisticsBasis?.elapsedDays).toBe(365);
    expect(result.statisticsBasis?.observations).toBe(365);
  });

  it('withholds zero-denominator ratios instead of displaying zero', () => {
    const result = buildBacktestEngineResult([trade('2026-01-01', 100), trade('2026-01-02', 110)], ['2026-01-01', '2026-01-02'], 1000);
    expect(result.sharpeRatio).toBeNull();
    expect(result.sortinoRatio).toBeNull();
    expect(result.calmarRatio).toBeNull();
    expect(result.volatility).toBe(0);
    expect(sampledMetric(result.sharpeRatio, 2)).toBe('Unavailable');
  });

  it('withholds annualised risk for multi-day candles with no daily valuation path', () => {
    const result = buildBacktestEngineResult([trade('2026-01-08', 100)], ['2026-01-01', '2026-01-08'], 1000, { sourceBarMinutes: 10080 });
    expect(result.totalReturn).toBe(10);
    expect(result.cagr).toBeNull();
    expect(result.sharpeRatio).toBeNull();
    expect(result.statisticsBasis?.warnings.join(' ')).toContain('multi-day bars');
  });

  it('keeps a wiped-out balance at zero and withholds annualised statistics', () => {
    const result = buildBacktestEngineResult([trade('2026-01-01', -1000)], ['2026-01-01', '2026-01-02'], 1000);
    expect(result.equityCurve.at(-1)?.equity).toBe(0);
    expect(result.maxDrawdown).toBe(100);
    expect(result.totalReturn).toBe(-100);
    expect(result.cagr).toBeNull();
    expect(result.sharpeRatio).toBeNull();
    expect(result.statisticsBasis?.warnings.join(' ')).toContain('zero or below');
  });

  it('withholds annualisation for a single day and ratios for empty samples', () => {
    const one = buildBacktestEngineResult([trade('2026-01-01', 100)], ['2026-01-01'], 1000);
    const empty = buildBacktestEngineResult([], [], 1000);
    expect(one.cagr).toBeNull();
    expect(one.sharpeRatio).toBeNull();
    expect(empty.profitFactor).toBeNull();
    expect(empty.sortinoRatio).toBeNull();
  });

  it('rejects unreconcilable dates, nonfinite outcomes and invalid capital', () => {
    expect(() => buildBacktestEngineResult([trade('2026-01-02', 10)], ['2026-01-01'], 1000)).toThrow(/missing/);
    expect(() => buildBacktestEngineResult([trade('2026-02-30', 10)], ['2026-02-30'], 1000)).toThrow(/Invalid/);
    expect(() => buildBacktestEngineResult([trade('2026-01-01', NaN)], ['2026-01-01'], 1000)).toThrow(/non-finite/);
    expect(() => buildBacktestEngineResult([], [], 0)).toThrow(/capital/);
    expect(() => buildBacktestEngineResult([trade('2026-01-01', 10)], ['2026-01-01', '2026-01-01'], 1000)).toThrow(/duplicated/);
  });

  it('sorts the timeline and counts each closing outcome once', () => {
    const result = buildBacktestEngineResult([trade('2026-01-01', -100), trade('2026-01-02', 200)], ['2026-01-02', '2026-01-01'], 1000);
    expect(result.equityCurve.map(point => point.equity)).toEqual([900, 1100]);
    expect(result.totalReturn).toBe(10);
  });
});

describe('resampled and mirrored P&L scenarios', () => {
  it('produces a reproducible distribution of endings, rather than a shuffle invariant', () => {
    const dates = Array.from({ length: 8 }, (_, i) => `2026-01-0${i + 1}`);
    const trades = dates.map((date, i) => trade(date, i % 2 ? -80 : 100));
    const first = buildBacktestEngineResult(trades, dates, 1000).monteCarlo!;
    const second = buildBacktestEngineResult(trades, dates, 1000).monteCarlo!;
    expect(first).toEqual(second);
    expect(first.method).toBe('iid_dollar_bootstrap');
    expect(first.p5Return).toBeLessThan(first.medianReturn);
    expect(first.medianReturn).toBeLessThan(first.p95Return);
    // 8 draws from {-80, 100}: outcomes must remain inside this support.
    expect(first.p5Return).toBeGreaterThanOrEqual(-64);
    expect(first.p95Return).toBeLessThanOrEqual(80);
  });

  it('mirrors dollars on the original capital without compounding position percentages', () => {
    const base = buildBacktestEngineResult([trade('2026-01-01', 500, 50), trade('2026-01-02', -200, -20)], ['2026-01-01', '2026-01-02'], 10000);
    const snapshot = buildInverseComparisonSnapshot(base)!;
    expect(base.totalReturn).toBe(3);
    expect(snapshot.inverse.totalReturn).toBe(-3);
    expect(snapshot.inverse.equityCurve.map(point => point.equity)).toEqual([9500, 9700]);
    expect(snapshot.inverse.avgWin).toBe(200);
    expect(snapshot.inverse.avgLoss).toBe(-500);
    expect(snapshot.inverse.maxDrawdown).toBe(5);
    expect(snapshot.inverse.monteCarlo).toBeUndefined();
    expect(snapshot.inverse.kelly).toBeUndefined();
  });

  it('keeps unavailable profit-factor deltas unavailable', () => {
    const base = buildBacktestEngineResult([trade('2026-01-01', 100)], ['2026-01-01'], 1000);
    expect(buildInverseComparisonSnapshot(base)?.delta.profitFactor).toBeNull();
    expect(buildInverseComparisonSnapshot({ ...base, initialCapital: undefined })).toBeNull();
  });
});
