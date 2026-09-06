// Validated Liquidity Transmission + Rotation Clock — native TypeScript port of
// MSP_Validated_Liquidity_Transmission_Rotation_Clock_v1.1.1_MASTER_LINK.pine.
//
// Pure, deterministic function: given confirmed monthly/daily cross-asset returns
// and the upstream Global M2 regime, it reproduces the Pine engine's validated
// risk-on transmission, the 8-stage rotation clock, downstream risk appetite, the
// early-warning / late-cycle risk, the headline states, and the MASTER LINK output
// (= transmissionRiskOn) that Master consumes.
//
// No HTTP, DB, env, or UI. The Pine file is the authoritative spec; every formula,
// threshold, weight and branch order is copied from it and NOT reinterpreted.
//
// Pine → engine input map (all returns are percent, e.g. 1.5 = +1.5%):
//   f_dailyPack(sym)  → { r20: ta.roc(close,20)[1], r5: ta.roc(close,5)[1] }
//   f_monthPack(sym)  → { m1: ta.roc(close,1)[1] }          (last completed month)
//   Global M2 core    → oneMonthPct, oneMonthPctPrev, threeMonthAnnPct,
//                        threeMonthAnnPctPrev, yoyPct, validBlocCount, missingBlocs
//   (px/e50/e200/m3 daily+monthly extras are display-only in the Pine and unused
//    by any score, so they are intentionally omitted from the scoring contract.)

/* ── Input contract ────────────────────────────────────────────────────────── */

/** Confirmed returns for one asset. Nulls model Pine `na` (→ neutral 50). */
export interface AssetPack {
  /** Last completed monthly return %  (Pine f_monthPack roc(1)[1]). */
  m1: number | null;
  /** Live confirmed 20-day return %    (Pine f_dailyPack roc(20)[1]). */
  r20: number | null;
  /** Live confirmed 5-day return %     (Pine f_dailyPack roc(5)[1]). */
  r5: number | null;
  /** Provider marked this series stale (quality only; never changes scores). */
  stale?: boolean;
}

/** Upstream Global M2 regime + quality (from computeGlobalM2; not recomputed here). */
export interface LiquidityM2Input {
  globalM2USD: number | null;
  oneMonthPct: number | null;
  oneMonthPctPrev: number | null;
  threeMonthAnnPct: number | null;
  threeMonthAnnPctPrev: number | null;
  yoyPct: number | null;
  validBlocCount: number;
  missingBlocs: string[];
  // Quality metadata propagated to the result (never alters stage math).
  status?: string;
  coveragePercent?: number;
  stale?: boolean;
  interpretationEligible?: boolean;
  providersUsed?: string[];
}

export interface LiquidityTransmissionInput {
  m2: LiquidityM2Input;
  // Grade A validated drivers.
  dxy: AssetPack; copper: AssetPack; eem: AssetPack; vgk: AssetPack;
  // Grade B validated drivers.
  hyg: AssetPack; lqd: AssetPack; gold: AssetPack; silver: AssetPack; vix: AssetPack;
  // Contextual US risk.
  spx: AssetPack; ndx: AssetPack;
  // Downstream crypto receivers.
  btc: AssetPack; eth: AssetPack; total2: AssetPack;
  providersUsed?: string[];
}

/* ── Config (all constants copied from the Pine; frozen defaults) ──────────── */

export interface LiquidityTransmissionConfig {
  magM1: number; magR20: number; magR5: number;         // f_directionComponent scales
  wM1: number; wR20: number; wR5: number;               // f_liveScore weights
  // validatedRiskOn weights (per asset).
  wDXY: number; wCOP: number; wEEM: number; wVGK: number;
  wHYG: number; wLQD: number; wGOLD: number; wSILVER: number; wVIX: number;
  wM2Bias: number; wValidated: number;                  // transmissionRiskOn split
  wUS: number; wCryptoMajors: number; wAlt: number;     // downstreamRiskOn split
  altBonus: number;                                     // TOTAL2>BTC breadth bonus
  // Stage gates: [cumMin, stMin] for stages 1..7.
  stageCumMin: [number, number, number, number, number, number, number];
  stageStMin: number;
  // earlyWarningRisk component weights.
  wGapRisk: number; wCycleRisk: number; wMismatchRisk: number; wStretchRisk: number;
  parityMode: 'FORMULA_VALIDATED' | 'DATA_PARITY_PENDING';
}

export const LIQUIDITY_TRANSMISSION_CONFIG: LiquidityTransmissionConfig = {
  magM1: 1.5, magR20: 1.3, magR5: 2.0,
  wM1: 0.25, wR20: 0.5, wR5: 0.25,
  wDXY: 0.25, wCOP: 0.2, wEEM: 0.125, wVGK: 0.125,
  wHYG: 0.075, wLQD: 0.075, wGOLD: 0.05, wSILVER: 0.05, wVIX: 0.05,
  wM2Bias: 0.35, wValidated: 0.65,
  wUS: 0.5, wCryptoMajors: 0.25, wAlt: 0.25,
  altBonus: 8,
  stageCumMin: [55, 56, 57, 58, 58, 59, 60],
  stageStMin: 55,
  wGapRisk: 0.4, wCycleRisk: 0.25, wMismatchRisk: 0.2, wStretchRisk: 0.15,
  parityMode: 'DATA_PARITY_PENDING',
};

/* ── Result contract ───────────────────────────────────────────────────────── */

export interface TransmissionStageResult {
  stage: number;                 // 1..8
  name: string;                  // f_stageName(stage, dominantRiskOn)
  driver: string;                // f_stageDriver
  grade: string;                 // f_stageGrade
  riskOnScore: number | null;    // stXRiskOn pre-dominance (1..7); null for 8
  score: number;                 // stX dominance-adjusted (stage 8 = st8), full precision
  cumulative: number | null;     // cumN (1..7); null for stage 8
  state: string;                 // f_state (1..7) / f_warningState (8)
  role: string;                  // f_roleText
  next: string;                  // f_stageNext
  confMonthPct: number | null;   // f_stageM1
  live20d: number | null;        // f_stage20 (riskLiquidityGap for stage 8)
  live5d: number | null;         // f_stage5 (null for stage 8: needs prior bar)
  active: boolean;               // stage === currentStage
}

export interface LiquidityDriverScore {
  key: string;
  label: string;
  grade: 'A' | 'B';
  riskOn: number;
}

export interface LiquidityAlerts {
  broadRiskOn: boolean;
  broadRiskOff: boolean;
  divergenceWarning: boolean;    // stage8Active
  earlyWarningElevated: boolean; // earlyWarningRisk >= 50
  earlyWarningHigh: boolean;     // earlyWarningRisk >= 70
  cryptoWindowActive: boolean;
}

export interface LiquidityDataQuality {
  coveragePercent: number;       // present cross-asset inputs / 14
  exactInputCount: number;       // validated Grade A+B present
  alternativeInputCount: number; // context (SPX/NDX) present
  proxyInputCount: number;       // downstream crypto present
  missingInputCount: number;     // assets with all returns null
  staleInputCount: number;
  providersUsed: string[];
  // Upstream Global M2 propagation (§5) — never changes stage math.
  upstreamM2Status: string;
  upstreamM2Coverage: number | null;
  upstreamM2Stale: boolean;
  upstreamM2InterpretationEligible: boolean;
  calculationStatus: 'COMPLETE' | 'PARTIAL';
  parityStatus: 'FORMULA_VALIDATED' | 'DATA_PARITY_PENDING' | 'FULL_PARITY';
}

export interface LiquidityTransmissionResult {
  calculatedAt: string;

  // Headlines.
  flow: string;                  // f_orientationLabel(transmissionRiskOn)
  masterLink: number;            // transmissionRiskOn (Master integration contract)
  transmissionRiskOn: number;    // == masterLink (explicit alias)
  validated: number;             // validatedRiskOn
  downstream: number;            // downstreamRiskOn
  clockStage: number;            // currentStage 0..8
  clockName: string;             // f_stageName(currentStage, dominantRiskOn)
  clockContext: string;          // "n/8 NAME · CYCLE"
  liquidityCycle: string;
  dominantRiskOn: boolean;
  m2BiasScore: number;

  // Early-warning / late-cycle.
  earlyWarningRisk: number;      // continuous 0..100
  earlyWarningState: string;     // f_warningState(earlyWarningRisk)
  lateCycleScore: number;        // st8 (== earlyWarningRisk unless stage8Active)
  lateCycleState: string;        // f_warningState(st8)
  stage8Active: boolean;

  // Divergence.
  riskLiquidityGap: number;
  divergenceState: string;

  // Crypto delayed-transmission window.
  cryptoDelayWindow: string;

  // Downstream components.
  usRiskOn: number;
  cryptoMajorsRiskOn: number;
  altRiskOn: number;

  drivers: LiquidityDriverScore[];
  stages: TransmissionStageResult[];

  // Engine-layer composites (NOT in the v1.1.1 Pine; documented, never affect stages).
  playbook: string;
  confidence: number;
  confidenceLabel: 'HIGH' | 'MODERATE' | 'LOW';

  alerts: LiquidityAlerts;
  quality: LiquidityDataQuality;
}

/* ── Math helpers (faithful to Pine) ───────────────────────────────────────── */

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** f_directionComponent — null (na) → 50; aligned>0 → 75..100; aligned<0 → 0..25. */
export function directionComponent(r: number | null, expectedSign: number, magnitudeScale: number): number {
  if (r === null || Number.isNaN(r)) return 50;
  const aligned = r * expectedSign;
  if (aligned > 0) return clamp(75 + Math.abs(aligned) * magnitudeScale, 75, 100);
  if (aligned < 0) return clamp(25 - Math.abs(aligned) * magnitudeScale, 0, 25);
  return 50;
}

/** f_liveScore — 0.25*M + 0.50*20D + 0.25*5D risk-on orientation. */
export function liveScore(
  m1: number | null, r20: number | null, r5: number | null, expectedSign: number,
  cfg: LiquidityTransmissionConfig = LIQUIDITY_TRANSMISSION_CONFIG,
): number {
  const sm = directionComponent(m1, expectedSign, cfg.magM1);
  const s20 = directionComponent(r20, expectedSign, cfg.magR20);
  const s5 = directionComponent(r5, expectedSign, cfg.magR5);
  return sm * cfg.wM1 + s20 * cfg.wR20 + s5 * cfg.wR5;
}

const avg2 = (a: number, b: number) => (a + b) / 2;
const avg3 = (a: number, b: number, c: number) => (a + b + c) / 3;
const avg4 = (a: number, b: number, c: number, d: number) => (a + b + c + d) / 4;

/** f_state — score band label. */
export function stateLabel(s: number): string {
  if (Number.isNaN(s)) return 'n/a';
  if (s >= 70) return 'CONFIRMED';
  if (s >= 58) return 'SUPPORTIVE';
  if (s >= 45) return 'MIXED';
  if (s >= 32) return 'WEAKENING';
  return 'OPPOSING';
}

/** f_orientationLabel — transmission/validated/downstream band label. */
export function orientationLabel(s: number): string {
  if (Number.isNaN(s)) return 'n/a';
  if (s >= 68) return 'RISK-ON';
  if (s >= 56) return 'LEAN RISK-ON';
  if (s > 44) return 'TRANSITION';
  if (s > 32) return 'LEAN RISK-OFF';
  return 'RISK-OFF';
}

/** f_warningState — stage-8 RISK score band (low good, high bad). */
export function warningState(s: number): string {
  if (Number.isNaN(s)) return 'n/a';
  if (s < 30) return 'CLEAR';
  if (s < 50) return 'WATCH';
  if (s < 70) return 'ELEVATED';
  return 'WARNING';
}

function stageName(stage: number, riskOn: boolean): string {
  if (riskOn) {
    return stage === 1 ? 'LIQUIDITY IGNITION'
      : stage === 2 ? 'USD RELEASE'
      : stage === 3 ? 'CREDIT EASING'
      : stage === 4 ? 'CYCLICAL / GLOBAL BREADTH'
      : stage === 5 ? 'US RISK TRANSMISSION'
      : stage === 6 ? 'CRYPTO MAJORS'
      : stage === 7 ? 'ALT EXPANSION'
      : stage === 8 ? 'LATE-CYCLE / DIVERGENCE' : 'NO TRANSMISSION';
  }
  return stage === 1 ? 'LIQUIDITY DRAIN'
    : stage === 2 ? 'USD SQUEEZE'
    : stage === 3 ? 'CREDIT STRESS'
    : stage === 4 ? 'CYCLICAL / GLOBAL DE-RISK'
    : stage === 5 ? 'US RISK-OFF'
    : stage === 6 ? 'CRYPTO UNWIND'
    : stage === 7 ? 'ALT LIQUIDATION'
    : stage === 8 ? 'CAPITULATION / TURN RISK' : 'NO TRANSMISSION';
}

function roleText(stage: number, riskOn: boolean): string {
  if (riskOn) {
    return stage === 1 ? 'Liquidity impulse starts the chain'
      : stage === 2 ? 'Validated A: weaker USD confirms easing conditions'
      : stage === 3 ? 'Validated B: credit participates'
      : stage === 4 ? 'Validated A: copper + global equities broaden'
      : stage === 5 ? 'US equities receive transmission; contextual edge'
      : stage === 6 ? 'BTC/ETH receive flow; NOT direct validated M2 timing'
      : stage === 7 ? 'Validated B expansion-only TOTAL2 delay channel'
      : 'Early-warning risk: downstream stretch vs validated liquidity';
  }
  return stage === 1 ? 'Liquidity contraction starts the chain'
    : stage === 2 ? 'Validated A: stronger USD confirms tightening'
    : stage === 3 ? 'Validated B: credit stress confirms drain'
    : stage === 4 ? 'Validated A channels weaken together'
    : stage === 5 ? 'US equities receive risk-off transmission'
    : stage === 6 ? 'Crypto majors unwind downstream'
    : stage === 7 ? 'TOTAL2 / alts become high-beta liquidation channel'
    : 'Early-warning risk: capitulation vs improving validated liquidity';
}

function stageDriver(stage: number): string {
  return stage === 1 ? 'GLOBAL M2'
    : stage === 2 ? 'DXY'
    : stage === 3 ? 'HYG / LQD'
    : stage === 4 ? 'COPPER / EEM / VGK'
    : stage === 5 ? 'SPX / NDX'
    : stage === 6 ? 'BTC / ETH'
    : stage === 7 ? 'TOTAL2 vs BTC'
    : 'RISK vs VALIDATED FLOW';
}

function stageGrade(stage: number): string {
  return stage === 1 ? 'CORE'
    : stage === 2 ? 'A'
    : stage === 3 ? 'B'
    : stage === 4 ? 'A'
    : stage === 5 ? 'C / CONTEXT'
    : stage === 6 ? 'DOWNSTREAM'
    : stage === 7 ? 'B EXPANSION'
    : 'MODEL';
}

function stageNext(stage: number, riskOn: boolean): string {
  return stage === 1 ? (riskOn ? 'Watch DXY for release' : 'Watch DXY for squeeze')
    : stage === 2 ? (riskOn ? 'Credit should confirm' : 'Credit stress should appear')
    : stage === 3 ? 'Copper/global breadth should follow'
    : stage === 4 ? 'Watch US equity transmission'
    : stage === 5 ? 'Watch crypto majors'
    : stage === 6 ? 'Watch TOTAL2 breadth'
    : stage === 7 ? 'Monitor late-cycle divergence'
    : 'Watch for reset / new cycle';
}

/** avg of two nullable returns; null if either missing (Pine na propagation). */
function avg2n(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : (a + b) / 2;
}
function avg3n(a: number | null, b: number | null, c: number | null): number | null {
  return a === null || b === null || c === null ? null : (a + b + c) / 3;
}

/* ── m2BiasScore + liquidityCycle (ported exactly) ─────────────────────────── */

export function computeM2BiasScore(m2: LiquidityM2Input): number {
  const accel3M = m2.threeMonthAnnPct !== null && m2.threeMonthAnnPctPrev !== null
    ? m2.threeMonthAnnPct - m2.threeMonthAnnPctPrev : null;
  let bull = 0;
  let bear = 0;
  const vote = (v: number | null) => {
    if (v === null) return;
    if (v >= 0) bull += 1; else bear += 1;
  };
  vote(m2.oneMonthPct);
  vote(m2.threeMonthAnnPct);
  vote(m2.yoyPct);
  vote(accel3M);
  return clamp(50 + 12.5 * (bull - bear), 0, 100);
}

export function computeLiquidityCycle(m2: LiquidityM2Input): string {
  const ann = m2.threeMonthAnnPct;
  const annPrev = m2.threeMonthAnnPctPrev;
  const accel3M = ann !== null && annPrev !== null ? ann - annPrev : null;
  let cycle = 'TRANSITION';
  if (ann !== null && accel3M !== null) {
    if (ann >= 0) {
      if (annPrev !== null && annPrev < 0) cycle = 'EARLY EXPANSION';
      else if (accel3M > 0) cycle = 'ACCELERATION';
      else if (m2.oneMonthPct !== null && m2.oneMonthPct >= 0) cycle = 'LATE EXPANSION';
      else cycle = 'DECELERATION';
    } else {
      cycle = accel3M > 0 ? 'BOTTOMING' : 'CONTRACTION';
    }
  }
  return cycle;
}

/* ── Engine ────────────────────────────────────────────────────────────────── */

const VALIDATED_ASSETS = ['dxy', 'copper', 'eem', 'vgk', 'hyg', 'lqd', 'gold', 'silver', 'vix'] as const;
const CONTEXT_ASSETS = ['spx', 'ndx'] as const;
const DOWNSTREAM_ASSETS = ['btc', 'eth', 'total2'] as const;

function isPresent(p: AssetPack): boolean {
  return p.m1 !== null || p.r20 !== null || p.r5 !== null;
}

export function computeLiquidityTransmission(
  input: LiquidityTransmissionInput,
  cfg: LiquidityTransmissionConfig = LIQUIDITY_TRANSMISSION_CONFIG,
  calculatedAt: string = new Date().toISOString(),
): LiquidityTransmissionResult {
  const { m2 } = input;

  // --- M2 regime ---
  const m2BiasScore = computeM2BiasScore(m2);
  const liquidityCycle = computeLiquidityCycle(m2);
  const threeMonthAnn = m2.threeMonthAnnPct;
  const accel3M = m2.threeMonthAnnPct !== null && m2.threeMonthAnnPctPrev !== null
    ? m2.threeMonthAnnPct - m2.threeMonthAnnPctPrev : null;

  // --- Per-asset risk-on live scores ---
  const scDXY = liveScore(input.dxy.m1, input.dxy.r20, input.dxy.r5, -1, cfg);
  const scCOP = liveScore(input.copper.m1, input.copper.r20, input.copper.r5, 1, cfg);
  const scEEM = liveScore(input.eem.m1, input.eem.r20, input.eem.r5, 1, cfg);
  const scVGK = liveScore(input.vgk.m1, input.vgk.r20, input.vgk.r5, 1, cfg);
  const scHYG = liveScore(input.hyg.m1, input.hyg.r20, input.hyg.r5, 1, cfg);
  const scLQD = liveScore(input.lqd.m1, input.lqd.r20, input.lqd.r5, 1, cfg);
  const scGOLD = liveScore(input.gold.m1, input.gold.r20, input.gold.r5, 1, cfg);
  const scSILVER = liveScore(input.silver.m1, input.silver.r20, input.silver.r5, 1, cfg);
  const scVIX = liveScore(input.vix.m1, input.vix.r20, input.vix.r5, -1, cfg);
  const scSPX = liveScore(input.spx.m1, input.spx.r20, input.spx.r5, 1, cfg);
  const scNDX = liveScore(input.ndx.m1, input.ndx.r20, input.ndx.r5, 1, cfg);
  const scBTC = liveScore(input.btc.m1, input.btc.r20, input.btc.r5, 1, cfg);
  const scETH = liveScore(input.eth.m1, input.eth.r20, input.eth.r5, 1, cfg);
  const scTOTAL2 = liveScore(input.total2.m1, input.total2.r20, input.total2.r5, 1, cfg);

  const validatedRiskOn =
    scDXY * cfg.wDXY + scCOP * cfg.wCOP + scEEM * cfg.wEEM + scVGK * cfg.wVGK +
    scHYG * cfg.wHYG + scLQD * cfg.wLQD + scGOLD * cfg.wGOLD + scSILVER * cfg.wSILVER + scVIX * cfg.wVIX;

  const transmissionRiskOn = m2BiasScore * cfg.wM2Bias + validatedRiskOn * cfg.wValidated;

  const usRiskOn = avg2(scSPX, scNDX);
  const cryptoMajorsRiskOn = avg2(scBTC, scETH);
  const altBonus = input.total2.r20 !== null && input.btc.r20 !== null
    && input.total2.r20 > input.btc.r20 && input.total2.r20 > 0 ? cfg.altBonus : 0;
  const altRiskOn = clamp(scTOTAL2 + altBonus, 0, 100);
  const downstreamRiskOn = usRiskOn * cfg.wUS + cryptoMajorsRiskOn * cfg.wCryptoMajors + altRiskOn * cfg.wAlt;

  // --- Stage risk-on values + dominance ---
  const dominantRiskOn = transmissionRiskOn >= 50;
  const dom = (r: number) => (dominantRiskOn ? r : 100 - r);

  const st1RiskOn = m2BiasScore;
  const st2RiskOn = scDXY;
  const st3RiskOn = avg2(scHYG, scLQD);
  const st4RiskOn = avg3(scCOP, scEEM, scVGK);
  const st5RiskOn = usRiskOn;
  const st6RiskOn = cryptoMajorsRiskOn;
  const st7RiskOn = altRiskOn;

  const st1 = dom(st1RiskOn);
  const st2 = dom(st2RiskOn);
  const st3 = dom(st3RiskOn);
  const st4 = dom(st4RiskOn);
  const st5 = dom(st5RiskOn);
  const st6 = dom(st6RiskOn);
  const st7 = dom(st7RiskOn);

  const cum1 = st1;
  const cum2 = avg2(st1, st2);
  const cum3 = avg3(st1, st2, st3);
  const cum4 = avg4(st1, st2, st3, st4);
  const cum5 = (st1 + st2 + st3 + st4 + st5) / 5;
  const cum6 = (st1 + st2 + st3 + st4 + st5 + st6) / 6;
  const cum7 = (st1 + st2 + st3 + st4 + st5 + st6 + st7) / 7;

  const riskLiquidityGap = downstreamRiskOn - transmissionRiskOn;
  const divergenceState =
    riskLiquidityGap >= 15 ? 'RISK > VALIDATED LIQUIDITY'
    : riskLiquidityGap <= -15 ? 'LIQUIDITY > DOWNSTREAM RISK'
    : 'ALIGNED';

  const m2Slowing = liquidityCycle === 'LATE EXPANSION' || liquidityCycle === 'DECELERATION';
  const riskExtended = downstreamRiskOn >= 68;
  const riskWashed = downstreamRiskOn <= 32;

  const lateRiskOnWarning = dominantRiskOn && riskExtended
    && (riskLiquidityGap >= 15 || m2Slowing) && validatedRiskOn < 62;
  const capitulationTurnWarning = !dominantRiskOn && riskWashed
    && (riskLiquidityGap <= -15 || liquidityCycle === 'BOTTOMING') && validatedRiskOn > 38;
  const stage8Active = lateRiskOnWarning || capitulationTurnWarning;

  const gapRisk = clamp((Math.abs(riskLiquidityGap) - 5) * 4, 0, 100);
  const cycleRisk = liquidityCycle === 'DECELERATION' ? 70
    : liquidityCycle === 'LATE EXPANSION' ? 45
    : liquidityCycle === 'CONTRACTION' ? 55
    : liquidityCycle === 'BOTTOMING' ? 35 : 10;
  const validationMismatchRisk = dominantRiskOn
    ? clamp((68 - validatedRiskOn) * 3, 0, 100)
    : clamp((validatedRiskOn - 32) * 3, 0, 100);
  const downstreamStretchRisk = dominantRiskOn
    ? clamp((downstreamRiskOn - 65) * 3, 0, 100)
    : clamp((35 - downstreamRiskOn) * 3, 0, 100);
  const earlyWarningRisk = clamp(
    gapRisk * cfg.wGapRisk + cycleRisk * cfg.wCycleRisk
    + validationMismatchRisk * cfg.wMismatchRisk + downstreamStretchRisk * cfg.wStretchRisk, 0, 100);
  const st8 = stage8Active ? Math.max(70, earlyWarningRisk) : earlyWarningRisk;

  // --- Rotation clock (independent sequential gates: last passing stage wins) ---
  const stArr = [st1, st2, st3, st4, st5, st6, st7];
  const cumArr = [cum1, cum2, cum3, cum4, cum5, cum6, cum7];
  let currentStage = 0;
  for (let i = 0; i < 7; i++) {
    if (cumArr[i] >= cfg.stageCumMin[i] && stArr[i] >= cfg.stageStMin) currentStage = i + 1;
  }
  if (stage8Active) currentStage = 8;

  const clockName = stageName(currentStage, dominantRiskOn);
  const clockContext = `${currentStage}/8 ${clockName} · ${liquidityCycle}`;

  const cryptoDelayWindow =
    m2BiasScore >= 62 && threeMonthAnn !== null && threeMonthAnn > 0 && accel3M !== null && accel3M >= 0 ? 'ACTIVE +2\u20133M'
    : m2BiasScore >= 55 && threeMonthAnn !== null && threeMonthAnn > 0 ? 'WATCH +2\u20133M'
    : m2BiasScore <= 40 ? 'OFF / LIQUIDITY DRAIN'
    : 'NEUTRAL';

  // --- Stage display fields (f_stageM1 / f_stage20 / f_stage5) ---
  const stageM1: (number | null)[] = [
    m2.oneMonthPct, input.dxy.m1, avg2n(input.hyg.m1, input.lqd.m1),
    avg3n(input.copper.m1, input.eem.m1, input.vgk.m1), avg2n(input.spx.m1, input.ndx.m1),
    avg2n(input.btc.m1, input.eth.m1), input.total2.m1, null,
  ];
  const stage20: (number | null)[] = [
    null, input.dxy.r20, avg2n(input.hyg.r20, input.lqd.r20),
    avg3n(input.copper.r20, input.eem.r20, input.vgk.r20), avg2n(input.spx.r20, input.ndx.r20),
    avg2n(input.btc.r20, input.eth.r20), input.total2.r20, riskLiquidityGap,
  ];
  const stage5: (number | null)[] = [
    null, input.dxy.r5, avg2n(input.hyg.r5, input.lqd.r5),
    avg3n(input.copper.r5, input.eem.r5, input.vgk.r5), avg2n(input.spx.r5, input.ndx.r5),
    avg2n(input.btc.r5, input.eth.r5), input.total2.r5, null, // stage 8 5D needs prior bar
  ];
  const stageScores = [st1, st2, st3, st4, st5, st6, st7, st8];
  const stageRiskOn = [st1RiskOn, st2RiskOn, st3RiskOn, st4RiskOn, st5RiskOn, st6RiskOn, st7RiskOn, null];

  const stages: TransmissionStageResult[] = [];
  for (let s = 1; s <= 8; s++) {
    const score = stageScores[s - 1];
    stages.push({
      stage: s,
      name: stageName(s, dominantRiskOn),
      driver: stageDriver(s),
      grade: stageGrade(s),
      riskOnScore: stageRiskOn[s - 1],
      score,
      cumulative: s <= 7 ? cumArr[s - 1] : null,
      state: s === 8 ? warningState(score) : stateLabel(score),
      role: roleText(s, dominantRiskOn),
      next: stageNext(s, dominantRiskOn),
      confMonthPct: stageM1[s - 1],
      live20d: stage20[s - 1],
      live5d: stage5[s - 1],
      active: s === currentStage,
    });
  }

  const drivers: LiquidityDriverScore[] = [
    { key: 'dxy', label: 'DXY', grade: 'A', riskOn: scDXY },
    { key: 'copper', label: 'Copper', grade: 'A', riskOn: scCOP },
    { key: 'eem', label: 'Emerging Markets', grade: 'A', riskOn: scEEM },
    { key: 'vgk', label: 'Europe', grade: 'A', riskOn: scVGK },
    { key: 'hyg', label: 'High Yield Credit', grade: 'B', riskOn: scHYG },
    { key: 'lqd', label: 'Investment Grade Credit', grade: 'B', riskOn: scLQD },
    { key: 'gold', label: 'Gold', grade: 'B', riskOn: scGOLD },
    { key: 'silver', label: 'Silver', grade: 'B', riskOn: scSILVER },
    { key: 'vix', label: 'VIX', grade: 'B', riskOn: scVIX },
  ];

  // --- Alerts (Pine thresholds; level booleans — edge/crossover is service-layer) ---
  const alerts: LiquidityAlerts = {
    broadRiskOn: transmissionRiskOn >= 68 && validatedRiskOn >= 65 && downstreamRiskOn >= 58,
    broadRiskOff: transmissionRiskOn <= 32 && validatedRiskOn <= 35 && downstreamRiskOn <= 42,
    divergenceWarning: stage8Active,
    earlyWarningElevated: earlyWarningRisk >= 50,
    earlyWarningHigh: earlyWarningRisk >= 70,
    cryptoWindowActive: cryptoDelayWindow.includes('ACTIVE'),
  };

  // --- Data quality + upstream M2 propagation ---
  const assetPacks: AssetPack[] = [
    input.dxy, input.copper, input.eem, input.vgk, input.hyg, input.lqd, input.gold,
    input.silver, input.vix, input.spx, input.ndx, input.btc, input.eth, input.total2,
  ];
  const exactInputCount = VALIDATED_ASSETS.filter((k) => isPresent(input[k])).length;
  const alternativeInputCount = CONTEXT_ASSETS.filter((k) => isPresent(input[k])).length;
  const proxyInputCount = DOWNSTREAM_ASSETS.filter((k) => isPresent(input[k])).length;
  const missingInputCount = assetPacks.filter((p) => !isPresent(p)).length;
  const staleInputCount = assetPacks.filter((p) => p.stale === true).length;
  const presentAssets = assetPacks.length - missingInputCount;
  const coveragePercent = (presentAssets / assetPacks.length) * 100;

  const quality: LiquidityDataQuality = {
    coveragePercent,
    exactInputCount,
    alternativeInputCount,
    proxyInputCount,
    missingInputCount,
    staleInputCount,
    providersUsed: input.providersUsed ?? m2.providersUsed ?? [],
    upstreamM2Status: m2.status ?? 'UNKNOWN',
    upstreamM2Coverage: m2.coveragePercent ?? null,
    upstreamM2Stale: m2.stale ?? false,
    upstreamM2InterpretationEligible: m2.interpretationEligible ?? false,
    calculationStatus: missingInputCount === 0 && m2.globalM2USD !== null ? 'COMPLETE' : 'PARTIAL',
    parityStatus: cfg.parityMode, // FULL_PARITY is never auto-emitted
  };

  // --- Engine-layer composites (documented; not in the Pine, no stage impact) ---
  const stageForText = currentStage >= 1 ? currentStage : 1;
  const playbook = `${orientationLabel(transmissionRiskOn)} \u00b7 ${clockName}. `
    + `${roleText(stageForText, dominantRiskOn)}. Next: ${stageNext(stageForText, dominantRiskOn)}. `
    + `Divergence: ${divergenceState}.`;
  const confidence = clamp(
    Math.round(100 * (0.5 * (presentAssets / assetPacks.length) + 0.5 * (m2.validBlocCount / 11))), 0, 100);
  const confidenceLabel: 'HIGH' | 'MODERATE' | 'LOW' = confidence >= 80 ? 'HIGH' : confidence >= 55 ? 'MODERATE' : 'LOW';

  return {
    calculatedAt,
    flow: orientationLabel(transmissionRiskOn),
    masterLink: transmissionRiskOn,
    transmissionRiskOn,
    validated: validatedRiskOn,
    downstream: downstreamRiskOn,
    clockStage: currentStage,
    clockName,
    clockContext,
    liquidityCycle,
    dominantRiskOn,
    m2BiasScore,
    earlyWarningRisk,
    earlyWarningState: warningState(earlyWarningRisk),
    lateCycleScore: st8,
    lateCycleState: warningState(st8),
    stage8Active,
    riskLiquidityGap,
    divergenceState,
    cryptoDelayWindow,
    usRiskOn,
    cryptoMajorsRiskOn,
    altRiskOn,
    drivers,
    stages,
    playbook,
    confidence,
    confidenceLabel,
    alerts,
    quality,
  };
}
