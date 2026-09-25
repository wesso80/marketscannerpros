/**
 * Phase 1 · PR-3 — regime checks and funding are mirror-symmetric.
 */
import { describe, expect, it } from 'vitest';
import { computeRegimeScore, estimateComponentsFromContext } from '@/lib/ai/regimeScoring';
import { computeQuickScore } from '@/lib/scanner/topCachedScore';
import { computeScannerDerivativesContribution } from '@/lib/scanner/scoring';

describe('regime TA estimate is direction-aware', () => {
  const ctx = { scannerScore: 50, adx: 28, session: 'regular' };
  it('a bearish setup with RSI 40 / CCI −60 gets the same TA as the bullish RSI 60 / CCI +60 mirror', () => {
    const bull = estimateComponentsFromContext({ ...ctx, rsi: 60, cci: 60, direction: 'bullish' });
    const bear = estimateComponentsFromContext({ ...ctx, rsi: 40, cci: -60, direction: 'bearish' });
    expect(bear.TA).toBe(bull.TA);
    expect(bull.TA).toBe(80); // 50 + RSI 15 + ADX 10 + CCI 5
    expect(computeRegimeScore(bear, 'TREND_EXPANSION', { ignoreGates: ['SQ'] }).gated)
      .toBe(computeRegimeScore(bull, 'TREND_EXPANSION', { ignoreGates: ['SQ'] }).gated);
  });
  it('momentum AGAINST the setup side is penalised on both sides equally', () => {
    const longAgainst = estimateComponentsFromContext({ ...ctx, rsi: 40, direction: 'bullish' });
    const shortAgainst = estimateComponentsFromContext({ ...ctx, rsi: 60, direction: 'bearish' });
    expect(longAgainst.TA).toBe(shortAgainst.TA);
    expect(longAgainst.TA).toBeLessThan(50 + 10);
  });
  it('without an explicit direction the RSI side is used, so the estimate is still symmetric', () => {
    expect(estimateComponentsFromContext({ ...ctx, rsi: 35, cci: -120 }).TA)
      .toBe(estimateComponentsFromContext({ ...ctx, rsi: 65, cci: 120 }).TA);
  });
});

describe('top-cached quick score', () => {
  const up = { rsi14: 62, macd_hist: 0.4, adx14: 30, price: 110, ema200: 100, stoch_k: 70, change_percent: 1.2 };
  const down = { rsi14: 38, macd_hist: -0.4, adx14: 30, price: 90, ema200: 100, stoch_k: 30, change_percent: -1.2 };
  it('scores a clean downtrend as strongly as the mirrored uptrend (so shorts can reach the top list)', () => {
    const a = computeQuickScore(up), b = computeQuickScore(down);
    expect(a.direction).toBe('bullish');
    expect(b.direction).toBe('bearish');
    expect(b.score).toBe(a.score);
    expect(a.score).toBe(100);
  });
  it('missing indicators are skipped, not read as 0 (RSI 0 used to count as an oversold bounce)', () => {
    expect(computeQuickScore({ price: 100 })).toEqual({ score: 50, direction: 'neutral' });
  });
});

describe('scanner derivatives contribution funding', () => {
  it('normal positive funding is neutral (was a bullish vote)', () => {
    const c = computeScannerDerivativesContribution({ expected: true, fundingRate: 0.03 });
    expect(c.bullishSignal).toBe(0);
    expect(c.bearishSignal).toBe(0);
  });
  it('extremes are contrarian and mirrored', () => {
    expect(computeScannerDerivativesContribution({ expected: true, fundingRate: 0.07 }).bearishSignal).toBe(0.8);
    expect(computeScannerDerivativesContribution({ expected: true, fundingRate: -0.07 }).bullishSignal).toBe(0.8);
  });
});
