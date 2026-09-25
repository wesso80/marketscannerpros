/**
 * Cautions on an otherwise eligible setup (Trade Checker v2 re-check, Sep 2026) + projected-target labelling.
 * Synthetic fixtures only (zig-zag uptrend and its mirror) with targeted feature overrides reproducing MU, FCX, ORCL, NKE.
 */
import { describe, expect, it } from 'vitest';
import {
  AT_OPPOSING_LEVEL, MOMENTUM_DISAGREES, SETUP_POLICY, canonicalLabel, cautionTags, computeFeatures, evaluateCanonical, evaluateSetup,
  momentumCaution, opposingLevelCaution, targetBasisLabel, type CanonicalFeatures,
} from '@/lib/scoring/canonical';
import { flipBars, zigzagTrend } from './fixtures/canonicalBars';

const up = computeFeatures(zigzagTrend());
const down = computeFeatures(flipBars(zigzagTrend()));
const A = up.atr;
const AD = down.atr;
const run = (features: CanonicalFeatures) => evaluateCanonical({ symbol: 'T', assetClass: 'equity', timeframe: 'daily', features });
const codes = (xs: Array<{ code: string }>) => xs.map((x) => x.code);

// Uptrend long with a clean stop 1 ATR below and a target 2 ATR above (R:R 2).
const longBase: CanonicalFeatures = { ...up, stopLowsBelow: [up.close - A], targetHighsAbove: [up.close + 2 * A], stopHighsAbove: [] };
const atHigh = (dist: number): Partial<CanonicalFeatures> => ({ targetHighsAbove: [up.close + dist * A, up.close + 2 * A] });
const atLow = (dist: number): Partial<CanonicalFeatures> => ({ targetLowsBelow: [down.close - dist * AD, down.close - 2 * AD] });
const shortBase: CanonicalFeatures = { ...down, stopHighsAbove: [down.close + AD], targetLowsBelow: [down.close - 2 * AD], stopLowsBelow: [] };

describe('AT_OPPOSING_LEVEL: entry within 0.5 ATR of a prior opposing swing', () => {
  it('long just under an unbroken swing high is "at resistance" (MU 0.09 ATR under 930.88; FCX 0.04 ATR under 72.28)', () => {
    for (const dist of [0.09, 0.04, 0.49]) {
      const r = opposingLevelCaution({ ...longBase, ...atHigh(dist) }, 1);
      expect(r?.code).toBe(AT_OPPOSING_LEVEL);
      expect(r?.message).toMatch(/^At resistance: entry is 0\.\d\d ATR below the prior swing high/);
    }
  });

  it('0.5 ATR or more away, or no unbroken swing high, is not a caution', () => {
    expect(opposingLevelCaution({ ...longBase, ...atHigh(0.51) }, 1)).toBeNull();
    expect(opposingLevelCaution({ ...longBase, ...atHigh(1.2) }, 1)).toBeNull();
    expect(opposingLevelCaution(longBase, 1)).toBeNull();
  });

  it('uses the nearest prior swing even if it was traded through intraday (MU/FCX: the entry bar wicked above it)', () => {
    // The stop's "unbroken" list would not contain the level; the prior-swing (target) list does.
    const f = { ...longBase, stopHighsAbove: [], targetHighsAbove: [up.close + 0.09 * A, up.close + 1.5 * A] };
    expect(opposingLevelCaution(f, 1)?.code).toBe(AT_OPPOSING_LEVEL);
    expect(opposingLevelCaution({ ...longBase, targetHighsAbove: [up.close + 0.7 * A, up.close + 0.2 * A].sort((a, b) => a - b) }, 1)).not.toBeNull();
  });

  it('the target still skips the level inside the noise and uses the next one out', () => {
    const r = run({ ...longBase, ...atHigh(0.09) });
    expect(r.levels?.target).toBeCloseTo(up.close + 2 * A, 8);
  });

  it('mirrors for shorts: short just above an unbroken swing low is "at support"', () => {
    const r = opposingLevelCaution({ ...shortBase, ...atLow(0.1) }, -1);
    expect(r?.code).toBe(AT_OPPOSING_LEVEL);
    expect(r?.message).toMatch(/^At support: entry is 0\.10 ATR above the prior swing low/);
    expect(opposingLevelCaution({ ...shortBase, ...atLow(0.8) }, -1)).toBeNull();
  });

  it('snapshot mode (no swings) never raises it', () => {
    expect(opposingLevelCaution({ ...longBase, mode: 'snapshot', ...atHigh(0.1) }, 1)).toBeNull();
  });

  it('default mode flags: the setup stays eligible with the caution attached; block mode makes it no setup', () => {
    const f = { ...longBase, ...atHigh(0.09) };
    const flagged = evaluateSetup(f, 'TREND_CONTINUATION', 'long');
    expect(SETUP_POLICY.atLevelMode).toBe('flag');
    expect(flagged.eligible).toBe(true);
    expect(codes(flagged.cautions ?? [])).toEqual([AT_OPPOSING_LEVEL]);
    const blocked = evaluateSetup(f, 'TREND_CONTINUATION', 'long', { cautionMode: { atLevel: 'block' } });
    expect(blocked.eligible).toBe(false);
    expect(blocked.ineligibleReason).toMatch(/^AT_OPPOSING_LEVEL: At resistance/);
    expect(blocked.cautions).toBeUndefined();
  });

  it('engine: WATCH with the reason, grade capped at C, label/tag "at resistance"', () => {
    const clean = run(longBase);
    expect(clean.permission).not.toBe('BLOCK');
    expect(codes(clean.watchReasons)).not.toContain(AT_OPPOSING_LEVEL);
    const r = run({ ...longBase, ...atHigh(0.09) });
    expect(r.permission).toBe('WATCH');
    expect(r.direction).toBe('long');
    expect(codes(r.watchReasons)).toContain(AT_OPPOSING_LEVEL);
    expect(r.grade).toBe('C');
    expect(cautionTags(r)).toEqual(['at resistance']);
    expect(canonicalLabel(r)).toMatch(/ · at resistance$/);
  });

  it('engine short: "at support", grade C', () => {
    const r = run({ ...shortBase, ...atLow(0.1) });
    expect(r.direction).toBe('short');
    expect(r.grade).toBe('C');
    expect(cautionTags(r)).toContain('at support');
  });
});

describe('MOMENTUM_DISAGREES: squeeze with DI or close-vs-EMA20 against its direction', () => {
  const tightUp: CanonicalFeatures = { ...longBase, bbwPercentile120: 8 };
  const tightDown: CanonicalFeatures = { ...shortBase, bbwPercentile120: 1 };

  it('long squeeze with −DI > +DI (MU, FCX) or close below EMA20 is flagged; agreeing momentum is not', () => {
    expect(momentumCaution({ ...tightUp, plusDI: 18, minusDI: 24 }, 1)?.message).toMatch(/long squeeze: −DI 24\.0 > \+DI 18\.0/);
    expect(momentumCaution({ ...tightUp, ema20: tightUp.close + 0.3 * A }, 1)?.message).toMatch(/close below EMA20/);
    expect(momentumCaution({ ...tightUp, plusDI: 30, minusDI: 12, ema20: tightUp.close - A }, 1)).toBeNull();
  });

  it('short squeeze with +DI > −DI and close above EMA20 (ORCL 31 Aug) lists both; symmetric to the long case', () => {
    const m = momentumCaution({ ...tightDown, plusDI: 26, minusDI: 20, ema20: tightDown.close - 0.4 * AD }, -1);
    expect(m?.code).toBe(MOMENTUM_DISAGREES);
    expect(m?.message).toMatch(/short squeeze: \+DI 26\.0 > −DI 20\.0, close above EMA20/);
    expect(momentumCaution({ ...tightDown, plusDI: 12, minusDI: 30, ema20: tightDown.close + AD }, -1)).toBeNull();
  });

  it('only squeezes are checked (trend/pullback already require DI agreement; pullbacks sit under EMA20 by design)', () => {
    const f = { ...longBase, ema20: longBase.close + 0.3 * A };
    const p = evaluateSetup(f, 'PULLBACK', 'long');
    expect(codes(p.cautions ?? [])).not.toContain(MOMENTUM_DISAGREES);
  });

  it('engine: squeeze long stays WATCH, grade C, tag "momentum disagrees"; block mode makes it no setup', () => {
    const f: CanonicalFeatures = { ...tightUp, ema20: tightUp.close + 0.2 * A };
    const s = evaluateSetup(f, 'SQUEEZE', 'long');
    expect(s.eligible).toBe(true);
    expect(codes(s.cautions ?? [])).toContain(MOMENTUM_DISAGREES);
    expect(evaluateSetup(f, 'SQUEEZE', 'long', { cautionMode: { momentum: 'block' } }).ineligibleReason).toMatch(/^MOMENTUM_DISAGREES/);
    // Isolate the squeeze: make trend/pullback ineligible so the engine has to pick it.
    const r = run({ ...f, adx: 12 });
    expect(r.setupType).toBe('SQUEEZE');
    expect(r.grade).toBe('C');
    expect(codes(r.watchReasons)).toContain(MOMENTUM_DISAGREES);
    expect(cautionTags(r)).toEqual(['momentum disagrees']);
  });

  it('a clean eligible setup outranks one carrying a caution', () => {
    // Both a clean trend-continuation long and a squeeze long with momentum against it are eligible.
    const r = run({ ...tightUp, ema20: tightUp.close + 0.2 * A, plusDI: 30, minusDI: 12 });
    expect(r.watchReasons.map((x) => x.code)).not.toContain(MOMENTUM_DISAGREES);
  });
});

describe('projected 2R target is labelled (NKE 32.07)', () => {
  it('flags PROJECTED_TARGET and labels the level "projected"', () => {
    const r = run({ ...longBase, targetHighsAbove: [] });
    expect(r.levels?.targetBasis).toBe('projected');
    expect(codes(r.flags)).toContain('PROJECTED_TARGET');
    expect(r.flags.find((x) => x.code === 'PROJECTED_TARGET')?.message).toMatch(/is projected \(entry ± 2R\): no opposing swing in the lookback — not a chart level/);
    expect(targetBasisLabel(r.levels)).toBe('projected 2R (no swing level)');
  });

  it('swing and EMA20 targets are labelled as such; no projected flag', () => {
    const r = run(longBase);
    expect(targetBasisLabel(r.levels)).toBe('swing level');
    expect(codes(r.flags)).not.toContain('PROJECTED_TARGET');
    expect(targetBasisLabel({ targetBasis: 'ema20', riskReward: 1.4 })).toBe('EMA20');
    expect(targetBasisLabel(null)).toBe('');
  });
});

describe('display: caution tags', () => {
  it('pre-change stored results (no watchReasons codes) show no tags; BLOCK labels never show them', () => {
    expect(cautionTags({ direction: 'long', watchReasons: [] })).toEqual([]);
    expect(cautionTags(null)).toEqual([]);
    expect(cautionTags({ direction: 'short', watchReasons: [{ code: AT_OPPOSING_LEVEL }, { code: MOMENTUM_DISAGREES }] })).toEqual(['at support', 'momentum disagrees']);
    expect(canonicalLabel({ permission: 'BLOCK', grade: 'F', setupType: 'NONE', direction: 'long', watchReasons: [{ code: AT_OPPOSING_LEVEL, message: '' }] })).toBe('BLOCK · F · No setup');
  });
});
