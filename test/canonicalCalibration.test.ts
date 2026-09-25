import { describe, expect, it } from 'vitest';
import { CALIBRATION, CALIBRATION_META } from '@/lib/scoring/canonical/calibrationData';
import { calibrateCandidate, calibrationCell, isCalibratedContext, percentileIn } from '@/lib/scoring/canonical';

describe('canonical calibration table', () => {
  it('covers every setup × direction for equity and crypto, with no validated edge (Phase 3 result)', () => {
    for (const a of ['equity', 'crypto'] as const) {
      for (const s of ['TREND_CONTINUATION', 'PULLBACK', 'SQUEEZE', 'EXHAUSTION_FADE']) {
        for (const d of ['long', 'short']) {
          const b = CALIBRATION[a].buckets[`${s}:${d}`];
          expect(b, `${a} ${s} ${d}`).toBeDefined();
          expect(b.passValidated).toBe(false);
          expect(b.cells.length).toBeGreaterThan(0);
          for (const c of b.cells) { expect(c.pHit).toBeGreaterThan(0); expect(c.pHit).toBeLessThan(1); }
        }
      }
      for (const d of ['long', 'short'] as const) {
        const ref = CALIBRATION[a].reference[d];
        expect(ref).toHaveLength(21);
        for (let i = 1; i < ref.length; i++) expect(ref[i]).toBeGreaterThanOrEqual(ref[i - 1]);
      }
    }
    expect(CALIBRATION_META.horizonBars).toBe(20);
  });

  it('percentileIn is monotone and bounded', () => {
    const ref = Array.from({ length: 21 }, (_, i) => i / 10 - 1);
    expect(percentileIn(ref, -5)).toBe(0);
    expect(percentileIn(ref, 5)).toBe(100);
    expect(percentileIn(ref, 0)).toBeCloseTo(50, 6);
    expect(percentileIn(ref, 0.05)).toBeCloseTo(52.5, 6);
    expect(percentileIn([0, 0, 0, 1, 2], 0)).toBeCloseTo(25, 6); // ties → midpoint
    let prev = -1;
    for (let v = -1.2; v <= 1.2; v += 0.01) { const p = percentileIn(ref, v); expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
  });

  it('cells are picked by reward:risk band; lower R:R has a higher target-first rate', () => {
    const cells = CALIBRATION.equity.buckets['TREND_CONTINUATION:long'].cells;
    expect(calibrationCell(cells, 0.5)).toBe(cells[0]);
    expect(calibrationCell(cells, 99)).toBe(cells[cells.length - 1]);
    expect(cells[0].pHit).toBeGreaterThan(cells[cells.length - 1].pHit);
  });

  it('only daily bars-mode equity/crypto is calibrated; longs and shorts use the same rule', () => {
    expect(isCalibratedContext('equity', 'daily', 'bars')).toBe(true);
    expect(isCalibratedContext('crypto', '1d', 'bars')).toBe(true);
    expect(isCalibratedContext('equity', '1h', 'bars')).toBe(false);
    expect(isCalibratedContext('equity', 'weekly', 'bars')).toBe(false);
    expect(isCalibratedContext('forex', 'daily', 'bars')).toBe(false);
    expect(isCalibratedContext('equity', 'daily', 'snapshot')).toBe(false);
    const l = calibrateCandidate('equity', 'daily', 'bars', 'PULLBACK', 'long', 1.2)!;
    const s = calibrateCandidate('equity', 'daily', 'bars', 'PULLBACK', 'short', 1.2)!;
    for (const c of [l, s]) {
      expect(c.validatedEdge).toBe(false);
      expect(c.percentile).toBeGreaterThanOrEqual(0);
      expect(c.percentile).toBeLessThanOrEqual(100);
      expect(c.costsBps).toBe(10);
    }
    expect(calibrateCandidate('crypto', 'daily', 'bars', 'PULLBACK', 'long', 1.2)!.costsBps).toBe(25);
  });
});
