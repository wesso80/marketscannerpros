import { describe, expect, it } from 'vitest';
import { CANONICAL_THRESHOLDS, SETUP_TYPES, computeFeatures, evaluateCanonical, type CanonicalBar } from '@/lib/scoring/canonical';

describe('canonical thresholds (provisional, distribution-calibrated)', () => {
  it('are ordered watch < pass ≤ A and watch ≤ B ≤ A for every setup', () => {
    for (const s of SETUP_TYPES) {
      const t = CANONICAL_THRESHOLDS[s];
      expect(t.watch).toBeLessThan(t.pass);
      expect(t.pass).toBeLessThanOrEqual(t.gradeA);
      expect(t.watch).toBeLessThanOrEqual(t.gradeB);
      expect(t.gradeB).toBeLessThanOrEqual(t.gradeA);
    }
  });

  it('maps score bands to BLOCK / WATCH / PASS and grades', () => {
    const bars: CanonicalBar[] = Array.from({ length: 420 }, (_, i) => {
      const c = 100 * (1 + 0.0015 * i + 0.03 * Math.sin(i / 9));
      return { t: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(), open: c * 0.998, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 };
    });
    const features = computeFeatures(bars);
    const base = evaluateCanonical({ symbol: 'X', assetClass: 'equity', timeframe: 'daily', features });
    expect(base.setupType).not.toBe('NONE');
    if (base.setupType === 'NONE') return;
    const s = base.score;
    const at = (t: { pass: number; watch: number; gradeA: number; gradeB: number }) =>
      evaluateCanonical({ symbol: 'X', assetClass: 'equity', timeframe: 'daily', features, thresholds: { [base.setupType]: t } });
    const below = at({ pass: s + 10, watch: s + 1, gradeA: s + 20, gradeB: s + 15 });
    expect(below.permission).toBe('BLOCK');
    expect(below.grade).toBe('F');
    expect(below.blockReasons.map((r) => r.code)).toContain('SCORE_BELOW_WATCH');
    const mid = at({ pass: s + 1, watch: s, gradeA: s + 5, gradeB: s });
    expect(mid.permission).toBe('WATCH');
    expect(mid.watchReasons[0].code).toBe('SCORE_BELOW_PASS');
    expect(mid.grade).toBe('B');
    const top = at({ pass: s, watch: s - 5, gradeA: s, gradeB: s - 5 });
    expect(top.grade).toBe('A');
    expect(['PASS', 'WATCH']).toContain(top.permission); // WATCH only through a cap (R:R, volatility, …)
  });
});
