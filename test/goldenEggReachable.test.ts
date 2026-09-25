/**
 * Phase 1 · PR-2b — Golden Egg approvals are reachable and direction-symmetric.
 */
import { describe, expect, it } from 'vitest';
import { evaluateGoldenEgg } from '@/lib/goldenEggScoring';
import { computeConfluenceScore } from '@/lib/goldenEgg/semantics';

const bull = {
  symbol: 'TST', price: 110, changePct: 2.5, rsi: 62, adx: 30, atr: 1.5, macd: 1.2, macdHist: 0.4,
  sma20: 105, sma50: 100, bbUpper: 114, bbMiddle: 108, bbLower: 102, stochK: 70, scannerDirection: 'bullish',
};
// Exact mirror image around 100: every directional reading flipped.
const bear = {
  ...bull, price: 90, changePct: -2.5, rsi: 38, macd: -1.2, macdHist: -0.4, sma20: 95, sma50: 100,
  bbUpper: 98, bbMiddle: 92, bbLower: 86, stochK: 30, scannerDirection: 'bearish', atr: 1.5 * 90 / 110,
};

describe('quick Golden Egg (opportunity-scan cron)', () => {
  it('scores a clean downtrend SHORT exactly like the mirrored uptrend LONG', () => {
    const L = evaluateGoldenEgg(bull), S = evaluateGoldenEgg(bear);
    expect(L.direction).toBe('LONG');
    expect(S.direction).toBe('SHORT');
    expect(S.breakdown.structure).toBe(L.breakdown.structure);
    expect(S.breakdown.momentum).toBe(L.breakdown.momentum);
    expect(S.confidence).toBe(L.confidence);
    expect(L.permission).toBe('TRADE');
    expect(S.permission).toBe('TRADE');
  });

  it('Flow is structurally unavailable (null) and its weight is renormalised, not scored 50', () => {
    const r = evaluateGoldenEgg(bull);
    expect(r.breakdown.flow).toBeNull();
    const { structure, momentum, risk } = r.breakdown;
    expect(r.confidence).toBe(Math.round((structure * 0.30 + momentum * 0.20 + risk * 0.25) / 0.75));
  });

  it('ADX is counted once (Structure), not again in Risk; unknown ATR is neutral', () => {
    const lowAdx = evaluateGoldenEgg({ ...bull, adx: 10 });
    expect(lowAdx.breakdown.risk).toBe(evaluateGoldenEgg(bull).breakdown.risk);
    const noAtr = evaluateGoldenEgg({ ...bull, atr: null });
    expect(noAtr.breakdown.risk).toBe(60 + 0 + 0); // BB width 11% → no bonus; no ATR bonus/penalty
  });
});

describe('full Golden Egg confluence weights', () => {
  it('a not-applicable component (crypto Flow) is renormalised away so 100 is reachable', () => {
    const c = computeConfluenceScore([
      { key: 'Structure', weight: 0.30, value: 100, present: true },
      { key: 'Flow', weight: 0.25, value: 0, present: false, applicable: false },
      { key: 'Momentum', weight: 0.20, value: 100, present: true },
      { key: 'Risk', weight: 0.25, value: 100, present: true },
    ], 100);
    expect(c.finalScore).toBe(100); // was capped at 75 for crypto
    expect(c.coverage).toBeCloseTo(1, 10);
    expect(c.missingComponents).toEqual([]);
  });
  it('a missing-but-applicable component is neutral 50 and flagged', () => {
    const c = computeConfluenceScore([
      { key: 'Structure', weight: 0.30, value: 80, present: true },
      { key: 'Flow', weight: 0.25, value: 0, present: false },
      { key: 'Momentum', weight: 0.20, value: 80, present: true },
      { key: 'Risk', weight: 0.25, value: 80, present: true },
    ], 100);
    expect(c.rawTotal).toBeCloseTo(0.75 * 80 + 0.25 * 50, 10);
    expect(c.missingComponents).toEqual(['Flow']);
    expect(c.coverage).toBeCloseTo(0.75, 10);
  });
});
