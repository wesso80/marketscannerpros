/**
 * test/brain/aiOutputContract.test.ts
 *
 * Contract test for ai-output-standards.md — every admin AI/setup
 * output must carry the seven required fields:
 *   1. Opportunity Score
 *   2. Evidence Quality Score
 *   3. Personal Exposure Score (or flag)
 *   4. Confidence statement
 *   5. What confirms
 *   6. What invalidates
 *   7. Main risk
 *
 * Today the schema lives in lib/admin/scoring.ts (`ScoreBundle`).
 * This test enforces:
 *   - the type contract still exposes those fields,
 *   - buildScoreBundle rejects out-of-range / collapsed bundles,
 *   - confirms/invalidates are non-empty for any non-trivial setup,
 *   - exposure is never silently collapsed into opportunity.
 */

import { describe, it, expect } from 'vitest';
import {
  buildScoreBundle,
  type ScoreBundle,
  type OpportunityScore,
  type EvidenceQualityScore,
  type PersonalExposureScore,
} from '../../lib/admin/scoring';

function makeOpportunity(value = 70, withReasons = true): OpportunityScore {
  return {
    value,
    drivers: withReasons ? ['Trend up + ATR expansion'] : [],
    confirms: withReasons ? ['Hold above 50% pull level on next close'] : [],
    invalidates: withReasons ? ['Loss of prior swing low'] : [],
  };
}

function makeEvidence(value = 75): EvidenceQualityScore {
  return {
    value,
    sources: ['alpha-vantage'],
    missingFields: [],
    stale: false,
    simulated: false,
  };
}

function makeExposure(): PersonalExposureScore {
  return { value: 10, flag: 'low', notes: [] };
}

describe('AI output contract — required score envelope (ai-output-standards)', () => {
  it('accepts a complete ScoreBundle', () => {
    const bundle: ScoreBundle = {
      opportunity: makeOpportunity(),
      evidence: makeEvidence(),
      exposure: makeExposure(),
    };
    const out = buildScoreBundle(bundle);
    expect(out.opportunity.value).toBe(70);
    expect(out.evidence.value).toBe(75);
    expect(out.exposure.value).toBe(10);
  });

  it('opportunity score must include confirms AND invalidates (per ai-output-standards)', () => {
    const bundle = buildScoreBundle({
      opportunity: makeOpportunity(),
      evidence: makeEvidence(),
      exposure: makeExposure(),
    });
    // These are the two fields ai-output-standards calls "What confirms" and
    // "What invalidates" — they must be present, not collapsed into drivers.
    expect(Array.isArray(bundle.opportunity.confirms)).toBe(true);
    expect(Array.isArray(bundle.opportunity.invalidates)).toBe(true);
    expect(bundle.opportunity.confirms.length).toBeGreaterThan(0);
    expect(bundle.opportunity.invalidates.length).toBeGreaterThan(0);
  });

  it('evidence score must declare stale + simulated flags explicitly', () => {
    const bundle = buildScoreBundle({
      opportunity: makeOpportunity(),
      evidence: makeEvidence(),
      exposure: makeExposure(),
    });
    expect(typeof bundle.evidence.stale).toBe('boolean');
    expect(typeof bundle.evidence.simulated).toBe('boolean');
  });

  it('exposure must remain a separate field — never collapsed into opportunity', () => {
    const bundle = buildScoreBundle({
      opportunity: makeOpportunity(),
      evidence: makeEvidence(),
      exposure: makeExposure(),
    });
    // Three keys, in this order, distinct objects.
    expect(Object.keys(bundle).sort()).toEqual(['evidence', 'exposure', 'opportunity']);
    expect(bundle.opportunity).not.toBe(bundle.exposure as unknown as OpportunityScore);
  });

  it('rejects out-of-range opportunity value', () => {
    expect(() =>
      buildScoreBundle({
        opportunity: { ...makeOpportunity(), value: 150 },
        evidence: makeEvidence(),
        exposure: makeExposure(),
      }),
    ).toThrow();
  });

  it('rejects out-of-range evidence value', () => {
    expect(() =>
      buildScoreBundle({
        opportunity: makeOpportunity(),
        evidence: { ...makeEvidence(), value: -5 },
        exposure: makeExposure(),
      }),
    ).toThrow();
  });

  it('rejects out-of-range exposure value', () => {
    expect(() =>
      buildScoreBundle({
        opportunity: makeOpportunity(),
        evidence: makeEvidence(),
        exposure: { value: 999, flag: 'high', notes: [] },
      }),
    ).toThrow();
  });

  it('exposure may be null when no portfolio context exists (per spec)', () => {
    const bundle = buildScoreBundle({
      opportunity: makeOpportunity(),
      evidence: makeEvidence(),
      exposure: { value: null, flag: 'none', notes: [] },
    });
    expect(bundle.exposure.value).toBeNull();
    expect(bundle.exposure.flag).toBe('none');
  });
});

describe('AI output contract — coverage-aware confidence (lib/brain/engineBridge)', () => {
  it('confidence is never higher than raw score × overall coverage factor', async () => {
    const { coverageAwareConfidence } = await import('../../lib/brain/engineBridge');
    const out = coverageAwareConfidence(80, {
      presentLayers: 5,
      expectedLayers: 13,
      freshness: 'stale',
      liquidity: 'thin',
      directionFloorMet: false,
    });
    // 80 × max(0.4, 5/13)≈0.4 × 0.7 × 0.8 × 0.5 = 8.96 → 9
    expect(out.confidence).toBeLessThanOrEqual(20);
    expect(out.confidence).toBeGreaterThanOrEqual(0);
    expect(out.factors.overall).toBeLessThan(0.2);
  });

  it('full coverage + fresh data + floor met → confidence equals raw score', async () => {
    const { coverageAwareConfidence } = await import('../../lib/brain/engineBridge');
    const out = coverageAwareConfidence(80, {
      presentLayers: 13,
      expectedLayers: 13,
      freshness: 'fresh',
      liquidity: 'sufficient',
      directionFloorMet: true,
    });
    expect(out.confidence).toBe(80);
    expect(out.factors.overall).toBe(1);
  });

  it('direction floor failure cuts confidence in half', async () => {
    const { coverageAwareConfidence, checkDirectionFloor } = await import('../../lib/brain/engineBridge');
    const floor = checkDirectionFloor({ alignedLayers: 1, opposedLayers: 0 });
    expect(floor.floorMet).toBe(false);

    const ok = coverageAwareConfidence(80, {
      presentLayers: 13,
      expectedLayers: 13,
      freshness: 'fresh',
      liquidity: 'sufficient',
      directionFloorMet: true,
    });
    const bad = coverageAwareConfidence(80, {
      presentLayers: 13,
      expectedLayers: 13,
      freshness: 'fresh',
      liquidity: 'sufficient',
      directionFloorMet: false,
    });
    expect(bad.confidence).toBeLessThan(ok.confidence);
    expect(bad.factors.direction).toBe(0.5);
  });
});
