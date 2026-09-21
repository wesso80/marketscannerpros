import { describe, expect, it } from 'vitest';
import { parseProFilters, proCandidateMetrics, selectProCandidates } from '@/lib/scanner/proSelection';
import { atrResearchLevels } from '@/lib/scanner/atrResearchLevels';

const candidate = (symbol: string, overrides: Record<string, unknown> = {}) => ({
  symbol, confidence: 75, direction: 'bullish',
  signals: { bullish: 6, bearish: 1, neutral: 1 },
  indicators: { price: 100, atr: 2, adx: 30, rsi: 60, squeeze: true, sectorRelStr: 2 },
  ...overrides,
});

describe('Pro scan selection across all evaluated candidates', () => {
  it('finds a match outside the old top-ten cutoff before applying the response limit', () => {
    const candidates = Array.from({ length: 40 }, (_, i) => candidate(`S${i}`, { direction: i === 39 ? 'bearish' : 'bullish' }));
    const result = selectProCandidates(candidates, parseProFilters({ direction: 'short' }), 'rank', 10);
    expect(result.topPicks.map(p => p.symbol)).toEqual(['S39']);
    expect(result.selection).toMatchObject({ evaluated: 40, matched: 1, returned: 1, excluded: 39, beyondLimit: 0 });
  });

  it('sorts all matches before the limit and uses deterministic symbol ties', () => {
    const candidates = [candidate('B', { confidence: 60 }), candidate('Z', { confidence: 99 }), candidate('A', { confidence: 99 })];
    expect(selectProCandidates(candidates, parseProFilters(), 'confidence', 1).topPicks[0].symbol).toBe('A');
    expect(selectProCandidates(candidates, parseProFilters(), 'rank', 1).topPicks[0].symbol).toBe('B');
  });

  it('accounts for every candidate once, including data exclusions and matching rows beyond the limit', () => {
    const candidates = [candidate('OK1'), candidate('OK2'), candidate('NO_RSI', { indicators: { price: 100, atr: 2 } }), candidate('LOW', { confidence: 10 })];
    const result = selectProCandidates(candidates, parseProFilters({ preset: 'momentum', minConfidence: 50 }), 'rank', 1);
    expect(result.selection).toMatchObject({ evaluated: 4, matched: 2, returned: 1, excluded: 2, unavailable: 1, beyondLimit: 1 });
    expect(result.selection.exclusions).toEqual({ 'RSI unavailable': 1, 'Minimum confidence': 1 });
    expect(result.selection.evaluated).toBe(result.selection.returned + result.selection.beyondLimit + result.selection.excluded);
  });

  it.each([
    [{ volatility: 'low' }, 'ATR unavailable'],
    [{ minAlignment: 2 }, 'Factor inputs unavailable'],
    [{ squeeze: true }, 'Squeeze unavailable'],
    [{ minAdx: 20 }, 'ADX unavailable'],
    [{ requireRelativeStrength: true }, 'Relative strength unavailable'],
    [{ preset: 'mean_reversion' }, 'RSI unavailable'],
  ])('does not treat missing inputs as passing %j', (filters, reason) => {
    const result = selectProCandidates([candidate('MISSING', { indicators: { price: 100 } })], parseProFilters(filters));
    expect(result.topPicks).toHaveLength(0);
    expect(result.selection.excludedCandidates).toEqual([{ symbol: 'MISSING', reason, unavailable: true }]);
  });

  it('keeps missing metrics last when sorting and does not turn invalid ATR into low volatility', () => {
    const missing = candidate('A', { indicators: { price: 100, atr: 0, atr_percent: -1 } });
    const observed = candidate('B');
    expect(proCandidateMetrics(missing).atrPct).toBeNull();
    expect(selectProCandidates([missing, observed], parseProFilters(), 'volatility').topPicks.map(p => p.symbol)).toEqual(['B', 'A']);
  });

  it('uses the capped headline confidence for both filtering and ordering', () => {
    const capped = candidate('CAPPED', { confidence: 40, matchConfidence: 95, score: 95 });
    expect(selectProCandidates([capped], parseProFilters({ minConfidence: 60 })).topPicks).toHaveLength(0);
  });

  it.each([null, [], { direction: 'up' }, { minConfidence: '80' }, { minAlignment: 5 }, { minAdx: 30, maxAdx: 20 }, { rsiBand: [80, 20] }, { squeeze: 'yes' }, { minConfidence: NaN }])('rejects invalid filter input %j', input => {
    expect(() => parseProFilters(input)).toThrow();
  });
});

describe('ATR research levels', () => {
  it.each(['bullish', 'bearish'])('uses observed ATR and preserves a 2:1 scenario for %s', direction => {
    const levels = atrResearchLevels(100, 2, direction);
    expect(levels).toEqual(direction === 'bullish' ? { entry: 100, stop: 97, target: 106, rMultiple: 2 } : { entry: 100, stop: 103, target: 94, rMultiple: 2 });
  });
  it.each([[100, undefined, 'bullish'], [100, 0, 'bearish'], [100, 2, 'neutral'], [0, 2, 'bullish'], [100, 100, 'bearish']] as const)('leaves unavailable scenarios empty (%s, %s, %s)', (price, atr, direction) => {
    expect(Object.values(atrResearchLevels(price, atr, direction))).toEqual([undefined, undefined, undefined, undefined]);
  });
  it('preserves small-token price precision instead of rounding levels to zero', () => {
    const levels = atrResearchLevels(0.00001, 0.000001, 'bullish');
    expect(levels.stop).toBeCloseTo(0.0000085, 10);
    expect(levels.target).toBeCloseTo(0.000013, 10);
    expect(levels.rMultiple).toBeCloseTo(2);
  });
});
