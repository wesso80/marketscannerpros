import { describe, expect, it } from 'vitest';
import { evaluateRegimeOverlay, overlayForDirection, type RegimeOverlayInputs } from '@/lib/scoring/canonical';

const riskOff: RegimeOverlayInputs = {
  vix: { level: 22, change5dPct: 35 },
  hyOas: { level: 4.2, change20dPp: 0.8 },
  m2: { change3mPct: -0.4 },
  spy: { close: 90, sma50: 100, sma200: 105 },
  qqq: { close: 95, sma50: 100, sma200: 98 },
  macroRiskState: 'risk_off',
  fragility: 'high',
};
const riskOn: RegimeOverlayInputs = {
  vix: { level: 22, change5dPct: -35 },
  hyOas: { level: 3.1, change20dPp: -0.8 },
  m2: { change3mPct: 2.6 },
  spy: { close: 110, sma50: 100, sma200: 95 },
  qqq: { close: 105, sma50: 100, sma200: 102 },
  macroRiskState: 'risk_on',
  fragility: 'low',
};

describe('regime overlay', () => {
  it('is mirrored: the mirrored environment swaps long and short', () => {
    const a = evaluateRegimeOverlay(riskOff, 'equity');
    const b = evaluateRegimeOverlay(riskOn, 'equity');
    expect(a.adverse.long.map((x) => x.code)).toEqual(b.adverse.short.map((x) => x.code));
    expect(a.adverse.short).toEqual([]);
    expect(b.adverse.long).toEqual([]);
    expect(a.sizeMultiplier.long).toBe(b.sizeMultiplier.short);
  });

  it('elevated volatility is adverse to both sides', () => {
    const r = evaluateRegimeOverlay({ vix: { level: 31 } }, 'equity');
    expect(r.adverse.long.map((x) => x.code)).toEqual(['VIX_ELEVATED']);
    expect(r.adverse.short.map((x) => x.code)).toEqual(['VIX_ELEVATED']);
    expect(r.unavailable).toEqual(expect.arrayContaining(['HY_OAS', 'M2', 'SPY', 'QQQ', 'MACRO_RISK_STATE', 'FRAGILITY']));
  });

  it('forex only uses the volatility condition', () => {
    const r = evaluateRegimeOverlay({ ...riskOff, vix: { level: 28, change5dPct: 35 } }, 'forex');
    expect(r.adverse.long.map((x) => x.code)).toEqual(['VIX_ELEVATED']);
    expect(r.adverse.short.map((x) => x.code)).toEqual(['VIX_ELEVATED']);
  });

  it('≥ 3 adverse → WATCH REGIME_ADVERSE; fewer → headwind flag and smaller size only', () => {
    const r = evaluateRegimeOverlay(riskOff, 'equity');
    const long = overlayForDirection(r)('long');
    expect(long.watchReasons[0].code).toBe('REGIME_ADVERSE');
    expect(long.sizeMultiplier).toBe(0.4);
    const mild = overlayForDirection(evaluateRegimeOverlay({ spy: { close: 90, sma50: 100, sma200: 105 } }, 'equity'))('long');
    expect(mild.watchReasons).toEqual([]);
    expect(mild.flags?.[0].code).toBe('REGIME_HEADWIND');
    expect(mild.sizeMultiplier).toBe(0.85);
    const none = overlayForDirection(evaluateRegimeOverlay({}, 'equity'))('short');
    expect(none).toEqual({ sizeMultiplier: 1, watchReasons: [], flags: [] });
  });
});
