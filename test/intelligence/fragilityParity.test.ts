import { describe, it, expect } from 'vitest';
import {
  computeFragility,
  emaSeries,
  trendScore,
  momScore,
  relScore,
  rotScore,
  absRotScore,
  FRAGILITY_SYMBOLS,
  FRAGILITY_CONFIG,
  type FragilityInput,
  type FragilityDailyBar,
  type FragilitySymbol,
} from '@/lib/intelligence/engines/fragility';

/**
 * PARITY HARNESS — Market Fragility v1.1.1.
 *
 * The sub-formulas are unit-tested against hand-computed Pine values (exact).
 * Full-pipeline parity against the deployed TradingView dashboard requires the
 * raw input close/high series TradingView used at a given timestamp. Those are
 * pending; TV_REFERENCE below records the expected OUTPUTS so a full-pipeline
 * snapshot test can be activated the moment the raw series are supplied.
 */

// Expected OUTPUTS from the deployed TradingView Fragility dashboard (2026-08-30).
// These are references, NOT calculation inputs.
export const TV_REFERENCE = {
  health: 67.8,
  fragility: 17.71,
  transition: 7.97,
  divergence: 0,
  breadth: 66.55,
  credit: 45.87,
  volatility: 98.12,
  ratesDollar: 59.79,
  leadership: 66.48,
  trend: 83.33,
  warnings: 0,
  rotationRegime: 'MIXED ROTATION',
  verdict: 'RISK-ON',
  // MASTER LINK = Health − Fragility.
  masterLink: 67.8 - 17.71,
};

describe('Fragility — sub-formula parity (exact, hand-computed from Pine)', () => {
  it('f_trendScore ladders', () => {
    expect(trendScore(110, 105, 102, 100)).toBe(100); // c>e20>e50>e200
    expect(trendScore(110, 99, 102, 100)).toBe(82); // c>e50>e200 (not full stack)
    expect(trendScore(101, 105, 103, 100)).toBe(65); // c>e200 only
    expect(trendScore(90, 95, 98, 100)).toBe(0); // full bearish stack
    expect(trendScore(99, 95, 98, 100)).toBe(35); // c<e200
    expect(trendScore(NaN, 1, 2, 3)).toBe(50); // missing → 50
  });

  it('f_momScore = clamp(50 + m20*5)', () => {
    expect(momScore(0)).toBe(50);
    expect(momScore(4)).toBe(70);
    expect(momScore(-4)).toBe(30);
    expect(momScore(20)).toBe(100); // clamped
    expect(momScore(NaN)).toBe(50);
  });

  it('f_relScore = clamp(50 + rel20*8)', () => {
    expect(relScore(0)).toBe(50);
    expect(relScore(1.5)).toBe(62);
    expect(relScore(-1.5)).toBe(38);
    expect(relScore(10)).toBe(100); // clamped
  });

  it('f_rotScore = 0.30a + 0.20b + 0.25rel + 0.25trend', () => {
    // a=clamp(50+2*4)=58, b=clamp(50+1*2)=52, rel=relScore(1)=58, trend=100
    // 0.30*58 + 0.20*52 + 0.25*58 + 0.25*100 = 17.4 + 10.4 + 14.5 + 25 = 67.3
    expect(rotScore(2, 1, 1, 100)).toBeCloseTo(67.3, 6);
  });

  it('f_absRotScore = 0.40a + 0.25b + 0.35trend', () => {
    // a=58, b=52, trend=100 → 0.40*58 + 0.25*52 + 0.35*100 = 23.2 + 13 + 35 = 71.2
    expect(absRotScore(2, 1, 100)).toBeCloseTo(71.2, 6);
  });

  it('emaSeries seeds with SMA and converges', () => {
    const flat = new Array(50).fill(10);
    const e = emaSeries(flat, 10);
    expect(e[9]).toBe(10); // SMA seed of a flat series
    expect(e[49]).toBeCloseTo(10, 9); // stays flat
  });
});

// ── Full-pipeline structural tests on deterministic synthetic data ──────────
function ramp(start: number, step: number, n: number): FragilityDailyBar[] {
  const bars: FragilityDailyBar[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    c += step;
    const date = new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    bars.push({ date, close: c, high: c * 1.002 });
  }
  return bars;
}

function buildInput(perSymbol: (s: FragilitySymbol) => FragilityDailyBar[], dataAsOf: string): FragilityInput {
  const series: Partial<Record<FragilitySymbol, FragilityDailyBar[]>> = {};
  for (const s of FRAGILITY_SYMBOLS) series[s] = perSymbol(s);
  return { series, dataAsOf, providersUsed: ['synthetic'], sourceStatus: 'OK' };
}

describe('Fragility — full pipeline (synthetic, structural)', () => {
  const now = '2026-08-30T20:00:00Z';

  it('a broadly bullish universe yields high health and a risk-on verdict', () => {
    // Equities/credit/crypto ramp up; VIX ramps down; yields flat.
    const input = buildInput((s) => {
      if (s === 'VIX' || s === 'VIX3M') return ramp(30, -0.02, 260);
      if (s === 'US10Y' || s === 'US02Y') return ramp(4, 0, 260);
      return ramp(100, 0.25, 260);
    }, now);
    const r = computeFragility(input, FRAGILITY_CONFIG, now);

    expect(r.health).toBeGreaterThan(55);
    expect(['STRONG RISK-ON', 'RISK-ON']).toContain(r.verdict);
    expect(r.masterLink).toBeGreaterThan(0);
    expect(r.masterOrientation).toBeGreaterThan(50);
    // All scores within bounds.
    for (const v of [r.health, r.fragility, r.transition, r.divergence, r.breadth, r.credit, r.volatility, r.ratesDollar, r.leadership, r.trend, r.confidence]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(r.masterLink).toBeGreaterThanOrEqual(-100);
    expect(r.masterLink).toBeLessThanOrEqual(100);
    expect(r.missingSymbols).toHaveLength(0);
    expect(r.radar).toHaveLength(9);
  });

  it('MASTER LINK equals Health − Fragility exactly', () => {
    const input = buildInput(() => ramp(100, 0.1, 260), now);
    const r = computeFragility(input, FRAGILITY_CONFIG, now);
    expect(r.masterLink).toBeCloseTo(r.health - r.fragility, 9);
    expect(r.masterOrientation).toBeCloseTo(50 + (r.health - r.fragility) * 0.5, 9);
  });

  it('reports DATA_UNAVAILABLE and does not crash when series are empty', () => {
    const r = computeFragility({ series: {}, dataAsOf: now, providersUsed: [], sourceStatus: 'DATA_UNAVAILABLE' }, FRAGILITY_CONFIG, now);
    expect(r.sourceStatus).toBe('DATA_UNAVAILABLE');
    expect(r.missingSymbols.length).toBe(FRAGILITY_SYMBOLS.length);
  });

  it('flags stale data when the underlying market data is old', () => {
    const input = buildInput(() => ramp(100, 0.1, 260), '2026-08-01T00:00:00Z');
    const r = computeFragility(input, FRAGILITY_CONFIG, now);
    expect(r.isStale).toBe(true);
    expect(r.dataAsOf).toBe('2026-08-01T00:00:00Z');
    expect(r.calculatedAt).toBe(now);
  });
});

// ── Reference-snapshot scaffold (activate when raw TV input series arrive) ───
describe('Fragility — TradingView full-pipeline parity (pending raw inputs)', () => {
  it.skip('reproduces the 2026-08-30 dashboard outputs from raw TV close/high series', () => {
    // When TradingView Data Window close/high series are supplied per symbol,
    // build a FragilityInput from them and assert (exact displayed / documented
    // tolerance) against TV_REFERENCE.
    expect(TV_REFERENCE.masterLink).toBeCloseTo(50.09, 2);
  });
});
