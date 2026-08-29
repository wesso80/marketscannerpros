import { describe, it, expect } from 'vitest';
import {
  percentileRank,
  percentileToSigned,
  zScore,
  squashZ,
  computeCompositeV2,
  crossSectionalPercentiles,
  resolveScoreRegime,
  REGIME_WEIGHTS_V2,
  type FactorInput,
} from '@/lib/analysis/scannerScoreV2';

describe('percentileRank', () => {
  it('returns 50 for empty or non-finite', () => {
    expect(percentileRank(5, [])).toBe(50);
    expect(percentileRank(Number.NaN, [1, 2, 3])).toBe(50);
  });
  it('ranks a value within a distribution using midrank', () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBe(50);
    expect(percentileRank(5, [1, 2, 3, 4, 5])).toBe(90);
    expect(percentileRank(1, [1, 2, 3, 4, 5])).toBe(10);
  });
  it('ignores non-finite entries in the distribution', () => {
    expect(percentileRank(2, [1, Number.NaN, 3])).toBe(50);
  });
});

describe('percentileToSigned', () => {
  it('maps 50 to 0 and clamps the ends', () => {
    expect(percentileToSigned(50)).toBe(0);
    expect(percentileToSigned(100)).toBe(1);
    expect(percentileToSigned(0)).toBe(-1);
  });
});

describe('zScore + squashZ', () => {
  it('returns 0 for degenerate samples', () => {
    expect(zScore(5, [5, 5, 5])).toBe(0);
    expect(zScore(5, [5])).toBe(0);
  });
  it('computes a positive z for an above-mean value', () => {
    expect(zScore(15, [0, 5, 10, 15, 20])).toBeGreaterThan(0);
    expect(zScore(5, [0, 5, 10, 15, 20])).toBeLessThan(0);
  });
  it('squashes to [-1, 1]', () => {
    expect(squashZ(10)).toBe(1);
    expect(squashZ(-10)).toBe(-1);
    expect(squashZ(1)).toBe(0.5);
  });
});

const allBullish: FactorInput[] = [
  { factor: 'TREND', signed: 0.8, available: true },
  { factor: 'MOMENTUM', signed: 0.6, available: true },
  { factor: 'VOLUME', signed: 0.5, available: true },
  { factor: 'RELATIVE_STRENGTH', signed: 0.9, available: true },
  { factor: 'VOLATILITY', signed: 0.2, available: true },
  { factor: 'POSITIONING', signed: 0.0, available: true },
  { factor: 'QUALITY', signed: 0.5, available: true },
  { factor: 'CATALYST', signed: 0.0, available: true },
];

describe('computeCompositeV2', () => {
  it('produces a bullish direction and a high composite for aligned bullish factors', () => {
    const r = computeCompositeV2({ factors: allBullish, regime: 'trending', evidenceQuality: 'HIGH' });
    expect(r.direction).toBe('bullish');
    expect(r.composite).toBeGreaterThan(50);
    expect(r.availableFactors).toBe(8);
  });

  it('evidence quality multiplies the headline down', () => {
    const high = computeCompositeV2({ factors: allBullish, regime: 'trending', evidenceQuality: 'HIGH' });
    const insuf = computeCompositeV2({ factors: allBullish, regime: 'trending', evidenceQuality: 'INSUFFICIENT' });
    expect(insuf.composite).toBeLessThan(high.composite);
    expect(insuf.appliedMultiplier).toBeCloseTo(0.45, 5);
  });

  it('stale freshness and thin liquidity reduce the composite', () => {
    const clean = computeCompositeV2({ factors: allBullish, regime: 'trending', evidenceQuality: 'HIGH' });
    const degraded = computeCompositeV2({
      factors: allBullish, regime: 'trending', evidenceQuality: 'HIGH', freshness: 'stale', liquidityMultiplier: 0.6,
    });
    expect(degraded.composite).toBeLessThan(clean.composite);
    expect(degraded.appliedMultiplier).toBeCloseTo(0.75 * 0.6, 5);
  });

  it('redistributes weight across available factors when some are missing', () => {
    const partial: FactorInput[] = [
      { factor: 'TREND', signed: 0.8, available: true },
      { factor: 'RELATIVE_STRENGTH', signed: 0.8, available: true },
      { factor: 'MOMENTUM', signed: 0, available: false },
      { factor: 'VOLUME', signed: 0, available: false },
      { factor: 'VOLATILITY', signed: 0, available: false },
      { factor: 'POSITIONING', signed: 0, available: false },
      { factor: 'QUALITY', signed: 0, available: false },
      { factor: 'CATALYST', signed: 0, available: false },
    ];
    const r = computeCompositeV2({ factors: partial, regime: 'trending', evidenceQuality: 'MEDIUM' });
    const usedWeight = r.contributions.reduce((s, c) => s + c.weight, 0);
    expect(usedWeight).toBeCloseTo(1, 5);
    expect(r.availableFactors).toBe(2);
  });

  it('applies the neutral band', () => {
    const balanced: FactorInput[] = [
      { factor: 'TREND', signed: 0.05, available: true },
      { factor: 'MOMENTUM', signed: -0.05, available: true },
    ];
    const r = computeCompositeV2({ factors: balanced, regime: 'neutral', evidenceQuality: 'HIGH' });
    expect(r.direction).toBe('neutral');
  });

  it('regime changes the weighting: RS-heavy bullish scores higher in trending than ranging', () => {
    const rsHeavy: FactorInput[] = [
      { factor: 'RELATIVE_STRENGTH', signed: 1, available: true },
      { factor: 'TREND', signed: 1, available: true },
      { factor: 'MOMENTUM', signed: 0, available: true },
      { factor: 'VOLATILITY', signed: 0, available: true },
    ];
    const trend = computeCompositeV2({ factors: rsHeavy, regime: 'trending', evidenceQuality: 'HIGH' });
    const range = computeCompositeV2({ factors: rsHeavy, regime: 'ranging', evidenceQuality: 'HIGH' });
    expect(trend.composite).toBeGreaterThan(range.composite);
  });

  it('every regime weight table covers all eight factors', () => {
    for (const key of Object.keys(REGIME_WEIGHTS_V2) as Array<keyof typeof REGIME_WEIGHTS_V2>) {
      const w = REGIME_WEIGHTS_V2[key];
      expect(Object.keys(w)).toHaveLength(8);
      for (const v of Object.values(w)) expect(v).toBeGreaterThan(0);
    }
  });
});

describe('crossSectionalPercentiles', () => {
  it('assigns each entry its percentile within the batch, preserving order', () => {
    const ranked = crossSectionalPercentiles([
      { symbol: 'A', composite: 90 },
      { symbol: 'B', composite: 50 },
      { symbol: 'C', composite: 10 },
    ]);
    expect(ranked.map((r) => r.symbol)).toEqual(['A', 'B', 'C']);
    expect(ranked[0].percentileRank).toBe(83);
    expect(ranked[1].percentileRank).toBe(50);
    expect(ranked[2].percentileRank).toBe(17);
  });
});

describe('resolveScoreRegime', () => {
  it('maps the scoring taxonomy first', () => {
    expect(resolveScoreRegime('TREND_EXPANSION')).toBe('expansion');
    expect(resolveScoreRegime('TREND_MATURE')).toBe('trending');
    expect(resolveScoreRegime('RANGE_COMPRESSION')).toBe('compression');
    expect(resolveScoreRegime('VOL_EXPANSION')).toBe('high_volatility');
    expect(resolveScoreRegime('TRANSITION')).toBe('neutral');
  });
  it('falls back to the institutional taxonomy', () => {
    expect(resolveScoreRegime(undefined, 'trending')).toBe('trending');
    expect(resolveScoreRegime(undefined, 'ranging')).toBe('ranging');
    expect(resolveScoreRegime(undefined, 'high_volatility_chaos')).toBe('high_volatility');
    expect(resolveScoreRegime(undefined, 'unknown')).toBe('neutral');
  });
  it('defaults to neutral for anything unrecognised', () => {
    expect(resolveScoreRegime('WAT', 'nope')).toBe('neutral');
    expect(resolveScoreRegime()).toBe('neutral');
  });
});
