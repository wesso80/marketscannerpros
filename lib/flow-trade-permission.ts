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

  if (so) {
    // Apply additive TPS modifier (scaled to 0-1 range)
    tps = tps + (so.tpsAdjustment / 100);
    tps = Math.max(0, Math.min(1, tps));

    // Session gates — block if confidence or liquidity below session minimums
    const failsConfidenceGate = so.minimumConfidence > 0 && input.stateConfidence < so.minimumConfidence;
    const failsLiquidityGate = so.minimumLiquidityClarity > 0 && (input.liquidityClarity) < so.minimumLiquidityClarity;

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
  const tpsThreshold = so ? so.minimumTps / 100 : 0.65;
  const blocked = autoNoTrade || tps < tpsThreshold;

  let reason = 'Permission granted';
  if (autoNoTrade && staleData) reason = 'NO-TRADE MODE: data health stale';
  else if (autoNoTrade) reason = 'NO-TRADE MODE: accumulation + low volatility + unclear liquidity';
  else if (tps < tpsThreshold) reason = `BLOCKED: Trade Permission Score ${Math.round(tps * 100)} below threshold (${Math.round(tpsThreshold * 100)})`;

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
