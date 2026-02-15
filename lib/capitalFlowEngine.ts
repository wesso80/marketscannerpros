import { computeInstitutionalFlowState, InstitutionalFlowStateOutput } from './institutional-flow-state-engine';
import { computeFlowTradePermission } from './flow-trade-permission';
import { computeInstitutionalRiskGovernor } from './institutional-risk-governor';
import { computeBrainDecision } from './institutional-brain';

export type FlowBias = 'bullish' | 'bearish' | 'neutral';
export type MarketMode = 'pin' | 'launch' | 'chop';
export type GammaState = 'Positive' | 'Negative' | 'Mixed';

export interface FlowKeyStrike {
  strike: number;
  gravity: number;
  type: 'call-heavy' | 'put-heavy' | 'mixed';
}

export interface FlowFlipZone {
  level: number;
  direction: 'bullish_above' | 'bearish_below';
}

export interface FlowLiquidityLevel {
  level: number;
  label: string;
  prob: number;
}

export interface CapitalFlowResult {
  symbol: string;
  asof: string;
  market_type: 'equity' | 'crypto';
  spot: number;
  market_mode: MarketMode;
  gamma_state: GammaState;
  bias: FlowBias;
  conviction: number;
  conviction_factors: {
    mode: number;
    flow: number;
    liquidity: number;
    regime: number;
    data: number;
    alignmentMultiplier: number;
    timeModifier: number;
    locationModifier: number;
  };
  probability_matrix: {
    continuation: number;
    pinReversion: number;
    expansion: number;
    regime: 'TRENDING' | 'PINNING' | 'EXPANDING' | 'MIXED';
    deltaExpansion: number;
    acceleration: 'rising' | 'falling' | 'flat';
    decision: 'allow_trend_setups' | 'avoid_breakouts' | 'prep_breakout_strategies';
    raw: {
      continuation: number;
      pin: number;
      expansion: number;
    };
  };
  flow_state: InstitutionalFlowStateOutput;
  flow_trade_permission: {
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
    selectedArchetype: string;
  };
  institutional_risk_governor: {
    executionAllowed: boolean;
    hardBlocked: boolean;
    hardBlockReasons: string[];
    irs: number;
    riskMode: 'FULL_OFFENSE' | 'NORMAL' | 'DEFENSIVE' | 'LOCKDOWN';
    capital: {
      usedPercent: number;
      openRiskPercent: number;
      proposedRiskPercent: number;
      dailyRiskPercent: number;
      maxRiskPerTrade: number;
      maxDailyRisk: number;
      maxOpenRisk: number;
      blocked: boolean;
      reason: string;
      score: number;
    };
    drawdown: {
      dailyR: number;
      sizeMultiplier: number;
      aPlusOnly: boolean;
      lockout: boolean;
      score: number;
      action: string;
    };
    correlation: {
      cluster: string;
      correlatedCount: number;
      maxCorrelated: number;
      blocked: boolean;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      score: number;
      reason: string;
    };
    volatility: {
      regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
      breakoutBlocked: boolean;
      sizeMultiplier: number;
      score: number;
    };
    behavior: {
      cooldownActive: boolean;
      cooldownMinutes: number;
      overtradingBlocked: boolean;
      score: number;
      reason: string;
    };
    sizing: {
      baseSize: number;
      flowStateMultiplier: number;
      riskGovernorMultiplier: number;
      personalPerformanceMultiplier: number;
      finalSize: number;
    };
    allowed: string[];
    blocked: string[];
  };
  brain_decision: {
    score: number;
    regimeFit: number;
    flowAlignment: number;
    setupQuality: number;
    riskPermission: number;
    dataHealth: number;
    mode: 'FULL_OFFENSE' | 'NORMAL' | 'DEFENSIVE' | 'LOCKDOWN';
    permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
    stateSummary: string;
    allowed: string[];
    blocked: string[];
    requiredTrigger: string;
    plan: {
      entryType: 'breakout' | 'pullback' | 'reclaim' | 'sweep' | 'none';
      triggers: string[];
      stopRule: string;
      targets: string[];
      management: string[];
      size: number;
    };
  };
  brain_decision_v1: {
    meta: {
      schema_version: '1.0';
      generated_at: string;
      symbol: string;
      asset_class: 'equity' | 'crypto';
      timeframes: string[];
      data_confidence: number;
    };
    data_health: {
      freshness_ms: number;
      sources: {
        price: string;
        options: string;
        news: string;
      };
      fallback_active: boolean;
      health_score: number;
    };
    market_regime: {
      regime: 'trend_day' | 'mean_revert_day' | 'vol_expansion' | 'vol_compression' | 'liquidity_vacuum' | 'news_shock';
      risk_mode: 'risk_on' | 'risk_off';
      volatility_state: 'low' | 'normal' | 'high' | 'extreme';
      liquidity_state: 'low' | 'normal' | 'high';
      confidence: number;
    };
    capital_flow: {
      flow_bias: 'bullish' | 'bearish' | 'neutral';
      flow_strength: number;
      sector_rotation_rank: number;
      leadership_score: number;
      options_bias: 'calls_dominant' | 'puts_dominant' | 'balanced';
    };
    institutional_filter: {
      eligible: boolean;
      score: number;
      reject_reasons: string[];
    };
    probability_matrix: {
      p_up: number;
      p_down: number;
      expected_move_pct: number;
      confidence: number;
      best_playbook: string;
    };
    flow_state: {
      state: 'accumulation' | 'positioning' | 'launch' | 'exhaustion';
      timing_quality: number;
      invalidate_level: number | null;
    };
    trade_permission: {
      permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
      size_multiplier: number;
      required_trigger: string;
      blocked_playbooks: string[];
    };
    risk_governor: {
      mode: 'offense' | 'normal' | 'defensive' | 'lockdown';
      account_risk_pct: number;
      cooldown_active: boolean;
      correlation_risk: number;
      override_reason: string | null;
    };
    execution_plan: {
      entry_type: 'breakout' | 'pullback' | 'reclaim' | 'sweep' | 'none';
      entry_zone: [number, number];
      stop: number;
      targets: [number, number];
      r_multiple_targets: [number, number];
      management_rules: string[];
    };
    brain_score: {
      overall: number;
      components: {
        regime_fit: number;
        flow_alignment: number;
        setup_quality: number;
        risk_permission: number;
        data_health: number;
      };
    };
    learning_hooks: {
      setup_id: string;
      model_weights_version: string;
      features_snapshot: Record<string, unknown>;
    };
    state_machine: {
      state: 'SCAN' | 'WATCH' | 'STALK' | 'ARMED' | 'EXECUTE' | 'MANAGE' | 'COOLDOWN' | 'BLOCKED';
      previous_state: 'SCAN' | 'WATCH' | 'STALK' | 'ARMED' | 'EXECUTE' | 'MANAGE' | 'COOLDOWN' | 'BLOCKED';
      state_since: string;
      playbook: string;
      direction: 'long' | 'short';
      gates: {
        data_health: { pass: boolean; score: number; reason: string | null };
        regime: { pass: boolean; value: string; reason: string | null };
        institutional_filter: { pass: boolean; score: number; reason: string | null };
        capital_flow: { pass: boolean; bias: 'bullish' | 'bearish' | 'neutral'; strength: number };
        flow_state: { pass: boolean; state: string; timing_quality: number };
        setup_quality: { pass: boolean; missing: string[]; invalidate_level: number | null };
        trigger: { pass: boolean; definition: string; current: string; eta: string };
        risk_governor: { pass: boolean; permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK'; size_multiplier: number };
      };
      next_best_action: {
        action: 'WAIT' | 'SET_ALERT' | 'PREP_ORDER' | 'EXECUTE' | 'MANAGE' | 'STANDBY' | 'REVIEW';
        when: string;
        notes: string;
      };
      block_reasons: string[];
      cooldown: {
        active: boolean;
        until: string | null;
      };
      audit: {
        transition_reason: string;
        decision_confidence: number;
      };
      state_momentum: {
        velocity: 'slow' | 'medium' | 'fast';
        decay: 'low' | 'medium' | 'high';
        state_age_minutes: number;
      };
    };
  };
  execution_allowed: boolean;
  dominant_expiry: '0DTE' | 'weekly' | 'monthly' | 'long_dated' | 'unknown';
  pin_strike: number | null;
  key_strikes: FlowKeyStrike[];
  flip_zones: FlowFlipZone[];
  liquidity_levels: FlowLiquidityLevel[];
  most_likely_path: string[];
  risk: string[];
  chop_zone: {
    active: boolean;
    low: number | null;
    high: number | null;
  };
  data_health: {
    options_chain: 'fresh' | 'delayed' | 'stale' | 'none';
    last_chain_update_sec: number | null;
    fallback_active: boolean;
  };
}

type OIStrike = {
  strike: number;
  openInterest: number;
  type: 'call' | 'put';
  iv?: number;
};

export interface CapitalFlowInput {
  symbol: string;
  marketType?: 'equity' | 'crypto';
  spot: number;
  vwap?: number;
  atr?: number;
  dte?: number;
  openInterest?: {
    totalCallOI: number;
    totalPutOI: number;
    pcRatio?: number;
    expirationDate?: string;
    highOIStrikes: OIStrike[];
  } | null;
  cryptoPositioning?: {
    openInterestUsd?: number;
    oiChangePercent?: number;
    fundingRate?: number;
    basisPercent?: number;
    longShortRatio?: number;
    liquidationLevels?: Array<{ level: number; side: 'long_liq' | 'short_liq'; weight?: number }>;
  } | null;
  liquidityLevels?: Array<{ level: number; label: string }>;
  trendMetrics?: {
    adx?: number;
    emaAligned?: boolean;
    structureHigherHighs?: boolean;
  };
  dataHealth?: {
    freshness?: 'REALTIME' | 'LIVE' | 'DELAYED' | 'CACHED' | 'EOD' | 'STALE' | 'NONE';
    fallbackActive?: boolean;
    lastUpdatedIso?: string;
    missingFieldsCount?: number;
  };
  riskGovernorContext?: {
    account?: {
      openRiskPercent?: number;
      proposedRiskPercent?: number;
      dailyRiskPercent?: number;
      dailyR?: number;
    };
    exposure?: {
      openPositions?: Array<{ symbol: string; direction?: 'long' | 'short'; cluster?: string }>;
      proposedPosition?: { symbol: string; direction?: 'long' | 'short'; cluster?: string };
    };
    behavior?: {
      consecutiveLosses?: number;
      lossesWindowMinutes?: number;
      tradesThisSession?: number;
      expectancyR?: number;
      ruleViolations?: number;
    };
    volatilityRegimeOverride?: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
    stateMachineContext?: {
      currentState?: 'SCAN' | 'WATCH' | 'STALK' | 'ARMED' | 'EXECUTE' | 'MANAGE' | 'COOLDOWN' | 'BLOCKED';
      previousState?: 'SCAN' | 'WATCH' | 'STALK' | 'ARMED' | 'EXECUTE' | 'MANAGE' | 'COOLDOWN' | 'BLOCKED';
      stateSinceIso?: string;
      event?:
        | 'price_tick'
        | 'bar_close_1m'
        | 'bar_close_5m'
        | 'bar_close_15m'
        | 'options_flow_update'
        | 'capital_flow_shift'
        | 'institutional_filter_update'
        | 'news_event'
        | 'macro_regime_change'
        | 'volatility_regime_change'
        | 'data_health_change'
        | 'risk_governor_update'
        | 'manual_override'
        | 'entry_filled'
        | 'partial_exit'
        | 'position_closed'
        | 'stop_hit'
        | 'target_hit';
      cooldownUntilIso?: string | null;
      positionOpen?: boolean;
      edgeDecay?: boolean;
      triggerCurrent?: string;
      triggerEta?: string;
      setupMissing?: string[];
      playbook?: string;
      direction?: 'long' | 'short';
    };
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const expansionHistory = new Map<string, number>();
const trendHistory = new Map<string, number>();

function parseDte(expirationDate?: string): number | null {
  if (!expirationDate) return null;
  const expiry = new Date(expirationDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((expiry.getTime() - now.getTime()) / dayMs));
}

function expiryBucket(dte: number | null): CapitalFlowResult['dominant_expiry'] {
  if (dte === null) return 'unknown';
  if (dte <= 1) return '0DTE';
  if (dte <= 7) return 'weekly';
  if (dte <= 35) return 'monthly';
  return 'long_dated';
}

function classifyStrikeType(callOi: number, putOi: number): FlowKeyStrike['type'] {
  const total = callOi + putOi;
  if (total <= 0) return 'mixed';
  const callShare = callOi / total;
  if (callShare >= 0.6) return 'call-heavy';
  if (callShare <= 0.4) return 'put-heavy';
  return 'mixed';
}

function dataFreshnessBucket(freshness?: NonNullable<CapitalFlowInput['dataHealth']>['freshness']): CapitalFlowResult['data_health']['options_chain'] {
  if (freshness === 'REALTIME' || freshness === 'LIVE') return 'fresh';
  if (freshness === 'DELAYED' || freshness === 'CACHED' || freshness === 'EOD') return 'delayed';
  if (freshness === 'STALE') return 'stale';
  return 'none';
}

function dataScoreFromHealth(dataHealth?: CapitalFlowInput['dataHealth']): number {
  const freshness = dataHealth?.freshness;
  let score = freshness === 'REALTIME' || freshness === 'LIVE'
    ? 100
    : freshness === 'DELAYED' || freshness === 'CACHED'
      ? 80
      : freshness === 'EOD'
        ? 70
        : freshness === 'STALE'
          ? 45
          : 35;

  if (dataHealth?.fallbackActive) score -= 25;
  if ((dataHealth?.missingFieldsCount ?? 0) > 0) score -= Math.min(30, (dataHealth?.missingFieldsCount ?? 0) * 8);
  if (dataHealth?.lastUpdatedIso) {
    const ageSec = Math.max(0, Math.round((Date.now() - new Date(dataHealth.lastUpdatedIso).getTime()) / 1000));
    if (ageSec > 60) score -= 20;
  }
  return clamp(score, 5, 100);
}

function buildLiquidityProbabilities(
  levels: Array<{ level: number; label: string }>,
  spot: number,
  atr: number,
  mode: MarketMode
): FlowLiquidityLevel[] {
  const range = Math.max(atr, spot * 0.006, 0.25);
  return levels
    .filter((level) => Number.isFinite(level.level))
    .map((level) => {
      const distance = Math.abs(level.level - spot);
      const distanceScore = Math.exp(-distance / range);
      const modeBoost = mode === 'pin'
        ? 0.06
        : mode === 'launch' && /PDH|PDL|WEEK|EQH|EQL|LIQ|ROUND|VWAP/.test(level.label)
          ? 0.08
          : 0;
      return {
        level: Number(level.level.toFixed(2)),
        label: level.label,
        prob: Number(clamp(distanceScore + modeBoost, 0.1, 0.95).toFixed(2)),
      };
    })
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 8);
}

function dedupeLiquidity(levels: Array<{ level: number; label: string }>): Array<{ level: number; label: string }> {
  const seen = new Set<string>();
  const deduped: Array<{ level: number; label: string }> = [];
  for (const item of levels) {
    const key = `${item.label}:${item.level.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function normalizedPcr(pcr: number): number {
  return clamp((pcr - 0.6) / (1.4 - 0.6), 0, 1);
}

function buildCryptoClusters(input: CapitalFlowInput): FlowKeyStrike[] {
  const spot = input.spot;
  const positioning = input.cryptoPositioning;
  const liq = positioning?.liquidationLevels ?? [];
  const levels = liq.length
    ? liq
    : [
        { level: spot * 0.985, side: 'long_liq' as const, weight: 0.75 },
        { level: spot * 1.015, side: 'short_liq' as const, weight: 0.75 },
      ];

  const maxWeight = Math.max(1, ...levels.map((level) => level.weight ?? 0.6));
  return levels
    .map((level) => ({
      strike: Number(level.level.toFixed(2)),
      gravity: Number(clamp((level.weight ?? 0.6) / maxWeight, 0.2, 1).toFixed(2)),
      type: (level.side === 'short_liq' ? 'call-heavy' : 'put-heavy') as 'call-heavy' | 'put-heavy',
    }))
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, 8);
}

function computeLiquidityScore(
  liquidityLevels: FlowLiquidityLevel[],
  spot: number,
  bias: FlowBias
): { score: number; clearPath: boolean } {
  const targetsAhead = bias === 'bearish'
    ? liquidityLevels.filter((level) => level.level < spot && level.prob >= 0.45).length
    : liquidityLevels.filter((level) => level.level > spot && level.prob >= 0.45).length;

  const opposingNear = bias === 'bearish'
    ? liquidityLevels.some((level) => level.level > spot && Math.abs(level.level - spot) / spot < 0.004)
    : liquidityLevels.some((level) => level.level < spot && Math.abs(level.level - spot) / spot < 0.004);

  const clearPath = targetsAhead >= 2;
  const score = clearPath
    ? 85
    : opposingNear
      ? 42
      : 62;

  return { score, clearPath };
}

function normalizeProbabilities(rawA: number, rawB: number, rawC: number): [number, number, number] {
  const a = Math.max(0.0001, rawA);
  const b = Math.max(0.0001, rawB);
  const c = Math.max(0.0001, rawC);
  const total = a + b + c;
  const pA = Math.round((a / total) * 100);
  const pB = Math.round((b / total) * 100);
  const pC = 100 - pA - pB;
  return [pA, pB, pC];
}

export function computeCapitalFlowEngine(input: CapitalFlowInput): CapitalFlowResult {
  const marketType = input.marketType ?? 'equity';
  const spot = Number(input.spot);
  const atr = Number.isFinite(input.atr) && input.atr && input.atr > 0 ? input.atr : spot * (marketType === 'crypto' ? 0.02 : 0.015);
  const dte = typeof input.dte === 'number' ? Math.max(0, input.dte) : parseDte(input.openInterest?.expirationDate);
  const timeWeight = dte === null ? 0.3 : 1 / (1 + dte);
  const gravityRange = Math.max(spot * 0.01, 0.5);
  const vwap = Number.isFinite(input.vwap) ? Number(input.vwap) : undefined;

  const strikeMap = new Map<number, { callOi: number; putOi: number; gravityRaw: number }>();
  if (marketType === 'equity') {
    const strikes = input.openInterest?.highOIStrikes ?? [];
    for (const strike of strikes) {
      if (!Number.isFinite(strike.strike) || strike.openInterest <= 0) continue;
      const existing = strikeMap.get(strike.strike) ?? { callOi: 0, putOi: 0, gravityRaw: 0 };
      const prox = Math.exp(-Math.abs(strike.strike - spot) / gravityRange);
      const iv = Number.isFinite(strike.iv) ? Math.max(0.05, Number(strike.iv)) : 0.35;
      const ivWeight = clamp(0.8 + iv * 0.4, 0.75, 1.45);
      const gravity = strike.openInterest * prox * timeWeight * ivWeight;
      if (strike.type === 'call') existing.callOi += strike.openInterest;
      else existing.putOi += strike.openInterest;
      existing.gravityRaw += gravity;
      strikeMap.set(strike.strike, existing);
    }
  }

  const maxGravityRaw = Math.max(1, ...Array.from(strikeMap.values()).map((entry) => entry.gravityRaw));
  const equityKeyStrikes: FlowKeyStrike[] = Array.from(strikeMap.entries())
    .map(([strike, values]) => ({
      strike,
      gravity: Number(clamp(values.gravityRaw / maxGravityRaw, 0, 1).toFixed(2)),
      type: classifyStrikeType(values.callOi, values.putOi),
    }))
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, 8);

  const keyStrikes = marketType === 'crypto' ? buildCryptoClusters(input) : equityKeyStrikes;
  const pinStrike = keyStrikes[0]?.strike ?? null;
  const pinDistancePercent = pinStrike ? (Math.abs(pinStrike - spot) / spot) * 100 : 99;

  const callBand = Array.from(strikeMap.entries())
    .filter(([strike]) => Math.abs(strike - spot) <= spot * 0.01)
    .reduce((sum, [, value]) => sum + value.callOi, 0);
  const putBand = Array.from(strikeMap.entries())
    .filter(([strike]) => Math.abs(strike - spot) <= spot * 0.01)
    .reduce((sum, [, value]) => sum + value.putOi, 0);
  const pcrBand = putBand / Math.max(1, callBand);

  const cryptoFunding = input.cryptoPositioning?.fundingRate ?? 0;
  const cryptoOiChange = input.cryptoPositioning?.oiChangePercent ?? 0;
  const cryptoLs = input.cryptoPositioning?.longShortRatio ?? 1;
  const extremeFunding = Math.abs(cryptoFunding) >= 0.04;
  const highCrowding = Math.abs(cryptoOiChange) >= 3 || cryptoLs >= 1.3 || cryptoLs <= 0.77;

  const centeredMixed = keyStrikes.slice(0, 2).every((strike) => strike.type === 'mixed');
  const oneSidedEquity = pcrBand < 0.7 || pcrBand > 1.3;

  const gammaState: GammaState = marketType === 'crypto'
    ? (extremeFunding && highCrowding ? 'Negative' : Math.abs(cryptoFunding) <= 0.015 ? 'Positive' : 'Mixed')
    : centeredMixed && pinDistancePercent <= 0.7
      ? 'Positive'
      : oneSidedEquity
        ? 'Negative'
        : 'Mixed';

  const marketMode: MarketMode = marketType === 'crypto'
    ? (extremeFunding && highCrowding ? 'launch' : Math.abs(cryptoFunding) <= 0.015 && Math.abs(cryptoOiChange) < 2 ? 'pin' : 'chop')
    : gammaState === 'Positive'
      ? 'pin'
      : gammaState === 'Negative'
        ? 'launch'
        : 'chop';

  const bias: FlowBias = marketType === 'crypto'
    ? (cryptoFunding > 0.01 && cryptoLs >= 1 && (!vwap || spot >= vwap)
        ? 'bullish'
        : cryptoFunding < -0.01 && cryptoLs <= 1 && (!vwap || spot <= vwap)
          ? 'bearish'
          : 'neutral')
    : pcrBand < 0.8 && (!vwap || spot >= vwap * 0.998)
      ? 'bullish'
      : pcrBand > 1.2 && (!vwap || spot <= vwap * 1.002)
        ? 'bearish'
        : 'neutral';

  const sortedStrikes = [...keyStrikes].sort((a, b) => a.strike - b.strike);
  const nearestBelow = sortedStrikes.filter((entry) => entry.strike < spot).pop();
  const nearestAbove = sortedStrikes.find((entry) => entry.strike > spot);
  const flipZones: FlowFlipZone[] = [
    ...(nearestBelow ? [{ level: Number(((nearestBelow.strike + spot) / 2).toFixed(2)), direction: 'bearish_below' as const }] : []),
    ...(nearestAbove ? [{ level: Number(((nearestAbove.strike + spot) / 2).toFixed(2)), direction: 'bullish_above' as const }] : []),
  ];

  const roundLevel = spot >= 1000 ? Math.round(spot / 100) * 100 : spot >= 100 ? Math.round(spot / 10) * 10 : spot >= 10 ? Math.round(spot) : Number((Math.round(spot * 10) / 10).toFixed(1));

  const liquidations = input.cryptoPositioning?.liquidationLevels?.map((level) => ({
    level: level.level,
    label: level.side === 'long_liq' ? 'LONG_LIQ' : 'SHORT_LIQ',
  })) ?? [];

  const liquidityInput = dedupeLiquidity([
    ...(input.liquidityLevels ?? []),
    ...(vwap ? [{ level: vwap, label: 'VWAP' }] : []),
    ...(pinStrike ? [{ level: pinStrike, label: marketType === 'crypto' ? 'POS_CLUSTER' : 'PIN' }] : []),
    ...(marketType === 'crypto' ? [{ level: roundLevel, label: 'ROUND' }] : []),
    ...liquidations,
  ]);

  const liquidityLevels = buildLiquidityProbabilities(liquidityInput, spot, atr, marketMode);
  const primaryLiquidity = liquidityLevels[0];
  const directionalFlip = bias === 'bearish' ? flipZones.find((zone) => zone.direction === 'bearish_below') : flipZones.find((zone) => zone.direction === 'bullish_above');
  const nextDirectionalStrike = bias === 'bearish'
    ? sortedStrikes.filter((strike) => strike.strike < spot).pop()
    : sortedStrikes.find((strike) => strike.strike > spot);

  const trendBias: FlowBias = vwap ? (spot >= vwap ? 'bullish' : 'bearish') : 'neutral';
  const adx = input.trendMetrics?.adx;
  const atrPercent = (atr / Math.max(spot, 0.0001)) * 100;
  const structureHigherHighs = input.trendMetrics?.structureHigherHighs ?? (marketMode === 'launch');

  const modeScore = marketMode === 'pin'
    ? clamp(100 - (pinDistancePercent * 120), 20, 98)
    : marketMode === 'launch'
      ? (directionalFlip && ((bias === 'bullish' && spot > directionalFlip.level) || (bias === 'bearish' && spot < directionalFlip.level)) ? 92 : 56)
      : 35;

  const flowScore = (() => {
    if (marketType === 'equity') {
      const pcrNorm = normalizedPcr(pcrBand || (input.openInterest?.pcRatio ?? 1));
      let score = bias === 'bullish'
        ? (1 - pcrNorm) * 100
        : bias === 'bearish'
          ? pcrNorm * 100
          : 55;
      if (bias !== 'neutral' && trendBias === bias) score += 10;
      if (bias !== 'neutral' && trendBias !== 'neutral' && trendBias !== bias) score -= 15;
      return clamp(score, 5, 100);
    }

    let score = 50;
    score += clamp(Math.abs(cryptoOiChange) * 4, 0, 18);
    score += clamp(Math.abs(cryptoFunding) * 350, 0, 18);
    if (cryptoLs > 1.2 || cryptoLs < 0.8) score += 8;

    if (cryptoOiChange > 0 && cryptoFunding > 0.02 && trendBias === 'bullish') score -= 10;
    if (cryptoOiChange < 0 && Math.abs(cryptoFunding) < 0.015 && trendBias !== 'neutral') score += 8;

    if (bias !== 'neutral' && trendBias !== 'neutral' && bias !== trendBias) score -= 12;
    if (bias !== 'neutral' && bias === trendBias) score += 8;

    return clamp(score, 5, 100);
  })();

  const liquidityScored = computeLiquidityScore(liquidityLevels, spot, bias);
  const liquidityScore = liquidityScored.score;

  const regimeScore = (() => {
    const emaAligned = input.trendMetrics?.emaAligned ?? (vwap ? (bias === 'bullish' ? spot >= vwap : bias === 'bearish' ? spot <= vwap : true) : true);
    const trend = emaAligned ? 40 : 20;
    const vol = atrPercent >= (marketType === 'crypto' ? 2 : 1) ? 30 : 10;
    const structure = structureHigherHighs ? 30 : 15;
    const adxBonus = Number.isFinite(adx) ? clamp((adx! - 18) * 1.2, 0, 10) : 0;
    return clamp(trend + vol + structure + adxBonus, 5, 100);
  })();

  const dataScore = dataScoreFromHealth(input.dataHealth);

  let convictionRaw =
    (modeScore * 0.25) +
    (flowScore * 0.25) +
    (liquidityScore * 0.20) +
    (regimeScore * 0.20) +
    (dataScore * 0.10);

  const regimeTrending = regimeScore >= 65;
  const alignmentOk = bias !== 'neutral' && trendBias === bias && liquidityScored.clearPath && regimeTrending;
  const alignmentMultiplier = alignmentOk ? 1.15 : 1;
  convictionRaw *= alignmentMultiplier;

  const timeModifier = marketType === 'equity' && dte !== null
    ? clamp(1 + (1 / (dte + 1)), 1, 1.2)
    : 1;
  convictionRaw *= timeModifier;

  const nearDecisionLevel = [
    ...(pinStrike ? [pinStrike] : []),
    ...liquidityLevels.slice(0, 2).map((level) => level.level),
    ...(vwap ? [vwap] : []),
  ].some((level) => Math.abs(level - spot) / Math.max(spot, 0.0001) <= 0.0035);
  const locationModifier = nearDecisionLevel ? 1.06 : 1;
  convictionRaw *= locationModifier;

  const conviction = Math.round(clamp(convictionRaw, 0, 100));

  const trendStructure = clamp(
    ((input.trendMetrics?.emaAligned ? 65 : 35) + (input.trendMetrics?.structureHigherHighs ? 35 : 15)),
    0,
    100
  );
  const flowAlignment = clamp(flowScore, 0, 100);
  const liquidityPath = clamp(liquidityScore, 0, 100);
  const volatilitySupport = clamp(
    marketMode === 'launch'
      ? 82
      : atrPercent >= (marketType === 'crypto' ? 2.2 : 1.3)
        ? 65
        : 42,
    0,
    100
  );

  let continuationRaw =
    (trendStructure * 0.35) +
    (flowAlignment * 0.35) +
    (liquidityPath * 0.20) +
    (volatilitySupport * 0.10);

  if ((trendBias === 'bullish' && bias === 'bullish' && (!vwap || spot >= vwap)) || (trendBias === 'bearish' && bias === 'bearish' && (!vwap || spot <= vwap))) {
    continuationRaw += 8;
  }

  const gammaDensity = clamp(
    marketMode === 'pin'
      ? 90
      : gammaState === 'Positive'
        ? 75
        : gammaState === 'Mixed'
          ? 55
          : 30,
    0,
    100
  );
  const proximityToStrike = clamp(100 - (pinDistancePercent * 120), 0, 100);
  const lowVolatility = clamp(
    atrPercent <= (marketType === 'crypto' ? 1.8 : 0.9)
      ? 88
      : atrPercent <= (marketType === 'crypto' ? 2.5 : 1.5)
        ? 62
        : 28,
    0,
    100
  );

  let pinRaw =
    (gammaDensity * 0.50) +
    (proximityToStrike * 0.30) +
    (lowVolatility * 0.20);

  if (marketMode === 'launch' && directionalFlip && ((bias === 'bullish' && spot > directionalFlip.level) || (bias === 'bearish' && spot < directionalFlip.level))) {
    pinRaw -= 18;
  }

  const compressionLevel = clamp(
    atrPercent <= (marketType === 'crypto' ? 1.6 : 0.8)
      ? 92
      : atrPercent <= (marketType === 'crypto' ? 2.2 : 1.3)
        ? 65
        : 30,
    0,
    100
  );
  const flowImbalance = clamp(
    marketType === 'equity'
      ? Math.abs(1 - (pcrBand || 1)) * 115
      : (Math.abs(input.cryptoPositioning?.fundingRate ?? 0) * 850) + (Math.abs(input.cryptoPositioning?.oiChangePercent ?? 0) * 6),
    0,
    100
  );
  const breakoutPressure = clamp(
    marketMode === 'launch'
      ? 82
      : directionalFlip
        ? 58
        : 36,
    0,
    100
  );

  let expansionRaw =
    (compressionLevel * 0.40) +
    (flowImbalance * 0.35) +
    (breakoutPressure * 0.25);

  const [pTrend, pPin, pExpansion] = normalizeProbabilities(continuationRaw, pinRaw, expansionRaw);
  const matrixRegime: CapitalFlowResult['probability_matrix']['regime'] = pTrend >= pPin && pTrend >= pExpansion
    ? 'TRENDING'
    : pPin >= pTrend && pPin >= pExpansion
      ? 'PINNING'
      : pExpansion >= pTrend && pExpansion >= pPin
        ? 'EXPANDING'
        : 'MIXED';

  const symbolKey = `${marketType}:${input.symbol.toUpperCase()}`;
  const previousExpansion = expansionHistory.get(symbolKey);
  const deltaExpansion = Number(((pExpansion - (previousExpansion ?? pExpansion))).toFixed(1));
  expansionHistory.set(symbolKey, pExpansion);

  const previousTrend = trendHistory.get(symbolKey);
  const deltaTrend = Number(((pTrend - (previousTrend ?? pTrend))).toFixed(1));
  trendHistory.set(symbolKey, pTrend);

  const acceleration: CapitalFlowResult['probability_matrix']['acceleration'] = deltaExpansion > 2
    ? 'rising'
    : deltaExpansion < -2
      ? 'falling'
      : 'flat';

  const decision: CapitalFlowResult['probability_matrix']['decision'] = pTrend >= pPin && pTrend >= pExpansion
    ? 'allow_trend_setups'
    : pPin >= pTrend && pPin >= pExpansion
      ? 'avoid_breakouts'
      : 'prep_breakout_strategies';

  const nextAbove = [...liquidityLevels]
    .filter((level) => level.level > spot)
    .sort((a, b) => a.level - b.level)[0]?.level;
  const nextBelow = [...liquidityLevels]
    .filter((level) => level.level < spot)
    .sort((a, b) => b.level - a.level)[0]?.level;

  const liquidityTargetHit = bias === 'bullish'
    ? (typeof nextAbove === 'number' ? Math.abs(spot - nextAbove) / Math.max(spot, 0.0001) <= 0.0025 : false)
    : bias === 'bearish'
      ? (typeof nextBelow === 'number' ? Math.abs(spot - nextBelow) / Math.max(spot, 0.0001) <= 0.0025 : false)
      : false;

  const flowImbalanceShort = marketType === 'equity'
    ? clamp((1 - (pcrBand || 1)) * 100, -100, 100)
    : clamp(
        ((input.cryptoPositioning?.fundingRate ?? 0) * 900) +
        ((input.cryptoPositioning?.oiChangePercent ?? 0) * 3),
        -100,
        100
      );

  const flowImbalanceLong = marketType === 'equity'
    ? clamp((1 - (input.openInterest?.pcRatio ?? (pcrBand || 1))) * 80, -100, 100)
    : clamp(((input.cryptoPositioning?.basisPercent ?? 0) * 20), -100, 100);

  const vwapSlopeProxy = vwap
    ? clamp(((spot - vwap) / Math.max(vwap, 0.0001)) * 1200, -100, 100)
    : (trendBias === 'bearish' ? -35 : trendBias === 'bullish' ? 35 : 0);

  const ifse = computeInstitutionalFlowState({
    symbol: input.symbol,
    marketType,
    bias,
    probabilities: {
      trend: pTrend,
      pin: pPin,
      expansion: pExpansion,
    },
    probabilityShift: {
      deltaTrend,
      deltaExpansion,
    },
    structure: {
      trendStructure,
      vwapSlope: vwapSlopeProxy,
      breakoutPressure,
      momentumDivergence: pTrend >= 50 && deltaTrend <= -6,
    },
    liquidity: {
      nextAbove,
      nextBelow,
      currentPrice: spot,
      targetHit: liquidityTargetHit,
    },
    volatility: {
      compressionScore: compressionLevel,
      atrExpansionRate: clamp(atrPercent * (marketType === 'crypto' ? 15 : 30), 0, 100),
    },
    flow: {
      flowImbalanceShort,
      flowImbalanceLong,
    },
    dataHealth: {
      freshnessScore: dataScore,
    },
  });

  const preferredArchetype = ifse.state === 'ACCUMULATION'
    ? 'mean_reversion'
    : ifse.state === 'POSITIONING'
      ? 'breakout_early'
      : ifse.state === 'LAUNCH'
        ? 'trend_continuation'
        : 'reversal_confirmed';

  const maxInstitutionalProbability = Math.max(pTrend, pPin, pExpansion);
  const ftpm = computeFlowTradePermission({
    state: ifse.state,
    stateConfidence: ifse.confidence,
    institutionalProbability: maxInstitutionalProbability,
    pTrend,
    pPin,
    pExpansion,
    dataHealthScore: dataScore,
    liquidityClarity: liquidityScore,
    volatilityCompression: compressionLevel,
    atrExpansionRate: clamp(atrPercent * (marketType === 'crypto' ? 15 : 30), 0, 100),
    preferredArchetype,
  });

  const irg = computeInstitutionalRiskGovernor({
    marketType,
    symbol: input.symbol,
    flowState: ifse.state,
    preferredArchetype,
    conviction,
    tps: ftpm.tps,
    atrPercent,
    expansionProbability: pExpansion,
    expansionAcceleration: acceleration,
    account: {
      openRiskPercent: input.riskGovernorContext?.account?.openRiskPercent ?? 1.2,
      proposedRiskPercent: input.riskGovernorContext?.account?.proposedRiskPercent ?? 1,
      dailyRiskPercent: input.riskGovernorContext?.account?.dailyRiskPercent ?? 1.1,
      dailyR: input.riskGovernorContext?.account?.dailyR ?? 0,
    },
    exposure: {
      openPositions: (input.riskGovernorContext?.exposure?.openPositions ?? []).map((position) => ({
        symbol: position.symbol,
        direction: position.direction ?? 'long',
        cluster: position.cluster,
      })),
      proposedPosition: {
        symbol: input.riskGovernorContext?.exposure?.proposedPosition?.symbol ?? input.symbol,
        direction: input.riskGovernorContext?.exposure?.proposedPosition?.direction ?? 'long',
        cluster: input.riskGovernorContext?.exposure?.proposedPosition?.cluster,
      },
    },
    behavior: {
      consecutiveLosses: input.riskGovernorContext?.behavior?.consecutiveLosses ?? 0,
      lossesWindowMinutes: input.riskGovernorContext?.behavior?.lossesWindowMinutes ?? 60,
      tradesThisSession: input.riskGovernorContext?.behavior?.tradesThisSession ?? 2,
      expectancyR: input.riskGovernorContext?.behavior?.expectancyR ?? 0.1,
      ruleViolations: input.riskGovernorContext?.behavior?.ruleViolations ?? 0,
    },
    volatilityRegimeOverride: input.riskGovernorContext?.volatilityRegimeOverride,
  });

  const executionAllowed = !ftpm.blocked && irg.executionAllowed;

  const permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK' = ftpm.blocked
    ? 'BLOCK'
    : ftpm.sizeMultiplier < 0.7
      ? 'ALLOW_SMALL'
      : 'ALLOW';

  const finalSize = Number((
    1 *
    ftpm.sizeMultiplier *
    (executionAllowed ? irg.sizing.riskGovernorMultiplier : 0) *
    irg.drawdown.sizeMultiplier *
    irg.volatility.sizeMultiplier *
    irg.sizing.personalPerformanceMultiplier
  ).toFixed(2));

  const expectedMove = marketType === 'equity'
    ? atr
    : spot * Math.max(0.005, atrPercent / 100);

  const brainDecision = computeBrainDecision({
    symbol: input.symbol,
    marketType,
    generatedAt: new Date().toISOString(),
    timeframes: ['5m', '15m', '1h', '4h', '1d'],
    marketMode,
    gammaState,
    bias,
    spot,
    conviction,
    flowScore,
    liquidityScore,
    dataScore,
    dataFreshnessMs: input.dataHealth?.lastUpdatedIso
      ? Math.max(0, Date.now() - new Date(input.dataHealth.lastUpdatedIso).getTime())
      : 0,
    dataSources: {
      price: marketType === 'equity' ? 'alpha_vantage' : 'coingecko',
      options: marketType === 'equity' ? 'fmv_options' : 'coingecko_derivatives',
      news: 'none',
    },
    fallbackActive: !!input.dataHealth?.fallbackActive,
    atrPercent,
    expectedMove,
    pTrend,
    pPin,
    pExpansion,
    flowState: ifse.state,
    flowStateConfidence: ifse.confidence,
    permission,
    requiredTrigger: ftpm.noTradeMode.active
      ? ftpm.noTradeMode.reason
      : permission === 'BLOCK'
        ? `TPS ${ftpm.tps.toFixed(0)} below threshold`
        : ifse.state === 'LAUNCH'
          ? 'Breakout retest hold required'
          : ifse.state === 'POSITIONING'
            ? 'Compression break confirmation required'
            : ifse.state === 'ACCUMULATION'
              ? 'Sweep + reclaim confirmation required'
              : 'Confirmed reversal signal required',
    stopStyle: ftpm.stopStyle,
    irs: irg.irs,
    riskMode: irg.riskMode,
    executionAllowed,
    allowed: irg.allowed,
    blocked: [...new Set([
      ...irg.blocked,
      ...(ftpm.blocked ? [`Flow permission blocked (TPS ${ftpm.tps.toFixed(0)})`] : []),
    ])],
    finalSize,
    nextAbove,
    nextBelow,
    stateMachineContext: input.riskGovernorContext?.stateMachineContext,
  });

  const path: string[] = marketMode === 'pin'
    ? [
        primaryLiquidity ? `Sweep ${primaryLiquidity.label} liquidity` : 'Sweep nearby liquidity pool',
        vwap ? `${spot >= vwap ? 'Hold' : 'Reclaim'} VWAP` : 'Hold micro-structure support',
        marketType === 'crypto'
          ? (pinStrike ? `Revert toward ${pinStrike} positioning cluster` : 'Revert toward positioning cluster')
          : (pinStrike ? `Magnet to ${pinStrike} pin` : 'Magnet to highest-gravity strike'),
      ]
    : marketMode === 'launch'
      ? [
          directionalFlip
            ? `${directionalFlip.direction === 'bullish_above' ? 'Break/hold above' : 'Break/hold below'} ${directionalFlip.level}`
            : 'Break key flow trigger',
          vwap ? `${bias === 'bearish' ? 'Fail below' : 'Hold above'} VWAP` : 'Confirm continuation on retest',
          marketType === 'crypto'
            ? (nextDirectionalStrike ? `Liquidation cascade toward ${nextDirectionalStrike.strike}` : 'Cascade toward next liquidation ladder')
            : (nextDirectionalStrike ? `Expand toward ${nextDirectionalStrike.strike} key strike` : 'Expand toward next liquidity magnet'),
        ]
      : [
          primaryLiquidity ? `Sweep ${primaryLiquidity.label} then fade` : 'Sweep both-side liquidity likely',
          vwap ? 'Mean-revert around VWAP' : 'Mean-revert around intraday midpoint',
          directionalFlip ? `Wait for clean break of ${directionalFlip.level}` : 'Wait for decisive break before entry',
        ];

  const risk = [
    vwap
      ? `${spot >= vwap ? 'Lose' : 'Reject'} VWAP → ${marketMode === 'launch' ? 'acceleration risk' : 'chop risk'}`
      : 'No VWAP anchor available — execution quality lower',
    directionalFlip
      ? `Break ${directionalFlip.level} → ${directionalFlip.direction === 'bullish_above' ? 'bullish launch risk' : 'bearish launch risk'}`
      : 'No clear flip zone — reduce size until structure clarifies',
  ];

  const dataHealth = {
    options_chain: dataFreshnessBucket(input.dataHealth?.freshness),
    last_chain_update_sec: input.dataHealth?.lastUpdatedIso
      ? Math.max(0, Math.round((Date.now() - new Date(input.dataHealth.lastUpdatedIso).getTime()) / 1000))
      : null,
    fallback_active: !!input.dataHealth?.fallbackActive,
  };

  const chopLow = nearestBelow?.strike ?? null;
  const chopHigh = nearestAbove?.strike ?? null;

  return {
    symbol: input.symbol.toUpperCase(),
    asof: new Date().toISOString(),
    market_type: marketType,
    spot: Number(spot.toFixed(2)),
    market_mode: marketMode,
    gamma_state: gammaState,
    bias,
    conviction,
    conviction_factors: {
      mode: Number(modeScore.toFixed(1)),
      flow: Number(flowScore.toFixed(1)),
      liquidity: Number(liquidityScore.toFixed(1)),
      regime: Number(regimeScore.toFixed(1)),
      data: Number(dataScore.toFixed(1)),
      alignmentMultiplier: Number(alignmentMultiplier.toFixed(2)),
      timeModifier: Number(timeModifier.toFixed(2)),
      locationModifier: Number(locationModifier.toFixed(2)),
    },
    probability_matrix: {
      continuation: pTrend,
      pinReversion: pPin,
      expansion: pExpansion,
      regime: matrixRegime,
      deltaExpansion,
      acceleration,
      decision,
      raw: {
        continuation: Number(continuationRaw.toFixed(1)),
        pin: Number(pinRaw.toFixed(1)),
        expansion: Number(expansionRaw.toFixed(1)),
      },
    },
    flow_state: ifse,
    flow_trade_permission: {
      tps: ftpm.tps,
      blocked: ftpm.blocked,
      noTradeMode: ftpm.noTradeMode,
      riskMode: ftpm.riskMode,
      sizeMultiplier: ftpm.sizeMultiplier,
      stopStyle: ftpm.stopStyle,
      allowed: ftpm.allowed,
      blockedTrades: ftpm.blockedTrades,
      selectedArchetype: ftpm.selectedArchetype,
    },
    institutional_risk_governor: {
      executionAllowed,
      hardBlocked: irg.hardBlocked,
      hardBlockReasons: irg.hardBlockReasons,
      irs: irg.irs,
      riskMode: irg.riskMode,
      capital: irg.capital,
      drawdown: irg.drawdown,
      correlation: irg.correlation,
      volatility: irg.volatility,
      behavior: irg.behavior,
      sizing: {
        baseSize: 1,
        flowStateMultiplier: ftpm.sizeMultiplier,
        riskGovernorMultiplier: irg.sizing.riskGovernorMultiplier,
        personalPerformanceMultiplier: irg.sizing.personalPerformanceMultiplier,
        finalSize,
      },
      allowed: irg.allowed,
      blocked: [...new Set([
        ...irg.blocked,
        ...(ftpm.blocked ? [`Flow permission blocked (TPS ${ftpm.tps.toFixed(0)})`] : []),
      ])],
    },
    brain_decision: {
      score: brainDecision.summary.score,
      regimeFit: brainDecision.summary.regimeFit,
      flowAlignment: brainDecision.summary.flowAlignment,
      setupQuality: brainDecision.summary.setupQuality,
      riskPermission: brainDecision.summary.riskPermission,
      dataHealth: brainDecision.summary.dataHealth,
      mode: brainDecision.summary.mode,
      permission: brainDecision.summary.permission,
      stateSummary: brainDecision.summary.stateSummary,
      allowed: brainDecision.summary.allowed,
      blocked: brainDecision.summary.blocked,
      requiredTrigger: brainDecision.summary.requiredTrigger,
      plan: brainDecision.summary.plan,
    },
    brain_decision_v1: brainDecision.v1,
    execution_allowed: executionAllowed,
    dominant_expiry: expiryBucket(dte),
    pin_strike: pinStrike,
    key_strikes: keyStrikes,
    flip_zones: flipZones,
    liquidity_levels: liquidityLevels,
    most_likely_path: path.slice(0, 3),
    risk,
    chop_zone: {
      active: marketMode === 'chop',
      low: chopLow,
      high: chopHigh,
    },
    data_health: dataHealth,
  };
}
