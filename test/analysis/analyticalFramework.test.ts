/**
 * Unit tests for the Stage 1 shared analytical foundations.
 *
 * These pin the probability-honest behaviour that later stages depend on:
 *  - composite scores are never framed as probabilities
 *  - correlated indicators collapse to one signal per independent factor group
 *  - confluence is measured across independent groups, not raw indicators
 *  - evidence quality degrades honestly with missing/stale/simulated data
 *  - user-facing copy is screened for advice/certainty language
 *
 * Run: npx vitest run test/analysis/analyticalFramework.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  formatCompositeScore,
  COMPOSITE_SCORE_NOTE,
  findProhibitedLanguage,
  collapseIndicatorsToFactors,
  summarizeConfluence,
  assessEvidenceQuality,
  freshnessFromProviderStatus,
  type FactorAssessment,
} from '../../lib/analysis';

describe('formatCompositeScore', () => {
  it('labels the value as strength, not probability, and clamps 0–100', () => {
    const d = formatCompositeScore(78);
    expect(d.value).toBe(78);
    expect(d.label).toBe('Composite Strength');
    expect(d.label.toLowerCase()).not.toContain('probab');
    expect(d.note).toBe(COMPOSITE_SCORE_NOTE);
    expect(d.note.toLowerCase()).toContain('not a statistical probability');
    expect(formatCompositeScore(140).value).toBe(100);
    expect(formatCompositeScore(-5).value).toBe(0);
    expect(formatCompositeScore(Number.NaN).value).toBe(0);
  });
});

describe('findProhibitedLanguage', () => {
  it('flags advice/certainty phrases', () => {
    expect(findProhibitedLanguage('This is a guaranteed buy now, it will rise')).toEqual(
      expect.arrayContaining(['guaranteed', 'buy now', 'will rise']),
    );
  });
  it('passes compliant educational copy', () => {
    expect(
      findProhibitedLanguage('Current evidence suggests bullish conditions; thesis invalidation below support.'),
    ).toEqual([]);
  });
});

describe('collapseIndicatorsToFactors — anti double-counting', () => {
  it('collapses four correlated TREND indicators into one factor group', () => {
    const factors = collapseIndicatorsToFactors([
      { key: 'ema50', signal: 'bullish' },
      { key: 'macd', signal: 'bullish' },
      { key: 'adx', signal: 'bullish' },
      { key: 'aroon', signal: 'bullish' },
    ]);
    // 4 trend indicators => exactly ONE independent TREND factor.
    expect(factors).toHaveLength(1);
    expect(factors[0]).toMatchObject({ group: 'TREND', signal: 'bullish' });
  });

  it('separates independent groups and majority-votes within a group', () => {
    const factors = collapseIndicatorsToFactors([
      { key: 'ema50', signal: 'bullish' },
      { key: 'macd', signal: 'bearish' }, // TREND tie -> neutral
      { key: 'rsi', signal: 'bullish' },  // MOMENTUM
      { key: 'obv', signal: 'bullish' },  // VOLUME
      { key: 'unknownIndicator', signal: 'bullish' }, // ignored
    ]);
    const byGroup = Object.fromEntries(factors.map((f) => [f.group, f.signal]));
    expect(byGroup.TREND).toBe('neutral');
    expect(byGroup.MOMENTUM).toBe('bullish');
    expect(byGroup.VOLUME).toBe('bullish');
    expect(factors.find((f) => f.group === undefined)).toBeUndefined();
  });
});

describe('summarizeConfluence', () => {
  it('reports strong agreement across independent groups without a probability', () => {
    const assessments: FactorAssessment[] = [
      { group: 'TREND', signal: 'bullish' },
      { group: 'MOMENTUM', signal: 'bullish' },
      { group: 'VOLUME', signal: 'neutral' },
      { group: 'VOLATILITY', signal: 'bullish' },
      { group: 'RELATIVE_STRENGTH', signal: 'bullish' },
      { group: 'REGIME', signal: 'bullish' },
      { group: 'CATALYST', signal: 'neutral', caution: true },
    ];
    const s = summarizeConfluence(assessments);
    expect(s.dominant).toBe('bullish');
    expect(s.supportive).toBe(5);
    expect(s.opposing).toBe(0);
    expect(s.cautions).toBe(1);
    expect(s.agreement).toBe('strong');
    expect(s.summary.toLowerCase()).not.toMatch(/\d+%/); // never a percentage
  });

  it('reports conflicting when groups disagree', () => {
    const s = summarizeConfluence([
      { group: 'TREND', signal: 'bullish' },
      { group: 'MOMENTUM', signal: 'bearish' },
      { group: 'VOLUME', signal: 'bullish' },
      { group: 'RELATIVE_STRENGTH', signal: 'bearish' },
    ]);
    expect(['conflicting', 'mixed']).toContain(s.agreement === 'conflicting' ? 'conflicting' : s.dominant);
    expect(s.agreement).toBe('conflicting');
  });

  it('reports insufficient with fewer than two independent factors', () => {
    const s = summarizeConfluence([{ group: 'TREND', signal: 'bullish' }]);
    expect(s.dominant).toBe('unknown');
    expect(s.agreement).toBe('insufficient');
  });
});

describe('assessEvidenceQuality', () => {
  it('is HIGH with broad, live, non-conflicting coverage', () => {
    const r = assessEvidenceQuality({ availableFactors: 5, totalFactors: 6, freshness: 'live' });
    expect(r.level).toBe('HIGH');
    expect(r.completeness).toBeCloseTo(5 / 6, 5);
  });

  it('is INSUFFICIENT with simulated or missing data regardless of coverage', () => {
    expect(assessEvidenceQuality({ availableFactors: 6, totalFactors: 6, freshness: 'simulated' }).level).toBe('INSUFFICIENT');
    expect(assessEvidenceQuality({ availableFactors: 6, totalFactors: 6, freshness: 'missing' }).level).toBe('INSUFFICIENT');
  });

  it('is INSUFFICIENT with fewer than two factors', () => {
    expect(assessEvidenceQuality({ availableFactors: 1, totalFactors: 6, freshness: 'live' }).level).toBe('INSUFFICIENT');
  });

  it('caps below HIGH when data is stale or conflicting', () => {
    expect(assessEvidenceQuality({ availableFactors: 5, totalFactors: 6, freshness: 'stale' }).level).not.toBe('HIGH');
    expect(assessEvidenceQuality({ availableFactors: 5, totalFactors: 6, freshness: 'live', conflicting: true }).level).not.toBe('HIGH');
  });
});

describe('freshnessFromProviderStatus', () => {
  it('maps provider status booleans to a freshness level', () => {
    expect(freshnessFromProviderStatus({ live: true, stale: false, simulated: false })).toBe('live');
    expect(freshnessFromProviderStatus({ live: false, stale: true, simulated: false })).toBe('stale');
    expect(freshnessFromProviderStatus({ live: false, stale: false, simulated: true })).toBe('simulated');
    expect(freshnessFromProviderStatus({ live: false, stale: false, simulated: false })).toBe('delayed');
  });
});
