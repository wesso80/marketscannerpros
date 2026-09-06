import { describe, it, expect } from 'vitest';
import {
  computeLiquidityTransmission,
  clamp,
  directionComponent,
  liveScore,
  stateLabel,
  orientationLabel,
  warningState,
  computeM2BiasScore,
  computeLiquidityCycle,
  LIQUIDITY_TRANSMISSION_CONFIG,
  type AssetPack,
  type LiquidityM2Input,
  type LiquidityTransmissionInput,
} from '@/lib/intelligence/engines/liquidityTransmission';

/**
 * PARITY HARNESS — Validated Liquidity Transmission + Rotation Clock v1.1.1.
 *
 * Sub-formulas are unit-tested against hand-computed Pine values (exact).
 * Full-pipeline parity against the deployed TradingView dashboard needs the raw
 * close series TradingView used at a timestamp; those are pending, so TV_REFERENCE
 * records the expected OUTPUTS (a parity scaffold, NOT calculation inputs). The
 * formulas are never tuned toward these numbers.
 */

// Expected OUTPUTS from the deployed TradingView dashboard (2026-09-02).
export const TV_REFERENCE = {
  globalM2Trillions: 114.8,
  m2_1m: 0.23,
  m2_3mAnn: 10.14,
  m2_yoy: 8.38,
  validated: 62,
  downstream: 78,
  clock: '7/8 ALT EXPANSION · LATE EXPANSION',
  lateCycle: 31,
  lateCycleState: 'WATCH',
  masterLinkRaw: 66.81, // MASTER LINK = transmissionRiskOn (≠ VALIDATED 62)
  stages: [
    { stage: 1, name: 'LIQUIDITY IGNITION', score: 75, state: 'CONFIRMED' },
    { stage: 2, name: 'USD RELEASE', score: 62, state: 'SUPPORTIVE' },
    { stage: 3, name: 'CREDIT EASING', score: 69, state: 'SUPPORTIVE' },
    { stage: 4, name: 'CYCLICAL / GLOBAL BREADTH', score: 60, state: 'SUPPORTIVE' },
    { stage: 5, name: 'US RISK TRANSMISSION', score: 78, state: 'CONFIRMED' },
    { stage: 6, name: 'CRYPTO MAJORS', score: 79, state: 'CONFIRMED' },
    { stage: 7, name: 'ALT EXPANSION', score: 78, state: 'CONFIRMED' },
    { stage: 8, name: 'LATE-CYCLE / DIVERGENCE', score: 31, state: 'WATCH' },
  ],
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const NULL_ASSET: AssetPack = { m1: null, r20: null, r5: null };
function asset(m1: number | null, r20: number | null, r5: number | null, stale = false): AssetPack {
  return { m1, r20, r5, stale };
}
function m2(over: Partial<LiquidityM2Input> = {}): LiquidityM2Input {
  return {
    globalM2USD: 114.8e12, oneMonthPct: null, oneMonthPctPrev: null,
    threeMonthAnnPct: null, threeMonthAnnPctPrev: null, yoyPct: null,
    validBlocCount: 9, missingBlocs: ['IN', 'KR'], ...over,
  };
}
function allAssets(pack: AssetPack): Omit<LiquidityTransmissionInput, 'm2' | 'providersUsed'> {
  return {
    dxy: pack, copper: pack, eem: pack, vgk: pack, hyg: pack, lqd: pack, gold: pack,
    silver: pack, vix: pack, spx: pack, ndx: pack, btc: pack, eth: pack, total2: pack,
  };
}

/* ── Sub-formula parity (exact, hand-computed from Pine) ───────────────────── */
describe('Liquidity Transmission — sub-formula parity', () => {
  it('f_clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('f_directionComponent — na→50, aligned bands, magnitude scale', () => {
    expect(directionComponent(null, 1, 1.5)).toBe(50);
    expect(directionComponent(0, 1, 1.5)).toBe(50);
    expect(directionComponent(2, 1, 1.5)).toBe(78);   // 75 + 2*1.5
    expect(directionComponent(2, -1, 1.5)).toBe(22);  // inverse: 25 - 2*1.5
    expect(directionComponent(100, 1, 2.0)).toBe(100); // clamp high
    expect(directionComponent(-100, 1, 2.0)).toBe(0);  // clamp low
  });

  it('f_liveScore — 0.25*M + 0.50*20D + 0.25*5D', () => {
    expect(liveScore(2, 1, 0, 1)).toBeCloseTo(70.15, 10); // 78*.25 + 76.3*.5 + 50*.25
    expect(liveScore(null, null, null, 1)).toBe(50);       // missing asset → neutral 50
    expect(liveScore(null, null, null, -1)).toBe(50);
  });

  it('f_state bands (>=70/58/45/32)', () => {
    expect(stateLabel(70)).toBe('CONFIRMED');
    expect(stateLabel(69.99)).toBe('SUPPORTIVE');
    expect(stateLabel(58)).toBe('SUPPORTIVE');
    expect(stateLabel(57.99)).toBe('MIXED');
    expect(stateLabel(45)).toBe('MIXED');
    expect(stateLabel(44.99)).toBe('WEAKENING');
    expect(stateLabel(32)).toBe('WEAKENING');
    expect(stateLabel(31.99)).toBe('OPPOSING');
  });

  it('f_orientationLabel bands (>=68/56, >44/32)', () => {
    expect(orientationLabel(68)).toBe('RISK-ON');
    expect(orientationLabel(67.99)).toBe('LEAN RISK-ON');
    expect(orientationLabel(56)).toBe('LEAN RISK-ON');
    expect(orientationLabel(55.99)).toBe('TRANSITION');
    expect(orientationLabel(45)).toBe('TRANSITION');
    expect(orientationLabel(44)).toBe('LEAN RISK-OFF'); // >44 is false at 44
    expect(orientationLabel(33)).toBe('LEAN RISK-OFF');
    expect(orientationLabel(32)).toBe('RISK-OFF');       // >32 is false at 32
    expect(orientationLabel(66.81)).toBe('LEAN RISK-ON'); // TV master-link band
  });

  it('f_warningState bands (<30/50/70)', () => {
    expect(warningState(29.99)).toBe('CLEAR');
    expect(warningState(30)).toBe('WATCH');
    expect(warningState(49.99)).toBe('WATCH');
    expect(warningState(50)).toBe('ELEVATED');
    expect(warningState(69.99)).toBe('ELEVATED');
    expect(warningState(70)).toBe('WARNING');
    expect(warningState(31)).toBe('WATCH'); // TV late-cycle band
  });
});

/* ── m2BiasScore + liquidityCycle branch parity ────────────────────────────── */
describe('Liquidity Transmission — M2 bias + cycle branches', () => {
  it('m2BiasScore = clamp(50 + 12.5*(bull-bear))', () => {
    expect(computeM2BiasScore(m2({ oneMonthPct: 1, threeMonthAnnPct: 1, threeMonthAnnPctPrev: 0, yoyPct: 1 }))).toBe(100); // 4 bull
    expect(computeM2BiasScore(m2({ oneMonthPct: -1, threeMonthAnnPct: -1, threeMonthAnnPctPrev: 0, yoyPct: -1 }))).toBe(0); // 4 bear (accel3M -1)
    expect(computeM2BiasScore(m2({ oneMonthPct: 1, threeMonthAnnPct: -1, threeMonthAnnPctPrev: -2, yoyPct: -1 }))).toBe(50); // 2 bull (1M, accel +1) 2 bear
    expect(computeM2BiasScore(m2())).toBe(50); // no data → no votes
  });

  it('liquidityCycle branch order', () => {
    expect(computeLiquidityCycle(m2({ threeMonthAnnPct: 10, threeMonthAnnPctPrev: -2 }))).toBe('EARLY EXPANSION');
    expect(computeLiquidityCycle(m2({ threeMonthAnnPct: 10, threeMonthAnnPctPrev: 8 }))).toBe('ACCELERATION');
    expect(computeLiquidityCycle(m2({ threeMonthAnnPct: 10, threeMonthAnnPctPrev: 12, oneMonthPct: 1 }))).toBe('LATE EXPANSION');
    expect(computeLiquidityCycle(m2({ threeMonthAnnPct: 10, threeMonthAnnPctPrev: 12, oneMonthPct: -1 }))).toBe('DECELERATION');
    expect(computeLiquidityCycle(m2({ threeMonthAnnPct: -5, threeMonthAnnPctPrev: -8 }))).toBe('BOTTOMING');
    expect(computeLiquidityCycle(m2({ threeMonthAnnPct: -5, threeMonthAnnPctPrev: -2 }))).toBe('CONTRACTION');
    expect(computeLiquidityCycle(m2())).toBe('TRANSITION');
  });
});

/* ── Full-pipeline scenarios (exact, hand-verified) ────────────────────────── */
describe('Liquidity Transmission — full pipeline', () => {
  it('all-neutral inputs → 50 orientation, no transmission stage, CLEAR risk', () => {
    const r = computeLiquidityTransmission({ m2: m2({ validBlocCount: 0 }), ...allAssets(NULL_ASSET) });
    expect(r.validated).toBe(50);
    expect(r.masterLink).toBe(50);
    expect(r.transmissionRiskOn).toBe(50);
    expect(r.downstream).toBe(50);
    expect(r.dominantRiskOn).toBe(true); // 50 >= 50
    expect(r.flow).toBe('TRANSITION');
    expect(r.clockStage).toBe(0);
    expect(r.clockName).toBe('NO TRANSMISSION');
    expect(r.clockContext).toBe('0/8 NO TRANSMISSION · TRANSITION');
    expect(r.riskLiquidityGap).toBe(0);
    expect(r.divergenceState).toBe('ALIGNED');
    expect(r.earlyWarningRisk).toBeCloseTo(13.3, 10);
    expect(r.earlyWarningState).toBe('CLEAR');
    expect(r.stage8Active).toBe(false);
    expect(r.cryptoDelayWindow).toBe('NEUTRAL');
  });

  it('MASTER LINK is transmissionRiskOn and distinct from VALIDATED', () => {
    // M2 fully bullish (bias 100) but validated drivers neutral (50).
    const r = computeLiquidityTransmission({
      m2: m2({ oneMonthPct: 1, threeMonthAnnPct: 1, threeMonthAnnPctPrev: 0, yoyPct: 1, validBlocCount: 11 }),
      ...allAssets(NULL_ASSET),
    });
    expect(r.m2BiasScore).toBe(100);
    expect(r.validated).toBe(50);
    expect(r.masterLink).toBeCloseTo(67.5, 10); // 100*0.35 + 50*0.65
    expect(r.masterLink).not.toBe(r.validated);
    expect(r.flow).toBe('LEAN RISK-ON');
    expect(r.clockStage).toBe(1);
    expect(r.clockName).toBe('LIQUIDITY IGNITION');
    expect(r.stages[0].state).toBe('CONFIRMED'); // st1 = m2Bias 100
    expect(r.liquidityCycle).toBe('ACCELERATION');
    expect(r.divergenceState).toBe('LIQUIDITY > DOWNSTREAM RISK'); // gap -17.5
    expect(r.cryptoDelayWindow).toBe('ACTIVE +2\u20133M');
    expect(r.alerts.cryptoWindowActive).toBe(true);
  });

  it('fully risk-on chain → stage 7 ALT EXPANSION, broad risk-on alert', () => {
    const r = computeLiquidityTransmission({
      m2: m2({ oneMonthPct: 1, threeMonthAnnPct: 1, threeMonthAnnPctPrev: 0, yoyPct: 1, validBlocCount: 11 }),
      dxy: asset(-100, -100, -100), vix: asset(-100, -100, -100),
      copper: asset(100, 100, 100), eem: asset(100, 100, 100), vgk: asset(100, 100, 100),
      hyg: asset(100, 100, 100), lqd: asset(100, 100, 100), gold: asset(100, 100, 100),
      silver: asset(100, 100, 100), spx: asset(100, 100, 100), ndx: asset(100, 100, 100),
      btc: asset(100, 100, 100), eth: asset(100, 100, 100), total2: asset(100, 100, 100),
    });
    expect(r.validated).toBe(100);
    expect(r.masterLink).toBe(100);
    expect(r.downstream).toBe(100);
    expect(r.clockStage).toBe(7);
    expect(r.clockName).toBe('ALT EXPANSION');
    expect(r.clockContext).toBe('7/8 ALT EXPANSION · ACCELERATION');
    expect(r.stage8Active).toBe(false);
    expect(r.alerts.broadRiskOn).toBe(true);
    expect(r.lateCycleScore).toBeCloseTo(17.5, 10); // earlyWarningRisk (not active)
    expect(r.lateCycleState).toBe('CLEAR');
  });

  it('downstream stretch vs neutral validated liquidity → stage 8 late-cycle warning', () => {
    const r = computeLiquidityTransmission({
      m2: m2({ validBlocCount: 9 }), // bias 50, cycle TRANSITION
      dxy: NULL_ASSET, vix: NULL_ASSET, copper: NULL_ASSET, eem: NULL_ASSET, vgk: NULL_ASSET,
      hyg: NULL_ASSET, lqd: NULL_ASSET, gold: NULL_ASSET, silver: NULL_ASSET,
      spx: asset(100, 100, 100), ndx: asset(100, 100, 100),
      btc: asset(100, 100, 100), eth: asset(100, 100, 100), total2: asset(100, 100, 100),
    });
    expect(r.downstream).toBe(100);
    expect(r.validated).toBe(50);
    expect(r.riskLiquidityGap).toBe(50);
    expect(r.divergenceState).toBe('RISK > VALIDATED LIQUIDITY');
    expect(r.stage8Active).toBe(true);
    expect(r.clockStage).toBe(8);
    expect(r.clockName).toBe('LATE-CYCLE / DIVERGENCE');
    expect(r.earlyWarningRisk).toBeCloseTo(68.3, 10);
    expect(r.earlyWarningState).toBe('ELEVATED');
    expect(r.lateCycleScore).toBe(70); // max(70, 68.3)
    expect(r.lateCycleState).toBe('WARNING');
  });
});

/* ── Data quality, missing/stale inputs, upstream propagation ──────────────── */
describe('Liquidity Transmission — quality + upstream propagation', () => {
  it('missing inputs stay neutral (not dropped) and are counted', () => {
    const r = computeLiquidityTransmission({
      m2: m2({ validBlocCount: 9 }),
      ...allAssets(NULL_ASSET),
      dxy: asset(-1, -1, -1), // one present
    });
    expect(r.quality.missingInputCount).toBe(13);
    expect(r.quality.exactInputCount).toBe(1); // only DXY present among validated
    // fully-null assets still contributed neutral 50 to their live scores
    expect(r.drivers.find((d) => d.key === 'copper')!.riskOn).toBe(50);
  });

  it('stale inputs are counted without changing stage math', () => {
    const base = computeLiquidityTransmission({ m2: m2(), ...allAssets(NULL_ASSET) });
    const staled = computeLiquidityTransmission({ m2: m2(), ...allAssets(asset(null, null, null, true)) });
    expect(staled.quality.staleInputCount).toBe(14);
    expect(staled.masterLink).toBe(base.masterLink); // stale flag never alters scores
  });

  it('propagates partial upstream Global M2 metadata (§5)', () => {
    const r = computeLiquidityTransmission({
      m2: m2({ status: 'LIVE/PARTIAL', coveragePercent: 94.4, stale: false, interpretationEligible: false, validBlocCount: 9 }),
      ...allAssets(NULL_ASSET),
    });
    expect(r.quality.upstreamM2Status).toBe('LIVE/PARTIAL');
    expect(r.quality.upstreamM2Coverage).toBe(94.4);
    expect(r.quality.upstreamM2InterpretationEligible).toBe(false);
  });

  it('FULL_PARITY is never auto-emitted; default is DATA_PARITY_PENDING', () => {
    const r = computeLiquidityTransmission({ m2: m2(), ...allAssets(NULL_ASSET) });
    expect(r.quality.parityStatus).toBe('DATA_PARITY_PENDING');
    expect(['FORMULA_VALIDATED', 'DATA_PARITY_PENDING']).toContain(r.quality.parityStatus);
    expect(r.quality.parityStatus).not.toBe('FULL_PARITY');
  });

  it('config carries the exact Pine constants (frozen)', () => {
    const c = LIQUIDITY_TRANSMISSION_CONFIG;
    expect(c.wM2Bias).toBe(0.35);
    expect(c.wValidated).toBe(0.65);
    expect(c.wDXY).toBe(0.25);
    expect(c.stageCumMin).toEqual([55, 56, 57, 58, 58, 59, 60]);
    expect(c.wGapRisk + c.wCycleRisk + c.wMismatchRisk + c.wStretchRisk).toBeCloseTo(1, 10);
  });
});

/* ── TV reference scaffold (documented; formulas NOT tuned to it) ──────────── */
describe('Liquidity Transmission — TradingView reference scaffold', () => {
  it('reference outputs are internally consistent with the ported bands', () => {
    // MASTER LINK 66.81 → LEAN RISK-ON; VALIDATED 62 (distinct headline).
    expect(orientationLabel(TV_REFERENCE.masterLinkRaw)).toBe('LEAN RISK-ON');
    expect(TV_REFERENCE.masterLinkRaw).not.toBe(TV_REFERENCE.validated);
    // Clock 7 = ALT EXPANSION (risk-on); late-cycle 31 = WATCH.
    expect(TV_REFERENCE.clock.startsWith('7/8 ALT EXPANSION')).toBe(true);
    expect(warningState(TV_REFERENCE.lateCycle)).toBe(TV_REFERENCE.lateCycleState);
    // Each stage reference score maps to its documented state band.
    for (const s of TV_REFERENCE.stages) {
      const expected = s.stage === 8 ? warningState(s.score) : stateLabel(s.score);
      expect(expected).toBe(s.state);
    }
  });
});
