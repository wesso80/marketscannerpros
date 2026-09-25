import { describe, expect, it } from 'vitest';
import { SETUP_TYPES, computeFeatures, evaluateCanonical, evaluateCanonicalFromSnapshot, type CanonicalBar } from '@/lib/scoring/canonical';
import { agreeingMspScore, compareCanonicalRows } from '@/lib/scoring/canonical/scannerAdapter';
import { SNAPSHOT_GRADE_MAX } from '@/lib/scoring/canonical/thresholds';
import { zigzagTrend } from './fixtures/canonicalBars';

// Same clean structural long as test/canonicalThresholds (drop the zig-zag high inside the target noise band).
const bars: CanonicalBar[] = zigzagTrend();
const raw = computeFeatures(bars);
const features = { ...raw, targetHighsAbove: raw.targetHighsAbove.filter((p) => p - raw.close >= 0.5 * raw.atr) };
// Thresholds low enough that any setup with a valid reward:risk and no caution grades A.
const easyA = Object.fromEntries(SETUP_TYPES.map((s) => [s, { pass: 0, watch: 0, gradeA: 0, gradeB: 0 }]));
const input = { symbol: 'X', assetClass: 'equity' as const, timeframe: '1h' as const, thresholds: easyA };

describe('snapshot grade cap', () => {
  it('caps a snapshot-mode A at B and flags SNAPSHOT_GRADE_CAP; score and permission are unchanged', () => {
    const snap = evaluateCanonicalFromSnapshot({
      price: raw.close, ema20: raw.ema20, ema50: raw.ema50, ema200: raw.ema200, adx: raw.adx, plusDI: raw.plusDI,
      minusDI: raw.minusDI, atr: raw.atr, rsi: raw.rsi, bbUpper: raw.bbUpper, bbLower: raw.bbLower, volumeRatio: raw.volumeRatio,
    }, input);
    expect(snap.mode).toBe('snapshot');
    expect(snap.setupType).not.toBe('NONE');
    expect(snap.permission).not.toBe('BLOCK');
    expect(SNAPSHOT_GRADE_MAX).toBe('B');
    expect(snap.grade).toBe('B');
    const cap = snap.flags.find((f) => f.code === 'SNAPSHOT_GRADE_CAP');
    expect(cap).toEqual({ code: 'SNAPSHOT_GRADE_CAP', message: 'Capped at B: snapshot data, no swing structure' });
    // The flag is only pushed when the uncapped grade was A, so its presence proves the cap changed A → B.
  });

  it('leaves a bars-mode A as A with no cap flag', () => {
    const r = evaluateCanonical({ ...input, features });
    expect(r.mode).toBe('bars');
    expect(r.grade).toBe('A');
    expect(r.flags.map((f) => f.code)).not.toContain('SNAPSHOT_GRADE_CAP');
  });

  it('does not flag a snapshot row that was not an A', () => {
    const hard = Object.fromEntries(SETUP_TYPES.map((s) => [s, { pass: 0, watch: 0, gradeA: 101, gradeB: 0 }]));
    const r = evaluateCanonical({ ...input, thresholds: hard, features: { ...features, mode: 'snapshot' } });
    expect(r.grade).not.toBe('A');
    expect(r.flags.map((f) => f.code)).not.toContain('SNAPSHOT_GRADE_CAP');
  });
});

type Dir = 'long' | 'short' | 'neutral';
type MspDir = 'bullish' | 'bearish' | 'neutral';
const row = (symbol: string, o: { grade?: 'A' | 'B' | 'C'; dir?: Dir; score?: number; factor?: number; msp?: number | null; mspDir?: MspDir }) => ({
  symbol,
  canonical: {
    permission: 'WATCH' as const, grade: o.grade ?? 'B', score: o.score ?? 50, factorScore: o.factor ?? o.score ?? 50,
    direction: o.dir ?? 'long', blockReasons: [],
  },
  compositeV2: o.msp === null ? null : { composite: o.msp ?? 0, direction: o.mspDir ?? 'neutral' },
});
const order = (rows: ReturnType<typeof row>[]) => [...rows].sort(compareCanonicalRows).map((r) => r.symbol);

describe('agreeing MSP tie-break', () => {
  it('agreeingMspScore counts the MSP composite only when it points the same way as the setup', () => {
    expect(agreeingMspScore(row('A', { dir: 'long', msp: 70, mspDir: 'bullish' }))).toBe(70);
    expect(agreeingMspScore(row('A', { dir: 'short', msp: 70, mspDir: 'bearish' }))).toBe(70);
    expect(agreeingMspScore(row('A', { dir: 'long', msp: 70, mspDir: 'bearish' }))).toBe(0);
    expect(agreeingMspScore(row('A', { dir: 'short', msp: 70, mspDir: 'bullish' }))).toBe(0);
    expect(agreeingMspScore(row('A', { dir: 'long', msp: 70, mspDir: 'neutral' }))).toBe(0);
    expect(agreeingMspScore(row('A', { dir: 'neutral', msp: 70, mspDir: 'bullish' }))).toBe(0);
    expect(agreeingMspScore(row('A', { dir: 'long', msp: null }))).toBe(0);
    expect(agreeingMspScore({ canonical: null })).toBe(0);
  });

  it('within a grade, ranks by agreeing MSP before the setup score; disagreeing/neutral MSP counts 0', () => {
    const rows = [
      row('HISETUP', { score: 90, msp: 6, mspDir: 'bullish' }),       // high setup score, weak MSP (PFE-like)
      row('AGREE', { score: 60, msp: 72, mspDir: 'bullish' }),
      row('DISAGREE', { score: 70, msp: 95, mspDir: 'bearish' }),     // strong MSP the other way → 0
      row('NEUTRAL', { score: 80, msp: 99, mspDir: 'neutral' }),      // neutral MSP → 0
    ];
    expect(order(rows)).toEqual(['AGREE', 'HISETUP', 'NEUTRAL', 'DISAGREE']);
  });

  it('grade still ranks before MSP', () => {
    expect(order([row('B_HIGHMSP', { grade: 'B', msp: 99, mspDir: 'bullish' }), row('A_NOMSP', { grade: 'A', msp: 0 })]))
      .toEqual(['A_NOMSP', 'B_HIGHMSP']);
  });

  it('falls through to setup score, factor score, then symbol', () => {
    expect(order([row('LOW', { score: 40 }), row('HIGH', { score: 60 })])).toEqual(['HIGH', 'LOW']);
    expect(order([row('F1', { score: 50, factor: 40 }), row('F2', { score: 50, factor: 60 })])).toEqual(['F2', 'F1']);
    expect(order([row('ZZZ', {}), row('AAA', {})])).toEqual(['AAA', 'ZZZ']);
  });

  it('is symmetric: mirrored short/bearish rows order exactly like their long/bullish originals', () => {
    const longs = [
      row('P', { score: 90, msp: 6, mspDir: 'bullish' }),
      row('Q', { score: 60, msp: 72, mspDir: 'bullish' }),
      row('R', { score: 70, msp: 95, mspDir: 'bearish' }),
      row('S', { score: 80, msp: 99, mspDir: 'neutral' }),
      row('T', { grade: 'A', score: 30, msp: 10, mspDir: 'bullish' }),
    ];
    const flip = { bullish: 'bearish', bearish: 'bullish', neutral: 'neutral' } as const;
    const shorts = longs.map((r) => ({
      ...r,
      canonical: { ...r.canonical, direction: 'short' as const },
      compositeV2: r.compositeV2 && { ...r.compositeV2, direction: flip[r.compositeV2.direction as MspDir] },
    }));
    expect(order(shorts)).toEqual(order(longs));
    for (let i = 0; i < longs.length; i++) expect(agreeingMspScore(shorts[i])).toBe(agreeingMspScore(longs[i]));
    for (const a of longs) for (const b of longs) {
      expect(Math.sign(compareCanonicalRows(a, b))).toBe(-Math.sign(compareCanonicalRows(b, a)) || 0);
    }
  });
});

describe('reproduction: snapshot rows whose score was basically ADX', () => {
  // Identical cached-equity snapshots except ADX (the PFE/HON pattern). On main they graded A 100/98/95/93.
  const snapLong = (adx: number) => ({ price: 100, ema20: 98, ema50: 95, ema200: 88, adx, plusDI: 28, minusDI: 14, atr: 2, rsi: 50, volumeRatio: null });
  const snapShort = (adx: number) => ({ price: 100, ema20: 102, ema50: 105, ema200: 112, adx, plusDI: 14, minusDI: 28, atr: 2, rsi: 50, volumeRatio: null });
  const daily = { symbol: 'X', assetClass: 'equity' as const, timeframe: '1d' };
  const adxs = [31, 27, 23, 20.5];

  it('keeps the scores but grades every one B with the cap flag (was A)', () => {
    const res = adxs.map((adx) => evaluateCanonicalFromSnapshot(snapLong(adx), daily));
    expect(res.map((r) => r.score)).toEqual([100, 98, 95, 93]);
    for (const r of res) {
      expect(r.setupType).toBe('TREND_CONTINUATION');
      expect(r.direction).toBe('long');
      expect(r.permission).toBe('WATCH');
      expect(r.grade).toBe('B');
      expect(r.flags.map((f) => f.code)).toContain('SNAPSHOT_GRADE_CAP');
    }
  });

  it('caps mirrored short snapshots identically', () => {
    const longs = adxs.map((adx) => evaluateCanonicalFromSnapshot(snapLong(adx), daily));
    const shorts = adxs.map((adx) => evaluateCanonicalFromSnapshot(snapShort(adx), daily));
    expect(shorts.map((r) => r.direction)).toEqual(['short', 'short', 'short', 'short']);
    expect(shorts.map((r) => [r.score, r.grade, r.permission])).toEqual(longs.map((r) => [r.score, r.grade, r.permission]));
    for (const r of shorts) expect(r.flags.map((f) => f.code)).toContain('SNAPSHOT_GRADE_CAP');
  });

  it('within the (now shared) B grade, an agreeing MSP outranks a higher ADX', () => {
    const msp = [6, 1, 64, 48]; // PFE-like 6, HON-like 1
    const rows = adxs.map((adx, i) => ({ symbol: `ADX${adx}`, canonical: evaluateCanonicalFromSnapshot(snapLong(adx), daily), compositeV2: { composite: msp[i], direction: 'bullish' } }));
    expect([...rows].sort(compareCanonicalRows).map((r) => r.symbol)).toEqual(['ADX23', 'ADX20.5', 'ADX31', 'ADX27']);
  });
});
