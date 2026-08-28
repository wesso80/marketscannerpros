/**
 * Unit tests for the Stage 6 crypto leverage state and cross-asset engines.
 *
 * Run: npx vitest run test/analysis/stage6.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  classifyLeverageState,
  describeCrossAsset,
  describeVolatilityRegime,
  findProhibitedLanguage,
} from '../../lib/analysis';

describe('classifyLeverageState', () => {
  it('flags CROWDED_LONG on rising price + rising OI + high funding', () => {
    const a = classifyLeverageState({ priceChangePct: 3, openInterestChangePct: 8, fundingRate: 0.08, freshness: 'live' });
    expect(a.state).toBe('CROWDED_LONG');
    expect(a.label).toBe('Crowded long positioning');
    expect(findProhibitedLanguage(a.interpretation)).toEqual([]);
  });

  it('flags LEVERAGE_BUILDING when funding is elevated but not extreme', () => {
    const a = classifyLeverageState({ priceChangePct: 2, openInterestChangePct: 5, fundingRate: 0.035, freshness: 'live' });
    expect(a.state).toBe('LEVERAGE_BUILDING');
  });

  it('flags HEALTHY_TREND_PARTICIPATION when funding is balanced', () => {
    const a = classifyLeverageState({ priceChangePct: 2, openInterestChangePct: 5, fundingRate: 0.005, freshness: 'live' });
    expect(a.state).toBe('HEALTHY_TREND_PARTICIPATION');
  });

  it('flags SHORT_COVERING on price up + OI down', () => {
    const a = classifyLeverageState({ priceChangePct: 3, openInterestChangePct: -5, freshness: 'live' });
    expect(a.state).toBe('SHORT_COVERING');
  });

  it('flags LONG_LIQUIDATION when long liquidations dominate', () => {
    const a = classifyLeverageState({ priceChangePct: -4, longLiquidations: 5_000_000, shortLiquidations: 500_000, freshness: 'live' });
    expect(a.state).toBe('LONG_LIQUIDATION');
  });

  it('flags DELEVERAGING on price down + OI down', () => {
    const a = classifyLeverageState({ priceChangePct: -3, openInterestChangePct: -6, freshness: 'live' });
    expect(a.state).toBe('DELEVERAGING');
  });

  it('degrades evidence quality with sparse data', () => {
    const a = classifyLeverageState({ priceChangePct: 1 });
    expect(a.evidence.level).toBe('INSUFFICIENT');
  });
});

describe('describeCrossAsset', () => {
  it('flags divergence against a positive baseline (BTC↔Nasdaq)', () => {
    const r = describeCrossAsset({
      a: { label: 'BTC', changePct: 2.0 },
      b: { label: 'Nasdaq', changePct: -1.5 },
      baseline: 'positive',
      freshness: 'delayed',
    });
    expect(r.coMovement).toBe('diverging');
    expect(r.diverging).toBe(true);
    expect(r.interpretation.toLowerCase()).toContain('does not by itself imply convergence');
    expect(r.interpretation.toLowerCase()).toContain('causation');
    expect(findProhibitedLanguage(r.interpretation)).toEqual([]);
  });

  it('reports aligned co-movement consistent with a positive baseline', () => {
    const r = describeCrossAsset({
      a: { label: 'BTC', changePct: 1.5 },
      b: { label: 'Nasdaq', changePct: 1.0 },
      baseline: 'positive',
    });
    expect(r.coMovement).toBe('aligned');
    expect(r.diverging).toBe(false);
  });

  it('treats DXY↔risk aligned move as a divergence from the inverse baseline', () => {
    const r = describeCrossAsset({
      a: { label: 'DXY', changePct: 0.8 },
      b: { label: 'Risk assets', changePct: 0.9 },
      baseline: 'negative',
    });
    expect(r.diverging).toBe(true);
  });

  it('is honest when data is missing', () => {
    const r = describeCrossAsset({ a: { label: 'BTC' }, b: { label: 'Nasdaq' }, baseline: 'positive' });
    expect(r.coMovement).toBe('unclear');
    expect(r.label).toBe('Relationship unavailable');
  });
});

describe('describeVolatilityRegime', () => {
  it('bands VIX levels', () => {
    expect(describeVolatilityRegime(12).band).toBe('low');
    expect(describeVolatilityRegime(17).band).toBe('normal');
    expect(describeVolatilityRegime(24).band).toBe('elevated');
    expect(describeVolatilityRegime(35).band).toBe('high');
  });
  it('is honest when unavailable', () => {
    expect(describeVolatilityRegime(undefined).label.toLowerCase()).toContain('unavailable');
  });
});
