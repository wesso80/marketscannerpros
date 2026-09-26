import { InstitutionalFlowState } from './institutional-flow-state-engine';
import { SessionPermissionOverlay } from './session-permission-overlay';

export type TradeArchetype =
  | 'trend_continuation'
  | 'breakout_early'
  | 'breakout_late'
  | 'pullback_entry'
  | 'mean_reversion'
  | 'counter_trend_fade'
  | 'reversal_confirmed'
  | 'momentum_add';

export interface FlowTradePermissionInput {
  state: InstitutionalFlowState;
  stateConfidence: number; // 0-100
  institutionalProbability: number; // best-matching probability 0-100
  pTrend: number; // 0-100
  pPin: number; // 0-100
  pExpansion: number; // 0-100
  dataHealthScore: number; // 0-100
  liquidityClarity: number; // 0-100
  volatilityCompression: number; // 0-100
  atrExpansionRate: number; // 0-100
  preferredArchetype: TradeArchetype;
  /** Optional session overlay — when provided, adjusts TPS, sizing, and allowed/blocked lists */
  sessionOverlay?: SessionPermissionOverlay | null;
}

export interface FlowTradePermission {
  state: InstitutionalFlowState;
  tps: number;
  blocked: boolean;
  noTradeMode: {
    active: boolean;
    reason: string;
  };
  /**
   * True when permission is withheld only by the session overlay (its stricter TPS bar or its confidence/liquidity
   * minimums) while the score itself clears the standard threshold. The reason then reads "Unavailable in … session".
   */
  sessionLimited?: boolean;
  riskMode: 'low' | 'medium' | 'high';
  sizeMultiplier: number;
  stopStyle: 'tight_structural' | 'structural' | 'atr_trailing' | 'wider_confirmation';
  allowed: string[];
  blockedTrades: string[];
  alignmentByArchetype: Record<TradeArchetype, number>;
  selectedArchetype: TradeArchetype;
  /** Present when session overlay was applied */
  sessionAdjustment?: {
    phase: string;
    tpsAdjustment: number;
    sizeCapApplied: boolean;
    restrictive: boolean;
    reason: string;
  };
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Standard Trade Permission threshold (0-1) when no session overlay tightens it. */
export const BASE_TPS_THRESHOLD = 0.65;

function sessionLabel(phase: string): string {
  return phase.toLowerCase().replace(/_session$/, '').replace(/^crypto_/, '').replace(/_/g, ' ');
}

/** "asian hours", "after hours" (not "after hours hours"). */
function sessionHours(phase: string): string {
  const label = sessionLabel(phase);
  return /\bhours$/.test(label) ? label : `${label} hours`;
}

function alignmentMap(state: InstitutionalFlowState): Record<TradeArchetype, number> {
  switch (state) {
    case 'ACCUMULATION':
      return {
        trend_continuation: 0.2,
        breakout_early: 0.35,
        breakout_late: 0.1,
        pullback_entry: 0.45,
        mean_reversion: 1.0,
        counter_trend_fade: 0.65,
        reversal_confirmed: 0.55,
        momentum_add: 0.1,
      };
    case 'POSITIONING':
      return {
        trend_continuation: 0.65,
        breakout_early: 1.0,
        breakout_late: 0.3,
        pullback_entry: 0.8,
        mean_reversion: 0.35,
        counter_trend_fade: 0.2,
        reversal_confirmed: 0.25,
        momentum_add: 0.55,
      };
    case 'LAUNCH':
      return {
        trend_continuation: 1.0,
        breakout_early: 0.85,
        breakout_late: 0.65,
        pullback_entry: 0.8,
        mean_reversion: 0.2,
        counter_trend_fade: 0.1,
        reversal_confirmed: 0.2,
        momentum_add: 0.95,
      };
    case 'EXHAUSTION':
      return {
        trend_continuation: 0.25,
        breakout_early: 0.2,
        breakout_late: 0.1,
        pullback_entry: 0.3,
        mean_reversion: 0.75,
        counter_trend_fade: 0.6,
        reversal_confirmed: 1.0,
        momentum_add: 0.15,
      };
    default:
      return {
        trend_continuation: 0.4,
        breakout_early: 0.4,
        breakout_late: 0.25,
        pullback_entry: 0.45,
        mean_reversion: 0.45,
        counter_trend_fade: 0.35,
        reversal_confirmed: 0.4,
        momentum_add: 0.35,
      };
  }
}

function statePolicy(state: InstitutionalFlowState): Pick<FlowTradePermission, 'sizeMultiplier' | 'stopStyle' | 'allowed' | 'blockedTrades' | 'riskMode'> {
  switch (state) {
    case 'ACCUMULATION':
      return {
        sizeMultiplier: 0.4,
        stopStyle: 'tight_structural',
        riskMode: 'low',
        allowed: ['Range bounces at liquidity edges', 'VWAP reversion', 'Fade extremes (high confidence)'],
        blockedTrades: ['Breakout chasing', 'Momentum entries', 'Late trend continuation'],
      };
    case 'POSITIONING':
      return {
        sizeMultiplier: 0.7,
        stopStyle: 'structural',
        riskMode: 'medium',
        allowed: ['Pullbacks aligned with bias', 'Early breakout prep', 'Compression break alerts'],
        blockedTrades: ['Late breakout entries', 'Counter-trend scalps'],
      };
    case 'LAUNCH':
      return {
        sizeMultiplier: 1,
        stopStyle: 'atr_trailing',
        riskMode: 'high',
        allowed: ['Trend continuation', 'Breakout retests', 'Momentum add-ons'],
        blockedTrades: ['Counter-trend fades', 'Early reversal guesses'],
      };
    case 'EXHAUSTION':
      return {
        sizeMultiplier: 0.5,
        stopStyle: 'wider_confirmation',
        riskMode: 'medium',
        allowed: ['Profit-taking', 'Confirmed reversals', 'Mean reversion to VWAP'],
        blockedTrades: ['New trend entries', 'Breakout continuation'],
      };
    default:
      return {
        sizeMultiplier: 0.5,
        stopStyle: 'structural',
        riskMode: 'medium',
        allowed: ['Wait for state confirmation'],
        blockedTrades: ['Aggressive continuation entries'],
      };
  }
}

export function computeFlowTradePermission(input: FlowTradePermissionInput): FlowTradePermission {
  const alignment = alignmentMap(input.state);
  const policy = statePolicy(input.state);

  const stateAlignmentScore = alignment[input.preferredArchetype] ?? 0.4;
  const institutionalProbability = clamp01(input.institutionalProbability / 100);
  const dataHealth = clamp01(input.dataHealthScore / 100);
  const liquidityClarity = clamp01(input.liquidityClarity / 100);

  let tps =
    (institutionalProbability * 0.5) +
    (stateAlignmentScore * 0.3) +
    (dataHealth * 0.1) +
    (liquidityClarity * 0.1);

  // ── Session Overlay Adjustments ─────────────────────────────────
  const so = input.sessionOverlay ?? null;
  let sessionAdjustment: FlowTradePermission['sessionAdjustment'];
  let sizeCapApplied = false;
  let failsSessionConfidence = false;
  let failsSessionLiquidity = false;
  // Score after the session's additive adjustment but before a failed session gate caps it (see below).
  let tpsBeforeGate = tps;

  if (so) {
    // Apply additive TPS modifier (scaled to 0-1 range)
    tps = tps + (so.tpsAdjustment / 100);
    tps = Math.max(0, Math.min(1, tps));

    // Session gates — block if confidence or liquidity below session minimums
    const failsConfidenceGate = so.minimumConfidence > 0 && input.stateConfidence < so.minimumConfidence;
    const failsLiquidityGate = so.minimumLiquidityClarity > 0 && (input.liquidityClarity) < so.minimumLiquidityClarity;

    failsSessionConfidence = failsConfidenceGate;
    failsSessionLiquidity = failsLiquidityGate;
    tpsBeforeGate = tps;
    if (failsConfidenceGate || failsLiquidityGate) {
      tps = Math.min(tps, (so.minimumTps - 1) / 100); // ensure it falls below the session TPS threshold
    }

    sessionAdjustment = {
      phase: so.phase,
      tpsAdjustment: so.tpsAdjustment,
      sizeCapApplied: false, // updated below
      restrictive: so.restrictive,
      reason: so.reason,
    };
  }

  const lowVolatility = input.volatilityCompression >= 70 && input.atrExpansionRate <= 35;
  const unclearLiquidity = input.liquidityClarity < 45;
  const staleData = input.dataHealthScore < 55;

  const autoNoTrade =
    (input.state === 'ACCUMULATION' && lowVolatility && unclearLiquidity) ||
    staleData;

  // Use session-specific minimum TPS if provided, otherwise base threshold
  const tpsThreshold = so ? so.minimumTps / 100 : BASE_TPS_THRESHOLD;
  const blocked = autoNoTrade || tps < tpsThreshold;
  // "Session-limited" (shown as "Unavailable this session") only when the score itself clears the standard threshold
  // and it is a session requirement that blocks it: the session's higher TPS bar (e.g. midday 70) or one of its
  // confidence/liquidity minimums. A score below the standard threshold is weak data and reads as a normal BLOCKED,
  // whatever the session. Never for crypto: it trades 24/7, so there is no session to be "unavailable" in.
  const sessionGateFailed = !!so && (failsSessionConfidence || failsSessionLiquidity);
  const isCrypto = so?.assetClass === 'crypto';
  const sessionLimited = !autoNoTrade && blocked && !!so && !isCrypto &&
    tpsBeforeGate >= BASE_TPS_THRESHOLD &&
    (sessionGateFailed || tpsThreshold > BASE_TPS_THRESHOLD);

  // Whole-number score exactly as the cards show it (`tps` is returned to one decimal and displayed with toFixed(0)), so
  // the reason never quotes a different number from the card.
  const pct = (v: number) => Math.round(Number((v * 100).toFixed(1)));
  const tpsThr = pct(tpsThreshold);
  // A raw score just under the threshold can round up to it: show one (floored) decimal rather than "68 below 68".
  const scoreBelow = (v: number) => (pct(v) < tpsThr ? String(pct(v)) : (Math.floor(v * 1000) / 10).toFixed(1));
  // Only a score that rounds ABOVE a threshold "clears" it; one that rounds to it "meets" it.
  const passVerb = (v: number, threshold: number) => (pct(v) > pct(threshold) ? 'clears' : 'meets');
  const failedGateText = !so ? '' : failsSessionConfidence
    ? `state confidence ${Math.round(input.stateConfidence)} is below the ${so.minimumConfidence} minimum`
    : `liquidity clarity ${Math.round(input.liquidityClarity)} is below the ${so.minimumLiquidityClarity} minimum`;
  // A failed session gate caps the score just under the session bar; the card shows the capped score.
  const capNote = pct(tps) !== pct(tpsBeforeGate) ? ` (score capped at ${pct(tps)})` : '';

  let reason = 'Permission granted';
  if (autoNoTrade && staleData) reason = 'NO-TRADE MODE: data health stale';
  else if (autoNoTrade) reason = 'NO-TRADE MODE: accumulation + low volatility + unclear liquidity';
  else if (sessionLimited && sessionGateFailed) reason = `Unavailable in ${sessionLabel(so!.phase)} session: Trade Permission Score ${pct(tpsBeforeGate)} ${passVerb(tpsBeforeGate, BASE_TPS_THRESHOLD)} the standard ${pct(BASE_TPS_THRESHOLD)} but ${failedGateText} for this session${capNote}`;
  else if (sessionLimited) reason = `Unavailable in ${sessionLabel(so!.phase)} session: Trade Permission Score ${pct(tps)} ${passVerb(tps, BASE_TPS_THRESHOLD)} the standard ${pct(BASE_TPS_THRESHOLD)} but this session requires ${tpsThr}`;
  else if (blocked && sessionGateFailed) {
    // Weak branch quotes the capped score (what the card shows; always below the bar). Otherwise the gate is the blocker
    // and the pre-cap score is given with an honest verb.
    reason = tpsBeforeGate < tpsThreshold
      ? `BLOCKED: Trade Permission Score ${pct(tps)} below threshold (${tpsThr}); ${failedGateText} for ${sessionHours(so!.phase)}`
      : `BLOCKED: ${failedGateText} for ${sessionHours(so!.phase)}, so the Trade Permission Score is capped at ${pct(tps)} (${pct(tpsBeforeGate)} before the cap, which would otherwise ${passVerb(tpsBeforeGate, tpsThreshold) === 'clears' ? 'clear' : 'meet'} the ${tpsThr} threshold)`;
  }
  else if (tps < tpsThreshold) reason = `BLOCKED: Trade Permission Score ${scoreBelow(tps)} below threshold (${tpsThr})`;

  let scaledSize = blocked ? Math.min(policy.sizeMultiplier, 0.35) : policy.sizeMultiplier;

  // Apply session size cap
  if (so) {
    if (scaledSize > so.sizeMultiplierCap) {
      scaledSize = so.sizeMultiplierCap;
      sizeCapApplied = true;
    }
    if (sessionAdjustment) {
      sessionAdjustment.sizeCapApplied = sizeCapApplied;
    }
  }

  // Merge allowed/blocked lists with session overrides
  let mergedAllowed = [...policy.allowed];
  let mergedBlocked = [...policy.blockedTrades];
  let stopStyle = policy.stopStyle;

  if (so) {
    mergedAllowed = [...mergedAllowed, ...so.sessionAllowed];
    mergedBlocked = [...mergedBlocked, ...so.sessionBlocked];
    if (so.stopStyleOverride) {
      stopStyle = so.stopStyleOverride;
    }
  }

  return {
    state: input.state,
    tps: Number((tps * 100).toFixed(1)),
    blocked,
    noTradeMode: {
      active: autoNoTrade,
      reason,
    },
    ...(sessionLimited ? { sessionLimited: true } : {}),
    riskMode: blocked ? 'high' : policy.riskMode,
    sizeMultiplier: Number(scaledSize.toFixed(2)),
    stopStyle,
    allowed: mergedAllowed,
    blockedTrades: mergedBlocked,
    alignmentByArchetype: alignment,
    selectedArchetype: input.preferredArchetype,
    ...(sessionAdjustment ? { sessionAdjustment } : {}),
  };
}

/**
 * Permission reasons already carry their own prefix ("BLOCKED: …", "NO-TRADE MODE: …"). UI that adds its own
 * label ("Blocked: ", "Analysis paused: ") uses this so the page never reads "Blocked: BLOCKED: …" (RS-9).
 */
export function stripBlockedPrefix(reason: string | null | undefined): string {
  return String(reason ?? '').replace(/^\s*BLOCKED:\s*/i, '').trim();
}

/** "Blocked: <reason>" with no doubled prefix; NO-TRADE MODE reasons are shown as they are. */
export function blockedReasonLabel(reason: string | null | undefined, fallback = 'permission conditions not met'): string {
  const text = String(reason ?? '').trim();
  if (/^NO-TRADE MODE\b/i.test(text)) return text;
  return `Blocked: ${stripBlockedPrefix(text) || fallback}`;
}
