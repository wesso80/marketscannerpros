import { describe, expect, it } from 'vitest';
import { computeRegimeScore, estimateComponentsWithAvailability } from '@/lib/ai/regimeScoring';
import { classifyRegime, volatilityThresholds } from '@/lib/regime-classifier';

describe('regime components: availability instead of defaults', () => {
  it('marks components with no real input as unavailable', () => {
    const { unavailable } = estimateComponentsWithAvailability({ scannerScore: 60, rsi: 58, adx: 30 });
    expect(unavailable.sort()).toEqual(['FD', 'LL', 'MTF', 'VA']);
    const full = estimateComponentsWithAvailability({
      scannerScore: 60, rsi: 58, volumeRatio: 1.2, session: 'regular', mtfAlignment: 4, derivativesAvailable: true,
    });
    expect(full.unavailable).toEqual([]);
    expect(estimateComponentsWithAvailability({}).unavailable.sort()).toEqual(['FD', 'LL', 'MTF', 'SQ', 'TA', 'VA']);
    expect(estimateComponentsWithAvailability({ volumeRatio: Number.NaN }).unavailable).toContain('VA');
  });

  it('a default can neither pass nor fail a gate', () => {
    // TREND_MATURE gates VA ≥ 40 and FD ≥ 35. With no volume input VA used to sit at 50 (always passing).
    const lowVol = estimateComponentsWithAvailability({ scannerScore: 60, rsi: 40, adx: 30, volumeRatio: 0.4 });
    const gatedOnReal = computeRegimeScore(lowVol.components, 'VOL_EXPANSION', { unavailable: lowVol.unavailable });
    expect(gatedOnReal.gateViolations).toEqual([]); // LL and FD unavailable → VOL_EXPANSION gates not applied
    expect(gatedOnReal.unavailableComponents.sort()).toEqual(['FD', 'LL', 'MTF']);

    const components = { SQ: 60, TA: 60, VA: 20, LL: 70, MTF: 60, FD: 45 };
    expect(computeRegimeScore(components, 'TREND_MATURE').gateViolations.some((g) => g.startsWith('VA'))).toBe(true);
    expect(computeRegimeScore(components, 'TREND_MATURE', { unavailable: ['VA'] }).gateViolations).toEqual([]);
  });

  it('renormalises weights over available components', () => {
    const components = { SQ: 80, TA: 80, VA: 50, LL: 70, MTF: 60, FD: 45 };
    const r = computeRegimeScore(components, 'TREND_EXPANSION', { unavailable: ['VA', 'LL', 'MTF', 'FD'] });
    expect(r.weights.VA).toBe(0);
    expect(r.weights.SQ + r.weights.TA).toBeCloseTo(1, 3);
    // Only SQ and TA (both 80) count → the linear score is 80, not dragged toward the defaults.
    expect(r.weightedScore).toBeGreaterThan(80);
    const legacy = computeRegimeScore(components, 'TREND_EXPANSION');
    expect(legacy.unavailableComponents).toEqual([]);
    expect(legacy.weights).toEqual({ SQ: 0.10, TA: 0.35, VA: 0.10, LL: 0.05, MTF: 0.30, FD: 0.10 });
  });
});

describe('classifyRegime volatility thresholds by asset class', () => {
  it('keeps equity thresholds, gives crypto its own', () => {
    expect(volatilityThresholds('equity')).toEqual({ compressed: 1.5, expanded: 4, extreme: 7 });
    expect(volatilityThresholds(undefined)).toEqual(volatilityThresholds('equity'));
    const base = { adx: 20, rsi: 50 }; // neither trending (≥ 22) nor ranging (≤ 18)
    expect(classifyRegime({ ...base, atrPercent: 5 }).governor).toBe('VOL_EXPANSION');
    expect(classifyRegime({ ...base, atrPercent: 5, assetClass: 'crypto' }).governor).not.toBe('VOL_EXPANSION');
    expect(classifyRegime({ ...base, atrPercent: 8, assetClass: 'crypto' }).governor).toBe('VOL_EXPANSION');
    expect(classifyRegime({ ...base, atrPercent: 11, assetClass: 'crypto' }).institutional).toBe('high_volatility_chaos');
  });

  it('an ATR percentile replaces the absolute thresholds', () => {
    const base = { adx: 20, rsi: 50, atrPercent: 9, assetClass: 'crypto' as const };
    expect(classifyRegime({ ...base, atrPercentile: 50 }).governor).not.toBe('VOL_EXPANSION');
    expect(classifyRegime({ ...base, atrPercent: 2, assetClass: 'equity', atrPercentile: 95 }).governor).toBe('VOL_EXPANSION');
  });
});
