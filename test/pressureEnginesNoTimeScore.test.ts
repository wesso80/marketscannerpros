import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeMarketPressure } from '../lib/marketPressureEngine';
import { computeBreakoutReadiness, detectVolatilityTrap } from '../lib/directionalVolatilityEngine';
import type { VolatilityState, DVEInput } from '../lib/directionalVolatilityEngine.types';
const vol: VolatilityState = { bbwp: 5, bbwpSma5: 5, regime: 'compression', regimeConfidence: 90, rateOfChange: 0, rateSmoothed: 0, acceleration: 0, rateDirection: 'flat', inSqueeze: true, squeezeStrength: 1 };
const time = { activeTFCount: 10, hotZoneActive: true, confluenceScore: 100 };
describe('pressure engines exclude time from scores', () => {
  it.each(['crypto', 'equity'] as const)('%s keeps time visible at zero weight', assetClass => {
    const base = { symbol: 'TEST', assetClass, volatility: { regimeState: 'TREND_UP', adx: 35 }, options: { smartMoneyBias: 'bullish', unusualActivityDetected: true } };
    const a = computeMarketPressure(base);
    const b = computeMarketPressure({ ...base, time: { ...time, decompressionActiveCount: 10, midpointDebtCount: 10 } });
    expect(b.pressures.time.score).toBe(100);
    expect(b.pressures.time.weight).toBe(0);
    expect(Object.values(b.pressures).reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1);
    expect([b.composite, b.direction, b.alignment, b.label]).toEqual([a.composite, a.direction, a.alignment, a.label]);
  });
  it('breakout rescales the remaining 70 points and ignores time', () => {
    const input: DVEInput = { price: { currentPrice: 100, closes: [100], changePct: 0 }, indicators: { adx: 15 }, options: { maxPain: 100 } };
    const a = computeBreakoutReadiness(vol, input), b = computeBreakoutReadiness(vol, { ...input, time });
    expect(a.score).toBe(100); expect(b.score).toBe(a.score); expect(b.label).toBe(a.label);
    expect(b.components.timeAlignment).toBe(30); expect(b.componentDetails.join(' ')).toMatch(/display only/i);
  });
  it('trap uses compression and gamma only, with a full 100-point range', () => {
    const opts = { maxPain: 100, dealerGamma: 'Long gamma' };
    const a = detectVolatilityTrap(vol, opts, undefined, 100), b = detectVolatilityTrap(vol, opts, time, 100);
    expect(a.score).toBe(100); expect(b.score).toBe(a.score); expect(b.detected).toBe(a.detected);
    expect(b.timeClusterApproaching).toBe(true); expect(b.components.join(' ')).toMatch(/display only/i);
    expect(detectVolatilityTrap(vol, undefined, time, 100).detected).toBe(false);
  });
  it('DVE route no longer performs its own time scan', () => {
    expect(readFileSync('app/api/dve/route.ts', 'utf8')).not.toMatch(/confluenceLearningAgent|time: timeData/);
  });
});
