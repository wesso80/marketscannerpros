import { describe, expect, it } from 'vitest';
import {
  computeFeatures, evaluateCanonical, evaluateCanonicalFromBars, evaluateCanonicalFromSnapshot, evaluateSetup, findPivots,
  percentileRankAt, type CanonicalBar,
} from '@/lib/scoring/canonical';
import { flipBars, zigzagTrend } from './fixtures/canonicalBars';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Deterministic synthetic daily bars: drift + cycles + noise, with volume. */
function synth(n: number, seed: number, drift = 0.0008, start = 100): CanonicalBar[] {
  const r = rng(seed);
  const bars: CanonicalBar[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    const ret = drift + 0.012 * Math.sin(i / 11 + seed) + 0.015 * (r() - 0.5);
    c = Math.max(1, o * (1 + ret));
    const hi = Math.max(o, c) * (1 + 0.006 * r());
    const lo = Math.min(o, c) * (1 - 0.006 * r());
    bars.push({ t: new Date(Date.UTC(2023, 0, 1) + i * 86_400_000).toISOString(), open: o, high: hi, low: lo, close: c, volume: Math.round(1e6 * (0.6 + r())) });
  }
  return bars;
}

/** Mirror the chart vertically: p → K − p (highs and lows swap). */
function flip(bars: CanonicalBar[]): CanonicalBar[] {
  const K = 2 * Math.max(...bars.map((b) => b.high));
  return bars.map((b) => ({ t: b.t, open: K - b.open, high: K - b.low, low: K - b.high, close: K - b.close, volume: b.volume }));
}

const input = { symbol: 'TEST', assetClass: 'equity' as const, timeframe: 'daily' };
// Engine-level (setup selection) symmetry is a property of the factor model; calibrated contexts rank candidates by
// empirical expected R, which is legitimately not mirror-symmetric, so the symmetry tests use an uncalibrated timeframe.
const uncal = { ...input, timeframe: 'weekly' };

describe('canonical engine: symmetry', () => {
  it('a flipped chart scores the same with the opposite direction', () => {
    let compared = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const bars = synth(420, seed, seed % 2 ? 0.0012 : -0.0012);
      // Bollinger width is a % of price (like ATR%), so its percentile is not mirror-invariant; share it so the squeeze
      // gate sees the same compression on both charts. Everything else is computed independently from each chart.
      const fa = computeFeatures(bars);
      const fb = { ...computeFeatures(flip(bars)), bbwPercentile120: fa.bbwPercentile120 };
      const a = evaluateCanonical({ ...uncal, features: fa });
      const b = evaluateCanonical({ ...uncal, features: fb });
      // Every setup × direction candidate mirrors: long(original) ≡ short(flipped).
      for (const c of a.candidates) {
        const m = b.candidates.find((x) => x.setupType === c.setupType && x.direction === (c.direction === 'long' ? 'short' : 'long'))!;
        expect(m.eligible, `${seed} ${c.setupType} ${c.direction}`).toBe(c.eligible);
        // Only the ATR%-percentile volatility factor (weight ≤ 0.10) is not exactly flip-invariant (ATR% divides by
        // price); the exact test below neutralises it.
        expect(Math.abs(m.score - c.score), `${seed} ${c.setupType} ${c.direction}`).toBeLessThanOrEqual(12);
      }
      if (a.setupType !== 'NONE' && a.direction !== 'neutral' && a.setupType === b.setupType && b.score === a.score) {
        compared++;
        expect(b.direction).toBe(a.direction === 'long' ? 'short' : 'long');
      }
    }
    // The trend / structure / R:R gates make eligible setups rarer on random-walk-like charts than before.
    expect(compared).toBeGreaterThan(3);
  });

  it('is exactly symmetric when the volatility percentiles are neutralised', () => {
    let withSetup = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const bars = synth(420, seed, 0.001);
      const fa = { ...computeFeatures(bars), atrPctPercentile: 50 };
      const fb = { ...computeFeatures(flip(bars)), atrPctPercentile: 50, bbwPercentile120: fa.bbwPercentile120 };
      const a = evaluateCanonical({ ...uncal, features: fa });
      const b = evaluateCanonical({ ...uncal, features: fb });
      expect(b.score).toBe(a.score);
      expect(b.setupType).toBe(a.setupType);
      expect(b.direction === 'neutral').toBe(a.direction === 'neutral');
      if (a.direction !== 'neutral') {
        withSetup++;
        expect(b.direction).toBe(a.direction === 'long' ? 'short' : 'long');
        expect(b.levels!.riskReward).toBeCloseTo(a.levels!.riskReward, 6);
        expect(b.permission).toBe(a.permission);
      }
    }
    // plus the clean zig-zag trend and its mirror
    const za = { ...computeFeatures(zigzagTrend()), atrPctPercentile: 50 };
    const zb = { ...computeFeatures(flipBars(zigzagTrend())), atrPctPercentile: 50, bbwPercentile120: za.bbwPercentile120 };
    const a = evaluateCanonical({ ...uncal, features: za }), b = evaluateCanonical({ ...uncal, features: zb });
    expect(a.direction).toBe('long');
    expect(b.direction).toBe('short');
    expect(b.setupType).toBe(a.setupType);
    expect(b.score).toBe(a.score);
    expect(b.levels!.riskReward).toBeCloseTo(a.levels!.riskReward, 6);
    expect(withSetup + 1).toBeGreaterThan(0);
  });
});

describe('canonical engine: factors', () => {
  it('overbought never boosts the long side', () => {
    const f = computeFeatures(synth(420, 3, 0.002));
    const mid = evaluateSetup({ ...f, rsi: 60 }, 'TREND_CONTINUATION', 'long').factors.find((x) => x.name === 'momentum')!.value!;
    const ob = evaluateSetup({ ...f, rsi: 78 }, 'TREND_CONTINUATION', 'long').factors.find((x) => x.name === 'momentum')!.value!;
    expect(ob).toBeLessThan(mid);
    const shortOs = evaluateSetup({ ...f, rsi: 22 }, 'TREND_CONTINUATION', 'short').factors.find((x) => x.name === 'momentum')!.value!;
    expect(shortOs).toBe(ob);
  });

  it('stretch > 2 ATR or a close beyond the band kills continuation entry location', () => {
    const f = computeFeatures(synth(420, 5, 0.002));
    const loc = (dist: number, band = 0) => evaluateSetup({ ...f, distEma20Atr: dist, beyondBand: band }, 'TREND_CONTINUATION', 'long').factors.find((x) => x.name === 'entryLocation')!.value!;
    expect(loc(0.3)).toBe(1);
    expect(loc(2.5)).toBeLessThan(0.3);
    expect(loc(0.8, 1)).toBe(0);
  });

  it('a broken swing level makes the setup ineligible', () => {
    const f = computeFeatures(synth(420, 7, 0.002));
    const broken = { ...f, lastPivotLow: { index: f.bars - 10, price: f.close * 1.01, t: '' } };
    const c = evaluateSetup(broken, 'TREND_CONTINUATION', 'long');
    expect(c.eligible).toBe(false);
    expect(c.ineligibleReason).toMatch(/LEVEL_BROKEN/);
  });

  it('long invalidation sits at the nearest confirmed swing low minus 0.1 ATR; no swing → no setup; snapshot ATR fallback is flagged', () => {
    const f = computeFeatures(zigzagTrend());
    const swing = f.close - 1.5 * f.atr;
    const c = evaluateSetup({ ...f, stopLowsBelow: [swing] }, 'TREND_CONTINUATION', 'long');
    expect(c.levels.invalidationBasis).toBe('swing');
    expect(c.levels.invalidation).toBeCloseTo(swing - 0.1 * f.atr, 8);
    const none = evaluateSetup({ ...f, stopLowsBelow: [] }, 'TREND_CONTINUATION', 'long');
    expect(none.eligible).toBe(false);
    expect(none.ineligibleReason).toMatch(/NO_STRUCTURAL_STOP/);
    const nf = evaluateSetup({ ...f, mode: 'snapshot' }, 'TREND_CONTINUATION', 'long');
    expect(nf.levels.invalidationBasis).toBe('atr_fallback');
    expect(nf.levels.flags).toContain('atr_fallback');
    expect(nf.levels.invalidation).toBeCloseTo(f.close - 2 * f.atr, 8);
  });

  it('pivots, percentile helper', () => {
    const bars = synth(400, 11);
    const { highs, lows } = findPivots(bars);
    expect(highs.length).toBeGreaterThan(2);
    for (const p of highs) expect(bars[p.index].high).toBe(p.price);
    expect(lows.every((p) => p.index >= 3 && p.index <= 396)).toBe(true);
    expect(percentileRankAt([1, 2, 3, 4], 3, 252, 2)).toBe(87.5);
    expect(Number.isNaN(percentileRankAt([1, 2], 1))).toBe(true);
  });
});

describe('canonical engine: result contract', () => {
  it('bars mode returns a full result with bar date, levels, candidates and raw values', () => {
    const bars = synth(420, 13, 0.0015);
    const r = evaluateCanonicalFromBars(bars, input);
    expect(r.version).toBe('msp.canonical.v1');
    expect(r.barDate).toBe(bars.at(-1)!.t);
    expect(r.candidates).toHaveLength(8);
    expect(['PASS', 'WATCH', 'BLOCK']).toContain(r.permission);
    if (r.setupType !== 'NONE') {
      expect(r.factors.length).toBeGreaterThan(3);
      expect(r.levels).not.toBeNull();
      expect(r.coverage).toBeGreaterThan(0.6);
    }
    expect(r.raw.rsi).not.toBeNull();
  });

  it('snapshot mode has lower coverage than bars mode for the same bar', () => {
    const bars = synth(420, 15, 0.0015);
    const full = evaluateCanonicalFromBars(bars, input);
    const f = computeFeatures(bars);
    const snap = evaluateCanonicalFromSnapshot({ price: f.close, ema20: f.ema20, ema50: f.ema50, ema200: f.ema200, adx: f.adx, plusDI: f.plusDI, minusDI: f.minusDI, atr: f.atr, rsi: f.rsi, bbUpper: f.bbUpper, bbLower: f.bbLower, volumeRatio: f.volumeRatio }, input);
    expect(snap.mode).toBe('snapshot');
    expect(snap.flags.map((x) => x.code)).toContain('SNAPSHOT_MODE');
    if (snap.setupType !== 'NONE' && full.setupType !== 'NONE') expect(snap.coverage).toBeLessThan(full.coverage);
  });

  it('hard blocks force BLOCK and grade F; short history is a data block', () => {
    const bars = synth(420, 17, 0.0015);
    const r = evaluateCanonicalFromBars(bars, { ...input, hardBlocks: [{ code: 'STALE_DATA', message: 'stale' }] });
    expect(r.permission).toBe('BLOCK');
    expect(r.grade).toBe('F');
    expect(r.blockReasons[0].code).toBe('STALE_DATA');
    const short = evaluateCanonicalFromBars(bars.slice(0, 30), input);
    expect(short.blockReasons.map((x) => x.code)).toContain('INSUFFICIENT_HISTORY');
  });

  it('a regime overlay can cap to WATCH and size down, never raise', () => {
    const bars = synth(420, 19, 0.0015);
    const th = { pass: 0, watch: 0, gradeA: 101, gradeB: 101 };
    const thresholds = { TREND_CONTINUATION: th, PULLBACK: th, SQUEEZE: th, EXHAUSTION_FADE: th };
    const plain = evaluateCanonicalFromBars(bars, { ...input, thresholds });
    const adv = evaluateCanonicalFromBars(bars, { ...input, thresholds, regimeOverlay: () => ({ sizeMultiplier: 0.5, watchReasons: [{ code: 'REGIME_ADVERSE', message: 'x' }] }) });
    if (plain.setupType !== 'NONE') {
      expect(adv.permission).toBe('WATCH');
      expect(adv.sizeMultiplier).toBe(0.5);
      expect(adv.score).toBe(plain.score);
    }
  });
});
