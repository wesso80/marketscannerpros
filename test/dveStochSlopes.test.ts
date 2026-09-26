/**
 * RS-5 — DVE never received the stochastic %K/%D slopes: /api/dve, Golden Egg and the scanner all pass stochK/stochD
 * but no slopes. Every reading lost 6 points of data quality ("missing stochKSlope, stochDSlope"), the stochastic
 * momentum score could only reach ±9 of ±15, and contraction continuation got +10 on every reading. The engine now
 * derives the one-bar slopes from the price bars when a caller supplies %K without them; missing slopes are neutral.
 */
import { describe, expect, it } from 'vitest';
import { computeDVE, computePhasePersistence, computeStochasticMomentum, deriveStochSlopes } from '@/lib/directionalVolatilityEngine';
import type { DVEInput, DirectionalPressure, VolatilityState, ZoneDurationStats } from '@/lib/directionalVolatilityEngine.types';
import { stochastic } from '@/lib/scanner/indicatorMath';

/** 300 bars: a range, then a steady rise over the last 12 bars; dir −1 is its exact mirror around 100. */
function bars(dir: 1 | -1) {
  const closes: number[] = [], highs: number[] = [], lows: number[] = [];
  for (let i = 0; i < 300; i++) {
    const c = 100 + Math.sin(i / 5) * 2 + (i >= 288 ? (i - 287) * 0.8 : 0);
    closes.push(c); highs.push(c + 0.6); lows.push(c - 0.6);
  }
  if (dir === 1) return { closes, highs, lows };
  const m = (x: number) => 200 - x; // exact bearish mirror: prices reflected, highs <-> lows
  return { closes: closes.map(m), highs: lows.map(m), lows: highs.map(m) };
}
function input(dir: 1 | -1, withBars = true): DVEInput {
  const b = bars(dir);
  const st = stochastic(b.highs, b.lows, b.closes);
  return {
    price: { closes: b.closes, highs: withBars ? b.highs : undefined, lows: withBars ? b.lows : undefined, currentPrice: b.closes[299], changePct: 0 },
    indicators: { stochK: st.k, stochD: st.d, stochMomentum: st.k - st.d, adx: 25, atr: 1 },
  };
}

describe('stochastic slopes', () => {
  it('are the one-bar change of %K and %D from the same Stochastic(14,1,3)', () => {
    const up = deriveStochSlopes(input(1).price);
    const dn = deriveStochSlopes(input(-1).price);
    expect(up.stochKSlope!).toBeGreaterThan(0);
    expect(up.stochDSlope!).toBeGreaterThan(0);
    expect(dn.stochKSlope!).toBeLessThan(0);
    expect(dn.stochDSlope!).toBeLessThan(0);
    expect(dn.stochKSlope).toBeCloseTo(-up.stochKSlope!, 3); // exact mirror
  });
  it('too little history or no highs/lows → null, never a default', () => {
    expect(deriveStochSlopes({ ...input(1).price, closes: input(1).price.closes.slice(-10), highs: input(1).price.highs!.slice(-10), lows: input(1).price.lows!.slice(-10) }))
      .toEqual({ stochKSlope: null, stochDSlope: null });
    expect(deriveStochSlopes(input(1, false).price)).toEqual({ stochKSlope: null, stochDSlope: null });
  });
});

describe('computeDVE with the slopes supplied', () => {
  it('no longer reports stochKSlope / stochDSlope as missing (data quality +6)', () => {
    const withSlopes = computeDVE(input(1), 'UP');
    const without = computeDVE(input(1, false), 'UP'); // no highs/lows → cannot derive (the old behaviour for every caller)
    expect(withSlopes.dataQuality.missing).not.toContain('stochKSlope');
    expect(withSlopes.dataQuality.missing).not.toContain('stochDSlope');
    expect(without.dataQuality.missing).toEqual(expect.arrayContaining(['stochKSlope', 'stochDSlope']));
    expect(withSlopes.dataQuality.score - without.dataQuality.score).toBe(6);
  });
  it('stochastic momentum reaches the full ±15, symmetrically long and short', () => {
    const up = computeDVE(input(1), 'UP').direction.components.stochasticMomentum;
    const dn = computeDVE(input(-1), 'DN').direction.components.stochasticMomentum;
    expect(up).toBe(15);
    expect(dn).toBe(-15);
    // Before: slopes absent → capped at ±9.
    const ind = input(1).indicators!;
    expect(computeStochasticMomentum({ ...ind, stochKSlope: null, stochDSlope: null })).toBe(9);
  });
  it('caller-supplied slopes are used as given', () => {
    const inp = input(1);
    const r = computeDVE({ ...inp, indicators: { ...inp.indicators, stochKSlope: -1, stochDSlope: -1 } }, 'GIVEN');
    expect(r.direction.components.stochasticMomentum).toBe(9 - 6); // spread +4, midline +5, both slopes −3
  });
});

describe('phase persistence: a missing or present slope does not bias contraction', () => {
  const vol = (bbwp: number): VolatilityState => ({ bbwp, bbwpSma5: bbwp + 1, regime: 'compression', regimeConfidence: 50, rateOfChange: 0, rateSmoothed: 0, acceleration: 0, rateDirection: 'flat', inSqueeze: false, squeezeStrength: 0 });
  const dir = (bias: 'bullish' | 'bearish' | 'neutral'): DirectionalPressure => ({ score: bias === 'bullish' ? 30 : bias === 'bearish' ? -30 : 0, bias, confidence: 30,
    components: { stochasticMomentum: 0, trendStructure: 0, optionsFlow: 0, volumeExpansion: 0, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 }, componentDetails: [] });
  const stats = (cur: number): ZoneDurationStats => ({ currentBars: cur, averageBars: 5, medianBars: 4, maxBars: 10, agePercentile: 30, episodeCount: 5 });
  const phase = (bbwp: number, bias: 'bullish' | 'bearish' | 'neutral', stochKSlope: number | null) =>
    computePhasePersistence({ bbwp, bbwpSma5: bbwp + 1, volatility: vol(bbwp), contractionStats: stats(2), expansionStats: stats(2), direction: dir(bias), stochK: 50, stochKSlope });

  it('contraction odds are the same with the slope missing, rising or falling (was +10 when missing or not rising)', () => {
    const base = phase(10, 'neutral', null).contraction;
    expect(phase(10, 'neutral', 2).contraction).toEqual(base);
    expect(phase(10, 'neutral', -2).contraction).toEqual(base);
    expect(base.continuationProbability).toBe(40 + 15 + 15 + 10 + 10); // base, sma5, young, neutral bias, flat rate
  });
  it('expansion uses the slope relative to the bias — mirrored exactly', () => {
    const bullWith = phase(95, 'bullish', 2).expansion;
    const bearWith = phase(95, 'bearish', -2).expansion;
    const bullAgainst = phase(95, 'bullish', -2).expansion;
    const bearAgainst = phase(95, 'bearish', 2).expansion;
    expect(bullWith).toEqual(bearWith);
    expect(bullAgainst).toEqual(bearAgainst);
    expect(bullWith.continuationProbability - bullAgainst.continuationProbability).toBe(10);
    expect(bullAgainst.exitProbability - bullWith.exitProbability).toBe(15);
  });
});
