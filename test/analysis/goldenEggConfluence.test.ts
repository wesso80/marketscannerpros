/**
 * Unit tests for the Stage 3 Golden Egg confluence adapter.
 *
 * Pins that composite scores are framed as strength (not probability), that
 * correlated verdicts map to independent factor groups, that direction is
 * respected (agree under SHORT = bearish), and that evidence quality degrades
 * with stale data / conflicts.
 *
 * Run: npx vitest run test/analysis/goldenEggConfluence.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  buildGoldenEggConfluence,
  freshnessFromTimestamp,
  findProhibitedLanguage,
} from '../../lib/analysis';

describe('freshnessFromTimestamp', () => {
  const now = Date.parse('2026-08-28T12:00:00Z');
  it('classifies live / delayed / stale / unknown', () => {
    expect(freshnessFromTimestamp('2026-08-28T11:59:00Z', now)).toBe('live');
    expect(freshnessFromTimestamp('2026-08-28T10:00:00Z', now)).toBe('delayed');
    expect(freshnessFromTimestamp('2026-08-26T10:00:00Z', now)).toBe('stale');
    expect(freshnessFromTimestamp(undefined, now)).toBe('unknown');
    expect(freshnessFromTimestamp('not-a-date', now)).toBe('unknown');
  });
});

describe('buildGoldenEggConfluence', () => {
  it('frames the score as composite strength, never a probability', () => {
    const r = buildGoldenEggConfluence({
      direction: 'LONG',
      confluenceScore: 78,
      confidence: 70,
      asOfTs: new Date().toISOString(),
      structureVerdict: 'agree',
      momentumVerdict: 'agree',
      volatilityBias: 'bullish',
      optionsVerdict: 'neutral',
      internalsVerdict: 'agree',
      timeConfluenceDirection: 'bullish',
    });
    expect(r.composite.value).toBe(78);
    expect(r.composite.label).toBe('Composite Strength');
    expect(r.composite.note.toLowerCase()).toContain('not a statistical probability');
    expect(findProhibitedLanguage(r.confluence.summary)).toEqual([]);
    expect(r.confluence.summary).not.toMatch(/\d+%/);
  });

  it('maps a LONG "agree" to bullish and a SHORT "agree" to bearish', () => {
    const long = buildGoldenEggConfluence({
      direction: 'LONG', confluenceScore: 60, confidence: 60,
      structureVerdict: 'agree', momentumVerdict: 'agree',
    });
    expect(long.factors.find((f) => f.group === 'MARKET_STRUCTURE')?.signal).toBe('bullish');

    const short = buildGoldenEggConfluence({
      direction: 'SHORT', confluenceScore: 60, confidence: 60,
      structureVerdict: 'agree', momentumVerdict: 'agree',
    });
    expect(short.factors.find((f) => f.group === 'MARKET_STRUCTURE')?.signal).toBe('bearish');
    expect(short.referenceDirection).toBe('bearish');
  });

  it('counts each domain as one independent factor group', () => {
    const r = buildGoldenEggConfluence({
      direction: 'LONG', confluenceScore: 80, confidence: 75,
      structureVerdict: 'agree', momentumVerdict: 'agree', volatilityBias: 'bullish',
      optionsVerdict: 'agree', internalsVerdict: 'agree', timeConfluenceDirection: 'bullish',
    });
    // 6 domains -> up to 6 independent groups (no double counting).
    expect(r.confluence.independentFactors).toBe(6);
    expect(r.confluence.dominant).toBe('bullish');
    expect(r.confluence.agreement).toBe('strong');
  });

  it('omits disabled layers (undefined/null verdicts) from factor count', () => {
    const r = buildGoldenEggConfluence({
      direction: 'LONG', confluenceScore: 50, confidence: 50,
      structureVerdict: 'agree', momentumVerdict: 'neutral',
      optionsVerdict: null, internalsVerdict: undefined,
    });
    const groups = r.factors.map((f) => f.group);
    expect(groups).toContain('MARKET_STRUCTURE');
    expect(groups).toContain('MOMENTUM');
    expect(groups).not.toContain('POSITIONING');
    expect(groups).not.toContain('VOLUME');
  });

  it('propagates a volatility caution flag', () => {
    const r = buildGoldenEggConfluence({
      direction: 'LONG', confluenceScore: 55, confidence: 55,
      structureVerdict: 'agree', momentumVerdict: 'agree',
      volatilityBias: 'neutral', volatilityCaution: true,
    });
    expect(r.confluence.cautions).toBe(1);
  });

  it('degrades evidence quality when data is stale', () => {
    const r = buildGoldenEggConfluence({
      direction: 'LONG', confluenceScore: 80, confidence: 80,
      asOfTs: '2020-01-01T00:00:00Z', // very old -> stale
      structureVerdict: 'agree', momentumVerdict: 'agree', volatilityBias: 'bullish',
      optionsVerdict: 'agree', internalsVerdict: 'agree', timeConfluenceDirection: 'bullish',
    });
    expect(r.evidence.level).not.toBe('HIGH');
  });
});
