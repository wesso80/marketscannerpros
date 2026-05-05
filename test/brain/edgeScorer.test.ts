/**
 * Phase 10 — Edge scorer / sample-size discipline tests
 *
 * Properties covered:
 *   - sample size penalty works (monotone non-decreasing)
 *   - low sample size cannot create high confidence (tier ≤ emerging, label ≤ medium)
 *   - high win-rate over tiny sample is dominated by Wilson lower bound
 */

import { describe, it, expect } from 'vitest';

vi.mock('@/lib/db', () => ({ q: vi.fn() }));

import { vi } from 'vitest';
import {
  sampleSizePenalty,
  wilsonLowerBound,
  scoreEdge,
  type EdgeScoreInputs,
} from '../../lib/brain/edgeScorer';

function fakeOutcomes(
  total: number,
  winRate: number,
  asOf = new Date('2026-04-15T00:00:00Z'),
): EdgeScoreInputs['outcomes'] {
  const out: EdgeScoreInputs['outcomes'] = [];
  const wins = Math.round(total * winRate);
  for (let i = 0; i < total; i++) {
    out.push({
      outcomeClass: i < wins ? 'confirmed_followed_through' : 'failed_before_confirmation',
      mfePct: i < wins ? 2 : 0,
      maePct: i < wins ? 0 : -1,
      asOfTs: asOf,
    });
  }
  return out;
}

describe('sampleSizePenalty', () => {
  it('returns 0 for n=0', () => {
    expect(sampleSizePenalty(0)).toBe(0);
  });
  it('is strictly increasing across the typical range', () => {
    const values = [5, 10, 30, 60, 100, 200].map(sampleSizePenalty);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });
  it('penalises tiny samples (n=5 < 0.4) and approaches 1 by n=200', () => {
    expect(sampleSizePenalty(5)).toBeLessThan(0.4);
    expect(sampleSizePenalty(200)).toBeGreaterThan(0.95);
  });
});

describe('wilsonLowerBound — tiny sample punishment', () => {
  it('5/5 wins yields a much lower bound than 80/100 wins', () => {
    const tiny = wilsonLowerBound(5, 5);
    const big = wilsonLowerBound(80, 100);
    expect(tiny).toBeLessThan(big);
  });
});

describe('scoreEdge — low N cannot produce high confidence', () => {
  const baseline: EdgeScoreInputs = {
    workspaceId: 'ws-1',
    setupKey: 'setup_by_regime|setup=breakout|regime=trending',
    horizon: '1d',
    windowStart: new Date('2026-01-01T00:00:00Z'),
    windowEnd: new Date('2026-04-15T00:00:00Z'),
    outcomes: [],
  };

  it('returns insufficient_sample tier when N < 10', () => {
    const r = scoreEdge({ ...baseline, outcomes: fakeOutcomes(5, 1.0) });
    expect(r.edgeTier).toBe('insufficient_sample');
    expect(r.confidenceLabel).not.toBe('high');
  });

  it('100% win rate over N=8 cannot reach elite tier', () => {
    const r = scoreEdge({ ...baseline, outcomes: fakeOutcomes(8, 1.0) });
    expect(r.edgeTier).not.toBe('elite');
    expect(r.edgeTier).not.toBe('strong');
    expect(r.confidenceLabel).not.toBe('high');
  });

  it('70% win rate over N=15 cannot reach strong/elite', () => {
    const r = scoreEdge({ ...baseline, outcomes: fakeOutcomes(15, 0.7) });
    expect(['emerging', 'weak', 'noise', 'insufficient_sample']).toContain(r.edgeTier);
  });

  it('60% win rate over N=120 can reach strong/elite', () => {
    const r = scoreEdge({ ...baseline, outcomes: fakeOutcomes(120, 0.6) });
    expect(['strong', 'elite']).toContain(r.edgeTier);
  });
});

describe('scoreEdge — overfitting penalty for narrow signatures', () => {
  it('penalty rises with conditioningDimensions on a small sample', () => {
    const base: EdgeScoreInputs = {
      workspaceId: 'ws-1',
      setupKey: 'setup_by_regime|setup=foo',
      horizon: '1d',
      windowStart: new Date('2026-01-01T00:00:00Z'),
      windowEnd: new Date('2026-04-15T00:00:00Z'),
      outcomes: fakeOutcomes(20, 0.7),
    };
    const wide = scoreEdge({ ...base, conditioningDimensions: 1 });
    const narrow = scoreEdge({ ...base, conditioningDimensions: 6 });
    expect(narrow.overfittingPenalty).toBeGreaterThan(wide.overfittingPenalty);
    expect(narrow.edgeScore).toBeLessThan(wide.edgeScore);
  });
});

describe('scoreEdge — stale/missing data penalises', () => {
  const base: EdgeScoreInputs = {
    workspaceId: 'ws-1',
    setupKey: 'setup_by_regime|setup=foo',
    horizon: '1d',
    windowStart: new Date('2026-01-01T00:00:00Z'),
    windowEnd: new Date('2026-04-15T00:00:00Z'),
    outcomes: fakeOutcomes(50, 0.6),
  };

  it('stale outcomes reduce edge score', () => {
    const clean = scoreEdge(base);
    const stale = scoreEdge({
      ...base,
      outcomes: base.outcomes.map((o) => ({ ...o, staleDataCount: 5 })),
    });
    expect(stale.edgeScore).toBeLessThan(clean.edgeScore);
    expect(stale.staleDataPenalty).toBeGreaterThan(0);
  });

  it('missing-data outcomes reduce edge score', () => {
    const clean = scoreEdge(base);
    const missing = scoreEdge({
      ...base,
      outcomes: base.outcomes.map((o) => ({ ...o, missingDataCount: 5 })),
    });
    expect(missing.edgeScore).toBeLessThan(clean.edgeScore);
    expect(missing.missingDataPenalty).toBeGreaterThan(0);
  });
});
