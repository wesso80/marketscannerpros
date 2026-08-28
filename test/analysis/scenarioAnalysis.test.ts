/**
 * Unit tests for the Stage 5 educational scenario analysis.
 *
 * Pins the educational language contract: no advice/certainty phrases, no
 * "stop loss" / "profit target", explicit alternative scenario, structural
 * invalidation framing, and hypothetical-only R framing.
 *
 * Run: npx vitest run test/analysis/scenarioAnalysis.test.ts
 */
import { describe, it, expect } from 'vitest';
import { buildScenarioAnalysis, findProhibitedLanguage } from '../../lib/analysis';

const BASE = {
  symbol: 'AAPL',
  direction: 'LONG' as const,
  setupType: 'trend',
  primaryDriver: 'Trend structure',
  referenceTrigger: 'a daily close above resistance',
  referenceLevelPrice: 195.5,
  invalidationPrice: 188.25,
  invalidationLogic: 'loss of the higher-low structure',
  keyLevels: [
    { label: 'Prior swing high', price: 201.0, kind: 'resistance' as const },
    { label: 'Higher low', price: 188.25, kind: 'support' as const },
  ],
  reactionZones: [{ price: 205, rMultiple: 2, note: 'measured move' }],
  hypotheticalRr: { expectedR: 2.3, minR: 1.5 },
  supportingFactors: ['Trend', 'Momentum'],
  contradictingFactors: ['Volume / Participation'],
};

function allText(a: ReturnType<typeof buildScenarioAnalysis>): string {
  return [
    a.whyInteresting,
    a.primaryScenario.text,
    a.alternativeScenario.text,
    a.thesisInvalidation.label,
    a.thesisInvalidation.text,
    a.illustrativeStructure ?? '',
    ...a.referenceZones.map((z) => `${z.label} ${z.note ?? ''}`),
  ].join(' \n ');
}

describe('buildScenarioAnalysis', () => {
  it('produces compliant, non-instructional educational copy', () => {
    const a = buildScenarioAnalysis(BASE);
    const text = allText(a).toLowerCase();
    expect(findProhibitedLanguage(text)).toEqual([]);
    expect(text).not.toContain('stop loss');
    expect(text).not.toContain('profit target');
    expect(text).not.toContain('buy ');
    expect(text).not.toContain('sell ');
  });

  it('frames invalidation structurally, not as a stop', () => {
    const a = buildScenarioAnalysis(BASE);
    expect(a.thesisInvalidation.label).toBe('Structural invalidation level');
    expect(a.thesisInvalidation.text.toLowerCase()).toContain('below 188');
    expect(a.thesisInvalidation.price).toBe(188.25);
  });

  it('gives an explicit alternative (opposite) scenario', () => {
    const long = buildScenarioAnalysis(BASE);
    expect(long.primaryScenario.direction).toBe('bullish');
    expect(long.alternativeScenario.direction).toBe('bearish');

    const short = buildScenarioAnalysis({ ...BASE, direction: 'SHORT' });
    expect(short.primaryScenario.direction).toBe('bearish');
    expect(short.alternativeScenario.direction).toBe('bullish');
  });

  it('frames R as hypothetical, education-only', () => {
    const a = buildScenarioAnalysis(BASE);
    expect(a.illustrativeStructure).toBeTruthy();
    expect(a.illustrativeStructure!.toLowerCase()).toContain('hypothetical');
    expect(a.illustrativeStructure!.toLowerCase()).toContain('illustrative structure');
  });

  it('labels reference zones without using "target"', () => {
    const a = buildScenarioAnalysis(BASE);
    expect(a.referenceZones.length).toBeGreaterThan(0);
    for (const z of a.referenceZones) {
      expect(z.label.toLowerCase()).not.toContain('target');
    }
  });

  it('handles a neutral/mixed direction honestly', () => {
    const a = buildScenarioAnalysis({ ...BASE, direction: 'NEUTRAL' });
    expect(a.primaryScenario.title.toLowerCase()).toContain('mixed');
    expect(findProhibitedLanguage(allText(a))).toEqual([]);
  });
});
