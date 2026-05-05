/**
 * Phase 10 — Final Edge Score (Phase 3 quant formula) tests
 *
 * Properties covered:
 *   - missing options data reduces evidence quality (and final score)
 *   - unknown regime reduces score
 *   - edge score changes when regime changes
 *   - overfitting penalty applies to narrow setup signatures
 *   - stale / simulated freshness caps the final score
 */

import { describe, it, expect } from 'vitest';
import {
  computeFinalEdgeScore,
  applyRiskFloors,
  EVIDENCE_QUALITY_MULTIPLIER,
  DATA_FRESHNESS_MULTIPLIER,
  type FinalEdgeInputs,
} from '../../lib/brain/finalEdgeScore';

const baseInputs: FinalEdgeInputs = {
  baseConfluenceScore: 0.8,
  evidenceQuality: 'strong',
  dataFreshness: 'live',
  regimeFit: { regimeMatch: 1.0 },
  historicalEdge: {
    followThroughRate: 0.6,
    mfeMaeRatio: 1.5,
    falsePositiveRate: 0.2,
    trapRate: 0.1,
    drawdownSensitivity: -5,
  },
  sampleSize: 120,
  risk: {},
  overfitting: { conditioningDimensions: 1 },
};

describe('Evidence quality — missing options reduces score', () => {
  it('weak evidence is < strong evidence', () => {
    const strong = computeFinalEdgeScore(baseInputs);
    const weak = computeFinalEdgeScore({ ...baseInputs, evidenceQuality: 'weak' });
    expect(weak.finalEdgeScore).toBeLessThan(strong.finalEdgeScore);
    expect(EVIDENCE_QUALITY_MULTIPLIER.weak).toBeLessThan(EVIDENCE_QUALITY_MULTIPLIER.strong);
  });

  it('missing evidence triggers a hard cap', () => {
    const missing = computeFinalEdgeScore({
      ...baseInputs,
      evidenceQuality: 'missing',
    });
    expect(missing.capped).toBe(true);
    expect(missing.capReasons).toContain('missing_evidence_cap');
    expect(missing.finalEdgeScore).toBeLessThanOrEqual(0.35);
  });
});

describe('Regime fit — unknown / mismatched regime reduces score', () => {
  it('regimeMatch=0 (unknown/mismatched) yields lower score than regimeMatch=1', () => {
    const matched = computeFinalEdgeScore(baseInputs);
    const unknown = computeFinalEdgeScore({
      ...baseInputs,
      regimeFit: { regimeMatch: 0 },
    });
    expect(unknown.finalEdgeScore).toBeLessThan(matched.finalEdgeScore);
    expect(unknown.multipliers.regimeFit).toBeLessThan(matched.multipliers.regimeFit);
  });

  it('edge score changes when regime changes (different multipliers)', () => {
    const a = computeFinalEdgeScore({
      ...baseInputs,
      regimeFit: { regimeMatch: 1.0, regimeMultiplier: 1.1 },
    });
    const b = computeFinalEdgeScore({
      ...baseInputs,
      regimeFit: { regimeMatch: 0.4, regimeMultiplier: 0.9 },
    });
    expect(a.finalEdgeScore).not.toBe(b.finalEdgeScore);
    expect(a.multipliers.regimeFit).toBeGreaterThan(b.multipliers.regimeFit);
  });
});

describe('Overfitting — narrow signatures penalised', () => {
  it('singleSymbol+singleTimeframe+singleRegime → lower final score', () => {
    const broad = computeFinalEdgeScore(baseInputs);
    const narrow = computeFinalEdgeScore({
      ...baseInputs,
      overfitting: {
        conditioningDimensions: 6,
        singleSymbolOnly: true,
        singleTimeframeOnly: true,
        singleRegimeOnly: true,
        filterStackCount: 8,
      },
    });
    expect(narrow.multipliers.overfittingPenalty).toBeLessThan(broad.multipliers.overfittingPenalty);
    expect(narrow.finalEdgeScore).toBeLessThan(broad.finalEdgeScore);
  });

  it('walk-forward degradation < 1 punishes the final score', () => {
    const insample = computeFinalEdgeScore(baseInputs);
    const decayed = computeFinalEdgeScore({
      ...baseInputs,
      overfitting: { conditioningDimensions: 1, walkForwardRatio: 0.5 },
    });
    expect(decayed.finalEdgeScore).toBeLessThan(insample.finalEdgeScore);
  });
});

describe('Risk floors — stale / simulated data cannot be overridden by confluence', () => {
  it('stale data caps the final score', () => {
    const r = applyRiskFloors({ ...baseInputs, dataFreshness: 'stale' });
    expect(r.capped).toBe(true);
    expect(r.cap).toBeLessThanOrEqual(0.45);
    expect(r.reasons).toContain('stale_data_cap');
  });

  it('simulated data caps the final score', () => {
    const r = applyRiskFloors({ ...baseInputs, dataFreshness: 'simulated' });
    expect(r.capped).toBe(true);
    expect(r.cap).toBeLessThanOrEqual(0.25);
    expect(r.reasons).toContain('simulated_data_cap');
  });

  it('insufficient sample (<20) cannot publish high confidence', () => {
    const r = applyRiskFloors({ ...baseInputs, sampleSize: 5 });
    expect(r.capped).toBe(true);
    expect(r.cap).toBeLessThanOrEqual(0.35);
    expect(r.reasons).toContain('insufficient_sample_cap');
  });

  it('end-to-end: high confluence + stale data → capped tier ≠ elite', () => {
    const out = computeFinalEdgeScore({
      ...baseInputs,
      baseConfluenceScore: 1.0,
      dataFreshness: 'stale',
    });
    expect(out.capped).toBe(true);
    expect(out.tier).not.toBe('elite');
  });
});

describe('Freshness multiplier ordering', () => {
  it('live > delayed > stale > simulated > unavailable', () => {
    expect(DATA_FRESHNESS_MULTIPLIER.live).toBeGreaterThan(DATA_FRESHNESS_MULTIPLIER.delayed);
    expect(DATA_FRESHNESS_MULTIPLIER.delayed).toBeGreaterThan(DATA_FRESHNESS_MULTIPLIER.stale);
    expect(DATA_FRESHNESS_MULTIPLIER.stale).toBeGreaterThan(DATA_FRESHNESS_MULTIPLIER.simulated);
    expect(DATA_FRESHNESS_MULTIPLIER.simulated).toBeGreaterThan(DATA_FRESHNESS_MULTIPLIER.unavailable);
  });
});
