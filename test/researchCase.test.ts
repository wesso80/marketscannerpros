import { describe, expect, it } from 'vitest';
import { buildResearchCaseOutcomeSuggestion, buildScenarioPlan, buildTruthLayer, classifyDataSource, normalizeResearchCaseDirection, normalizeResearchCaseForSave } from '../lib/researchCase';

describe('research case truth layer', () => {
  it('classifies cached data with cache age', () => {
    const fetchedAt = new Date(Date.now() - 30_000).toISOString();
    const source = classifyDataSource('cache', fetchedAt);

    expect(source.name).toBe('Redis cache');
    expect(source.status).toBe('CACHED');
    expect(source.cacheAgeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('marks stale source data when timestamps are old', () => {
    const fetchedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const source = classifyDataSource('database', fetchedAt);

    expect(source.status).toBe('STALE');
  });

  it('builds degraded truth layer when market pressure is missing', () => {
    const truth = buildTruthLayer({
      symbol: 'SPY',
      assetClass: 'equity',
      quote: { price: 500, fetchedAt: new Date().toISOString(), source: 'live' },
      indicators: { computedAt: new Date().toISOString(), source: 'database', atr14: 4.2, adx14: 24 },
      mpe: null,
      cfe: { market_mode: 'chop' },
      doctrine: { doctrineId: 'trend_pullback' },
      invalidation: 'Below prior reference level',
    });

    expect(truth.dataQuality).toBe('DEGRADED');
    expect(truth.whatWeKnow.length).toBeGreaterThan(0);
    expect(truth.whatWeDoNotKnow).toContain('Market pressure context is unavailable.');
    expect(truth.disclaimer).toContain('not financial advice');
  });

  it('converts legacy plan shape into public scenario plan shape', () => {
    const scenario = buildScenarioPlan({
      entryType: 'breakout',
      triggers: ['Close-through confirmation'],
      stopRule: 'ATR invalidation logic',
      targets: ['Reaction zone 1'],
      management: ['Track continuation'],
      size: 1.25,
    });

    expect(scenario).toEqual({
      referenceType: 'breakout',
      triggers: ['Close-through confirmation'],
      invalidationLogic: 'ATR invalidation logic',
      reactionZones: ['Reaction zone 1'],
      managementNotes: ['Track continuation'],
      modelSize: 1.25,
    });
  });

  it('normalizes a research case for persistence', () => {
    const normalized = normalizeResearchCaseForSave({
      sourceType: 'scanner/modal',
      researchCase: {
        symbol: 'spy',
        assetClass: 'equity',
        dataQuality: 'GOOD',
        generatedAt: '2026-04-26T00:00:00.000Z',
        title: 'SPY morning case',
      },
    });

    expect(normalized.symbol).toBe('SPY');
    expect(normalized.assetClass).toBe('equity');
    expect(normalized.sourceType).toBe('scanner-modal');
    expect(normalized.dataQuality).toBe('GOOD');
    expect(normalized.generatedAt).toBe('2026-04-26T00:00:00.000Z');
  });

  it('infers lifecycle direction from saved case payloads', () => {
    expect(normalizeResearchCaseDirection({ direction: 'Bullish scenario' })).toBe('long');
    expect(normalizeResearchCaseDirection({ setup: { direction: 'bearish' } })).toBe('short');
    expect(normalizeResearchCaseDirection({ direction: 'neutral' })).toBeUndefined();
  });

  it('suggests outcomes from lifecycle progression', () => {
    expect(buildResearchCaseOutcomeSuggestion({ savedState: 'ARMED', currentState: 'MANAGE', outcomeStatus: 'pending' })).toMatchObject({
      status: 'confirmed',
      confidence: 'high',
    });
    expect(buildResearchCaseOutcomeSuggestion({ savedState: 'WATCH', currentState: 'BLOCKED', outcomeStatus: 'pending' })).toMatchObject({
      status: 'invalidated',
      confidence: 'high',
    });
  });

  it('suggests expiry for old pending cases', () => {
    const createdAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(buildResearchCaseOutcomeSuggestion({ createdAt, currentState: 'WATCH', outcomeStatus: 'pending' })).toMatchObject({
      status: 'expired',
      confidence: 'medium',
    });
  });

  it('rejects invalid symbols when normalizing a saved research case', () => {
    expect(() => normalizeResearchCaseForSave({ researchCase: { symbol: 'bad symbol!' } })).toThrow('valid symbol is required');
  });
});
