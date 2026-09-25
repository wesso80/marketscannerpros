import { describe, expect, it } from 'vitest';
import { CANONICAL_THRESHOLDS, SETUP_TYPES, computeFeatures, evaluateCanonical, type CanonicalBar } from '@/lib/scoring/canonical';

const bars: CanonicalBar[] = Array.from({ length: 420 }, (_, i) => {
  const c = 100 * (1 + 0.0015 * i + 0.03 * Math.sin(i / 9));
  return { t: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(), open: c * 0.998, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 };
});
const features = computeFeatures(bars);

describe('factor-score thresholds (uncalibrated contexts only)', () => {
  it('are ordered watch < pass ≤ A and watch ≤ B ≤ A for every setup', () => {
    for (const s of SETUP_TYPES) {
      const t = CANONICAL_THRESHOLDS[s];
      expect(t.watch).toBeLessThan(t.pass);
      expect(t.pass).toBeLessThanOrEqual(t.gradeA);
      expect(t.watch).toBeLessThanOrEqual(t.gradeB);
      expect(t.gradeB).toBeLessThanOrEqual(t.gradeA);
    }
  });

  it('set the grade of an uncalibrated result but never BLOCK on score; the result is labelled UNCALIBRATED', () => {
    const at = (t?: { pass: number; watch: number; gradeA: number; gradeB: number }) => {
      const base = evaluateCanonical({ symbol: 'X', assetClass: 'equity', timeframe: '1h', features });
      return t ? evaluateCanonical({ symbol: 'X', assetClass: 'equity', timeframe: '1h', features, thresholds: { [base.setupType]: t } }) : base;
    };
    const base = at();
    expect(base.setupType).not.toBe('NONE');
    expect(base.scoreBasis).toBe('factor_alignment_uncalibrated');
    expect(base.calibration).toBeNull();
    expect(base.score).toBe(base.factorScore);
    expect(base.watchReasons[0].code).toBe('UNCALIBRATED');
    const s = base.factorScore;
    const low = at({ pass: s + 10, watch: s + 1, gradeA: s + 20, gradeB: s + 15 });
    expect(low.permission).toBe('WATCH');
    expect(low.grade).toBe('C');
    expect(low.blockReasons.map((r) => r.code)).not.toContain('SCORE_BELOW_WATCH');
    expect(at({ pass: s, watch: s - 5, gradeA: s + 5, gradeB: s }).grade).toBe('B');
    expect(at({ pass: s, watch: s - 5, gradeA: s, gradeB: s - 5 }).grade).toBe('A');
  });
});

describe('calibrated context (daily equity/crypto bars)', () => {
  it('never PASSes without a validated edge; score is the calibrated percentile and grade follows it', () => {
    for (const assetClass of ['equity', 'crypto'] as const) {
      const r = evaluateCanonical({ symbol: 'X', assetClass, timeframe: 'daily', features });
      expect(r.setupType).not.toBe('NONE');
      expect(r.permission).toBe('WATCH');
      expect(r.scoreBasis).toBe('calibrated_expectancy_percentile');
      expect(r.calibration).not.toBeNull();
      expect(r.calibration!.validatedEdge).toBe(false);
      expect(r.watchReasons[0].code).toBe('NO_VALIDATED_EDGE');
      expect(r.score).toBe(Math.round(r.calibration!.percentile));
      const lowRR = r.watchReasons.some((x) => x.code === 'RR_BELOW_MIN');
      expect(r.grade).toBe(lowRR ? 'C' : r.calibration!.percentile >= 85 ? 'A' : r.calibration!.percentile >= 60 ? 'B' : 'C');
      expect(r.calibration!.pTargetFirst).toBeGreaterThan(0);
      expect(r.calibration!.pTargetFirst).toBeLessThan(1);
      expect(r.calibration!.horizonBars).toBe(20);
      expect(r.thresholds).toBeNull();
      const elig = r.candidates.filter((c) => c.eligible && c.expectedR !== undefined);
      expect(elig[0].setupType).toBe(r.setupType);
    }
  });

  it('forex and snapshot mode are uncalibrated', () => {
    expect(evaluateCanonical({ symbol: 'EURUSD', assetClass: 'forex', timeframe: 'daily', features }).scoreBasis).toBe('factor_alignment_uncalibrated');
    expect(evaluateCanonical({ symbol: 'X', assetClass: 'equity', timeframe: 'daily', features: { ...features, mode: 'snapshot' } }).calibration).toBeNull();
  });
});

describe('minimum reward:risk in calibrated ranking', () => {
  it('prefers an eligible candidate meeting the minimum R:R and never grades a below-minimum pick above C', async () => {
    const { evaluateSetup, SETUP_TYPES, CANONICAL_MIN_RR } = await import('@/lib/scoring/canonical');
    let checked = 0;
    for (let k = 0; k < 60; k++) {
      const b: CanonicalBar[] = Array.from({ length: 420 }, (_, i) => {
        const c = 100 * (1 + (k % 3 - 1) * 0.001 * i + 0.04 * Math.sin(i / (5 + (k % 7))) + 0.02 * Math.sin(i / 23 + k));
        return { t: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(), open: c * 0.997, high: c * 1.012, low: c * 0.988, close: c, volume: 1e6 * (1 + (i % 5) / 10) };
      });
      const f = computeFeatures(b);
      const r = evaluateCanonical({ symbol: 'X', assetClass: 'equity', timeframe: 'daily', features: f });
      if (r.permission === 'BLOCK') continue;
      const anyMeets = SETUP_TYPES.some((s) => (['long', 'short'] as const).some((d) => {
        const c = evaluateSetup(f, s, d);
        return c.eligible && (c.levels.targetBasis === 'projected' || c.levels.riskReward >= CANONICAL_MIN_RR);
      }));
      const lowRR = r.watchReasons.some((x) => x.code === 'RR_BELOW_MIN');
      if (anyMeets && !r.watchReasons.some((x) => x.code === 'DIRECTION_UNRESOLVED')) expect(lowRR).toBe(false);
      if (lowRR) expect(r.grade).toBe('C');
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });
});
