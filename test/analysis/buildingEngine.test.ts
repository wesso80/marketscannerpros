/**
 * Unit tests for the Stage 4 Building / Early-interest engine.
 *
 * Pins the state machine (DORMANT/BUILDING/EXPANDING/EXTENDED/FADING), the
 * probability-honest score framing, evidence-quality degradation with missing
 * layers, ranking, and the cohort-relative volume helper.
 *
 * Run: npx vitest run test/analysis/buildingEngine.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  classifyBuilding,
  rankBuilding,
  crossSectionalRelativeVolume,
  findProhibitedLanguage,
  type BuildingAssessment,
} from '../../lib/analysis';

describe('classifyBuilding', () => {
  it('flags BUILDING when participation rises while price is contained and compressing', () => {
    const a = classifyBuilding({
      symbol: 'ETH',
      changePct: 0.8,
      relativeVolume: 1.9,
      openInterestChangePct: 6.2,
      volatilityState: 'emerging',
      relativeStrength: 'improving',
      freshness: 'live',
    });
    expect(a.state).toBe('BUILDING');
    expect(a.score.label).toBe('Composite Strength');
    expect(a.score.value).toBeGreaterThan(0);
    expect(a.interpretation.toLowerCase()).toContain('developing directional activity');
    expect(findProhibitedLanguage(a.interpretation)).toEqual([]);
  });

  it('flags EXTENDED when a large move has already happened', () => {
    const a = classifyBuilding({
      symbol: 'AAA',
      changePct: 14,
      relativeVolume: 3,
      volatilityState: 'expansion',
      freshness: 'live',
    });
    expect(a.state).toBe('EXTENDED');
    // early-window strength is discounted once extended
    expect(a.score.value).toBeLessThan(60);
  });

  it('flags EXPANDING when participation and price expand together', () => {
    const a = classifyBuilding({
      symbol: 'BBB',
      changePct: 5,
      relativeVolume: 2,
      volatilityState: 'expansion',
      momentumAccelerating: true,
      freshness: 'live',
    });
    expect(a.state).toBe('EXPANDING');
  });

  it('flags FADING when strength weakens after a move', () => {
    const a = classifyBuilding({
      symbol: 'CCC',
      changePct: 4,
      relativeStrength: 'weakening',
      volatilityState: 'neutral',
      freshness: 'live',
    });
    expect(a.state).toBe('FADING');
  });

  it('flags DORMANT when nothing is developing', () => {
    const a = classifyBuilding({
      symbol: 'DDD',
      changePct: 0.2,
      relativeVolume: 0.8,
      volatilityState: 'compression',
      freshness: 'live',
    });
    expect(a.state).toBe('DORMANT');
  });

  it('degrades evidence quality when only price is available', () => {
    const a = classifyBuilding({ symbol: 'EEE', changePct: 1.0 });
    // only price known -> < 2 factor groups -> INSUFFICIENT
    expect(a.evidence.level).toBe('INSUFFICIENT');
  });
});

describe('rankBuilding', () => {
  it('surfaces BUILDING/EXPANDING before EXTENDED/DORMANT', () => {
    const items: BuildingAssessment[] = [
      classifyBuilding({ symbol: 'EXT', changePct: 20, relativeVolume: 3, volatilityState: 'expansion', freshness: 'live' }),
      classifyBuilding({ symbol: 'BLD', changePct: 0.5, relativeVolume: 2, volatilityState: 'emerging', freshness: 'live' }),
      classifyBuilding({ symbol: 'DOR', changePct: 0.1, relativeVolume: 0.7, volatilityState: 'compression', freshness: 'live' }),
    ];
    const ranked = rankBuilding(items);
    expect(ranked[0].symbol).toBe('BLD');
    expect(ranked[ranked.length - 1].symbol).toBe('DOR');
  });
});

describe('crossSectionalRelativeVolume', () => {
  it('computes volume vs cohort median', () => {
    expect(crossSectionalRelativeVolume(200, [100, 100, 100])).toBeCloseTo(2);
    expect(crossSectionalRelativeVolume(50, [100, 200, 300])).toBeCloseTo(0.25);
  });
  it('returns undefined on invalid input', () => {
    expect(crossSectionalRelativeVolume(0, [100])).toBeUndefined();
    expect(crossSectionalRelativeVolume(100, [])).toBeUndefined();
  });
});
