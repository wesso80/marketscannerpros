/**
 * Setup classification + structural levels (fix-forward after the Trade Checker spot-check, Sep 2026).
 * Synthetic fixtures only: a zig-zag uptrend (test/fixtures/canonicalBars) and targeted feature overrides that
 * reproduce each reported case (V, TSLA, MCD, ETH, MDT, ADA, ETC, ORCL, XLP, XRP, MU, HYG, UPS/BNB, ABT, DOGE).
 */
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_MIN_RR, SETUP_POLICY, computeFeatures, evaluateCanonical, evaluateSetup, fadeLevels, structuralLevels, trendBias, trendGate,
  type CanonicalBar, type CanonicalFeatures,
} from '@/lib/scoring/canonical';
import { flipBars, zigzagTrend } from './fixtures/canonicalBars';

const up = computeFeatures(zigzagTrend());
const down = computeFeatures(flipBars(zigzagTrend()));
const A = up.atr;
const reasonOf = (f: CanonicalFeatures, s: Parameters<typeof evaluateSetup>[1], d: 'long' | 'short') => evaluateSetup(f, s, d).ineligibleReason ?? 'ELIGIBLE';

describe('fixture sanity', () => {
  it('the zig-zag is an established uptrend with a confirmed swing low 0.5–3 ATR below; its mirror is a downtrend', () => {
    expect(up.adx).toBeGreaterThanOrEqual(20);
    expect(up.plusDI).toBeGreaterThan(up.minusDI);
    expect(up.close).toBeGreaterThan(up.sma200);
    expect(up.sma200Slope).toBeGreaterThan(0);
    const risk = up.close - up.stopLowsBelow[0];
    expect(risk / A).toBeGreaterThan(0.5);
    expect(risk / A).toBeLessThan(3);
    expect(trendGate(up, 1)).toBeNull();
    expect(trendGate(down, -1)).toBeNull();
    expect(trendBias(up)).toBeGreaterThanOrEqual(SETUP_POLICY.squeezeMinBias);
    expect(trendBias(down)).toBeLessThanOrEqual(-SETUP_POLICY.squeezeMinBias);
  });
});

describe('trend continuation needs an established trend on its side', () => {
  it('eligible long in the uptrend, eligible short in the mirrored downtrend, never the other way', () => {
    expect(reasonOf(up, 'TREND_CONTINUATION', 'long')).toBe('ELIGIBLE');
    expect(reasonOf(down, 'TREND_CONTINUATION', 'short')).toBe('ELIGIBLE');
    expect(reasonOf(up, 'TREND_CONTINUATION', 'short')).not.toBe('ELIGIBLE');
    expect(reasonOf(down, 'TREND_CONTINUATION', 'long')).not.toBe('ELIGIBLE');
  });

  it('ADX below 20 is no trend (V 14.8, MCD 16.2, XLP 11.9)', () => {
    for (const adx of [14.8, 16.2, 11.9, 19.99]) {
      expect(reasonOf({ ...up, adx }, 'TREND_CONTINUATION', 'long')).toMatch(/no established trend \(ADX/);
      expect(reasonOf({ ...down, adx }, 'TREND_CONTINUATION', 'short')).toMatch(/no established trend/);
    }
    expect(reasonOf({ ...up, adx: 20 }, 'TREND_CONTINUATION', 'long')).toBe('ELIGIBLE');
  });

  it('DI against the direction is counter-trend (V long with −DI > +DI; TSLA short with +DI > −DI)', () => {
    expect(reasonOf({ ...up, plusDI: 18, minusDI: 22 }, 'TREND_CONTINUATION', 'long')).toMatch(/counter-trend: −DI ≥ \+DI/);
    expect(reasonOf({ ...down, plusDI: 24, minusDI: 20 }, 'TREND_CONTINUATION', 'short')).toMatch(/counter-trend: \+DI ≥ −DI/);
  });

  it('price on the wrong side of SMA200, or SMA200 sloping against the trade, is counter-trend', () => {
    expect(reasonOf({ ...up, sma200: up.close + A }, 'TREND_CONTINUATION', 'long')).toMatch(/counter-trend: price below SMA200/);
    expect(reasonOf({ ...up, sma200Slope: -0.5 }, 'TREND_CONTINUATION', 'long')).toMatch(/counter-trend: SMA200 falling/);
    expect(reasonOf({ ...down, sma200Slope: 0.5 }, 'TREND_CONTINUATION', 'short')).toMatch(/counter-trend: SMA200 rising/);
    expect(reasonOf({ ...up, sma200: Number.NaN, sma200Slope: Number.NaN }, 'TREND_CONTINUATION', 'long')).toMatch(/no SMA200/);
  });

  it('a no-setup result says why (counter-trend is visible, not a blank)', () => {
    const r = evaluateCanonical({ symbol: 'T', assetClass: 'equity', timeframe: 'daily', features: { ...up, plusDI: 15, minusDI: 30 } });
    expect(r.setupType).toBe('NONE');
    expect(r.permission).toBe('BLOCK');
    expect(r.blockReasons[0].code).toBe('NO_SETUP');
    expect(r.blockReasons[0].message).toMatch(/closest: .*counter-trend/);
  });
});

describe('pullback needs the same established same-direction trend', () => {
  // A 1.5-ATR dip to EMA20 inside the uptrend: a textbook pullback long.
  const dip: CanonicalFeatures = { ...up, high10: up.close + 1.5 * A, distEma20Atr: -0.3, distEma50Atr: 0.8 };
  it('eligible with the trend; blocked by the trend gate otherwise (XLP ADX 11.9; ADA short above SMA200 with +DI dominant)', () => {
    expect(reasonOf(dip, 'PULLBACK', 'long')).toBe('ELIGIBLE');
    expect(reasonOf({ ...dip, adx: 11.9 }, 'PULLBACK', 'long')).toMatch(/no established trend/);
    expect(reasonOf({ ...dip, plusDI: 10, minusDI: 20 }, 'PULLBACK', 'long')).toMatch(/counter-trend/);
    // ADA: short pullback while price is above SMA200 and +DI leads — whatever the EMA stack says, it is not a short.
    const ada: CanonicalFeatures = { ...down, low10: down.close - 1.5 * A, distEma20Atr: 0.3, distEma50Atr: -0.8, sma200: down.close - 2 * A, plusDI: 28, minusDI: 18 };
    expect(reasonOf(ada, 'PULLBACK', 'short')).toMatch(/counter-trend/);
  });
});

describe('squeeze: real compression, direction from trend/structure (never a default short)', () => {
  const tight: CanonicalFeatures = { ...up, bbwPercentile120: 8 };
  it('no compression above the 20th percentile (ETC 57th, XRP 33rd); eligible at or below it', () => {
    for (const p of [57, 33, 20.5]) {
      expect(reasonOf({ ...up, bbwPercentile120: p }, 'SQUEEZE', 'long')).toMatch(/no compression/);
      expect(reasonOf({ ...up, bbwPercentile120: p }, 'SQUEEZE', 'short')).toMatch(/no compression/);
    }
    expect(reasonOf({ ...up, bbwPercentile120: 20 }, 'SQUEEZE', 'long')).toBe('ELIGIBLE');
  });

  it('an uptrend squeeze is long only (ETH: ADX 50, +DI 35 vs −DI 11 above a rising SMA200; MDT bullish stack)', () => {
    expect(reasonOf(tight, 'SQUEEZE', 'long')).toBe('ELIGIBLE');
    expect(reasonOf(tight, 'SQUEEZE', 'short')).toMatch(/squeeze direction: trend\/structure points long .* not a short/);
    const eth: CanonicalFeatures = { ...tight, adx: 50, plusDI: 35, minusDI: 11 };
    expect(reasonOf(eth, 'SQUEEZE', 'short')).not.toBe('ELIGIBLE');
  });

  it('a downtrend squeeze is short only (ORCL: long below a falling SMA200 with a bearish stack is refused)', () => {
    const orcl: CanonicalFeatures = { ...down, bbwPercentile120: 1 };
    expect(reasonOf(orcl, 'SQUEEZE', 'long')).toMatch(/points short/);
    expect(reasonOf(orcl, 'SQUEEZE', 'short')).toBe('ELIGIBLE');
  });

  it('a split trend/structure vote gives no squeeze direction at all (HYG) — neither side is picked', () => {
    // close above a falling SMA200 (+1 −1), bullish EMA20/50 but bearish EMA50/200 (+1 −1), +DI leads, structure down (+1 −1)
    const split: CanonicalFeatures = { ...tight, sma200: tight.close - A, sma200Slope: -0.3, ema20: 101, ema50: 100, ema200: 102, plusDI: 20, minusDI: 15, structure: 'down' };
    expect(trendBias(split)).toBe(0);
    expect(reasonOf(split, 'SQUEEZE', 'long')).toMatch(/split/);
    expect(reasonOf(split, 'SQUEEZE', 'short')).toMatch(/split/);
  });
});

describe('invalidation = nearest confirmed swing beyond price ± 0.1 ATR (no floors, no bar-own extremes)', () => {
  const close = up.close;
  it('skips a swing inside the noise for the next real one — never an artificial 0.5-ATR floor (MU: 887.61, not 901.89)', () => {
    const near = close - 0.16 * A, real = close - 0.9 * A;
    const lv = structuralLevels({ ...up, stopLowsBelow: [near, real] }, 1)!;
    expect(lv.invalidationBasis).toBe('swing');
    expect(lv.invalidation).toBeCloseTo(real - SETUP_POLICY.swingBufferAtr * A, 10);
    expect(lv.flags).not.toContain('min_risk_widened');
    // nothing sits exactly 0.5 ATR away unless a swing is there
    expect(Math.abs(close - lv.invalidation - 0.5 * A)).toBeGreaterThan(1e-6);
  });

  it('no confirmed swing within 3 ATR → no structural stop → no setup (ETC 4 ATR, ABT 4.6 ATR); never entry ± ATR', () => {
    for (const far of [4, 4.6]) {
      const f = { ...up, stopLowsBelow: [close - far * A] };
      expect(structuralLevels(f, 1)).toBeNull();
      expect(reasonOf(f, 'TREND_CONTINUATION', 'long')).toMatch(/NO_STRUCTURAL_STOP/);
    }
    expect(structuralLevels({ ...up, stopLowsBelow: [] }, 1)).toBeNull();
  });

  it('shorts mirror longs: nearest confirmed swing high above + 0.1 ATR', () => {
    const lv = structuralLevels({ ...down, stopHighsAbove: [down.close + 0.2 * down.atr, down.close + 1.2 * down.atr] }, -1)!;
    expect(lv.invalidation).toBeCloseTo(down.close + 1.3 * down.atr, 10);
  });

  it('stop candidates are confirmed 3-bar pivots, nearest first, that later bars have not traded through', () => {
    const bars: CanonicalBar[] = zigzagTrend();
    const f0 = computeFeatures(bars);
    const lows = f0.stopLowsBelow;
    expect(lows.length).toBeGreaterThan(1);
    for (let i = 1; i < lows.length; i++) expect(lows[i]).toBeLessThan(lows[i - 1]);
    for (const p of lows) expect(p).toBeLessThan(f0.close);
    // Undercut the nearest swing low one bar before the signal bar: it is no longer valid structure.
    const k = bars.findIndex((b) => b.low === lows[0]);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThanOrEqual(bars.length - 4); // confirmed: at least 3 bars after it
    const cut = bars.map((b, i) => (i === bars.length - 2 ? { ...b, low: lows[0] * 0.999 } : b));
    expect(computeFeatures(cut).stopLowsBelow).not.toContain(lows[0]);
  });

  it('snapshot mode (no bars) keeps a flagged 2-ATR fallback — the only non-structural stop', () => {
    const snap: CanonicalFeatures = { ...up, mode: 'snapshot', stopLowsBelow: [], targetHighsAbove: [] };
    const lv = structuralLevels(snap, 1)!;
    expect(lv.invalidationBasis).toBe('atr_fallback');
    expect(lv.flags).toContain('atr_fallback');
  });
});

describe('target = nearest real opposing level; absurd geometry is not a setup', () => {
  const close = up.close;
  const withStop = (extra: Partial<CanonicalFeatures>) => ({ ...up, stopLowsBelow: [close - 1 * A], ...extra });
  it('nearest opposing swing at least 0.5 ATR away (MU: 930.88 inside the noise → 989.96, never the farther 1011.77)', () => {
    const lv = structuralLevels(withStop({ targetHighsAbove: [close + 0.1 * A, close + 1.5 * A, close + 1.9 * A] }), 1)!;
    expect(lv.targetBasis).toBe('opposing_level');
    expect(lv.target).toBeCloseTo(close + 1.5 * A, 10);
  });

  it('no opposing swing in the lookback → projected 2R, flagged', () => {
    const lv = structuralLevels(withStop({ targetHighsAbove: [] }), 1)!;
    expect(lv.targetBasis).toBe('projected');
    expect(lv.flags).toContain('projected_target');
    expect(lv.riskReward).toBe(2);
  });

  it(`reward:risk below ${CANONICAL_MIN_RR} is not a setup (UPS/BNB target 0.37 ATR → R:R 0.11; ETC/ABT far stops)`, () => {
    const f = withStop({ stopLowsBelow: [close - 2.5 * A], targetHighsAbove: [close + 0.6 * A] });
    const c = evaluateSetup(f, 'TREND_CONTINUATION', 'long');
    expect(c.eligible).toBe(false);
    expect(c.ineligibleReason).toMatch(/^RR_BELOW_MIN: structural reward:risk 0\.2/);
    // research replays can switch the minimum off to measure it
    expect(evaluateSetup(f, 'TREND_CONTINUATION', 'long', { minRR: 0 }).eligible).toBe(true);
    const r = evaluateCanonical({ symbol: 'T', assetClass: 'equity', timeframe: 'daily', features: f });
    expect(r.levels === null || r.levels.riskReward >= CANONICAL_MIN_RR || r.levels.targetBasis !== 'opposing_level').toBe(true);
  });
});

describe('exhaustion-fade levels', () => {
  // Stretched far above EMA20 with RSI > 70 in the last 5 bars → a fade-short candidate.
  const hot: CanonicalFeatures = { ...up, distEma20Atr: 3, beyondBand: 1, rsiMax5: 76, rsi: 70, ema20: up.close - 3 * A };
  it('invalidation above the prior-bar exhaustion high + 0.1 ATR, target back at EMA20', () => {
    const lv = fadeLevels({ ...hot, exhaustionHigh: hot.close + 1.2 * A, stopHighsAbove: [] }, -1)!;
    expect(lv.invalidationBasis).toBe('recent_extreme');
    expect(lv.invalidation).toBeCloseTo(hot.close + 1.3 * A, 10);
    expect(lv.targetBasis).toBe('ema20');
  });

  it('never the signal bar\'s own extreme, never entry + 1 ATR (DOGE/XRP): no prior extreme and no swing → no setup', () => {
    const f = { ...hot, exhaustionHigh: Number.NaN, stopHighsAbove: [] };
    expect(fadeLevels(f, -1)).toBeNull();
    expect(reasonOf(f, 'EXHAUSTION_FADE', 'short')).toMatch(/NO_STRUCTURAL_STOP/);
    const withSwing = fadeLevels({ ...f, stopHighsAbove: [hot.close + 2 * A] }, -1)!;
    expect(withSwing.invalidationBasis).toBe('swing');
    expect(withSwing.invalidation).toBeCloseTo(hot.close + 2.1 * A, 10);
  });

  it('computeFeatures: the exhaustion extreme is only set when a bar before the signal bar printed it', () => {
    const bars = zigzagTrend();
    const last = bars[bars.length - 1];
    // Signal bar makes the 5-bar high itself → NaN
    const f1 = computeFeatures([...bars.slice(0, -1), { ...last, high: last.high * 1.05 }]);
    expect(Number.isNaN(f1.exhaustionHigh)).toBe(true);
    // A prior bar printed a higher high that the signal bar stayed under → that high
    const spike = bars.length - 3;
    const b2 = bars.map((b, i) => (i === spike ? { ...b, high: b.high * 1.08 } : b));
    const f2 = computeFeatures(b2);
    expect(f2.exhaustionHigh).toBeCloseTo(b2[spike].high, 10);
  });
});
