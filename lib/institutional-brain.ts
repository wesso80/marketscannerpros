import { buildExecutionPlan } from './plan-builder';
import { computeFlowEngine } from './flow-engine';
import { InstitutionalState, StateEventType, runInstitutionalTransitionEngine } from './institutional-state-machine';
import { computeProbabilityMatrixEngine } from './probability-matrix';
import { computeRegimeEngine } from './regime-engine';

export interface BrainDecisionInput {
  symbol: string;
  marketType: 'equity' | 'crypto';
  generatedAt: string;
  timeframes: string[];
  marketMode: 'pin' | 'launch' | 'chop';
  gammaState: 'Positive' | 'Negative' | 'Mixed';
  bias: 'bullish' | 'bearish' | 'neutral';
  spot: number;
  conviction: number;
  flowScore: number;
  liquidityScore: number;
  dataScore: number;
  dataFreshnessMs: number;
  dataSources: {
    price: string;
    options: string;
    news: string;
  };
  fallbackActive: boolean;
  atrPercent: number;
  expectedMove: number;
  pTrend: number;
  pPin: number;
  pExpansion: number;
  flowState: 'ACCUMULATION' | 'POSITIONING' | 'LAUNCH' | 'EXHAUSTION';
  flowStateConfidence: number;
  permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
  requiredTrigger: string;
  stopStyle: string;
  irs: number; // 0-1
  riskMode: 'FULL_OFFENSE' | 'NORMAL' | 'DEFENSIVE' | 'LOCKDOWN';
  executionAllowed: boolean;
  allowed: string[];
  blocked: string[];
  finalSize: number;
  nextAbove?: number;
  nextBelow?: number;
  stateMachineContext?: {
    currentState?: InstitutionalState;
    previousState?: InstitutionalState;
    stateSinceIso?: string;
    event?: StateEventType;
    cooldownUntilIso?: string | null;
    positionOpen?: boolean;
    edgeDecay?: boolean;
    triggerCurrent?: string;
    triggerEta?: string;
    setupMissing?: string[];
    playbook?: string;
    direction?: 'long' | 'short';
  };
}

export interface BrainDecisionSummary {
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
  plan: ReturnType<typeof buildExecutionPlan>;
  details: {
    regime: ReturnType<typeof computeRegimeEngine>;
    flow: ReturnType<typeof computeFlowEngine>;
    probability: ReturnType<typeof computeProbabilityMatrixEngine>;
  };
}

export interface MSPBrainDecisionObjectV1 {
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
    state: InstitutionalState;
    previous_state: InstitutionalState;
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
}

export interface BrainDecisionObject {
  summary: BrainDecisionSummary;
  v1: MSPBrainDecisionObjectV1;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function bandPermission(score: number, executionAllowed: boolean): 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK' {
  if (!executionAllowed) return 'BLOCK';
  if (score >= 70) return 'ALLOW';
  if (score >= 55) return 'ALLOW_SMALL';
  return 'BLOCK';
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function normalizePlaybook(bestPlaybook: string): string {
  return bestPlaybook.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function triggerTemplate(playbook: string, flowState: BrainDecisionInput['flowState']): string {
  if (/momentum|trend/.test(playbook) || flowState === 'LAUNCH') return 'break_prev_high_with_volume';
  if (/pullback/.test(playbook) || flowState === 'POSITIONING') return 'pullback_to_20ema_then_bounce';
  if (/reversion|revert/.test(playbook) || flowState === 'ACCUMULATION') return 'reclaim_vwap_and_hold_2m';
  return 'sweep_low_then_reclaim_level';
}

export function computeBrainDecision(input: BrainDecisionInput): BrainDecisionObject {
  const regime = computeRegimeEngine({
    marketMode: input.marketMode,
    gammaState: input.gammaState,
    atrPercent: input.atrPercent,
    expansionProbability: input.pExpansion,
    dataHealthScore: input.dataScore,
  });

  const flow = computeFlowEngine({
    symbol: input.symbol,
    bias: input.bias,
    flowScore: input.flowScore,
    liquidityScore: input.liquidityScore,
    pTrend: input.pTrend,
    pPin: input.pPin,
    pExpansion: input.pExpansion,
  });

  const probability = computeProbabilityMatrixEngine({
    pTrend: input.pTrend,
    pPin: input.pPin,
    pExpansion: input.pExpansion,
    conviction: input.conviction,
    expectedMove: input.expectedMove,
  });

  const regimeFit = clamp(regime.score, 0, 100);
  const capitalFlow = clamp((flow.score * 0.7) + (flow.flowStrength * 0.3), 0, 100);
  const structureQuality = clamp((input.conviction * 0.65) + (probability.confidence * 0.35), 0, 100);
  const optionsAlignment = clamp((Math.max(input.pTrend, input.pPin, input.pExpansion) * 0.6) + (input.flowScore * 0.4), 0, 100);
  const timing = clamp((input.flowStateConfidence * 0.75) + (input.executionAllowed ? 12 : 0), 0, 100);
  const dataHealth = clamp(input.dataScore, 0, 100);

  const score = clamp(
    (regimeFit * 0.25) +
    (capitalFlow * 0.20) +
    (structureQuality * 0.20) +
    (optionsAlignment * 0.15) +
    (timing * 0.10) +
    (dataHealth * 0.10),
    0,
    100
  );

  const riskPermission = clamp((input.irs * 100), 0, 100);
  const flowAlignment = clamp((capitalFlow * 0.6) + (timing * 0.4), 0, 100);
  const setupQuality = clamp(structureQuality, 0, 100);
  const normalizedPermission = bandPermission(score, input.executionAllowed);

  const plan = buildExecutionPlan({
    symbol: input.symbol,
    bias: input.bias,
    permission: normalizedPermission,
    flowState: input.flowState,
    stopStyle: input.stopStyle,
    finalSize: input.finalSize,
    nextAbove: input.nextAbove,
    nextBelow: input.nextBelow,
  });

  const movePct = input.spot > 0 ? Math.abs(input.expectedMove / input.spot) * 100 : 0;
  const zoneHalfWidth = Math.max(Math.abs(input.expectedMove) * 0.25, input.spot * 0.0025);
  const entryZone: [number, number] = [
    round2(input.spot - zoneHalfWidth),
    round2(input.spot + zoneHalfWidth),
  ];

  const stop = input.bias === 'bearish'
    ? round2(entryZone[1] + (Math.abs(input.expectedMove) * 0.5))
    : round2(entryZone[0] - (Math.abs(input.expectedMove) * 0.5));

  const target1 = input.bias === 'bearish'
    ? round2(input.nextBelow ?? (input.spot - Math.abs(input.expectedMove) * 1.5))
    : round2(input.nextAbove ?? (input.spot + Math.abs(input.expectedMove) * 1.5));
  const target2 = input.bias === 'bearish'
    ? round2(target1 - Math.abs(input.expectedMove) * 1.5)
    : round2(target1 + Math.abs(input.expectedMove) * 1.5);

  const stateLower = input.flowState.toLowerCase() as MSPBrainDecisionObjectV1['flow_state']['state'];
  const regimeMap: Record<ReturnType<typeof computeRegimeEngine>['regime'], MSPBrainDecisionObjectV1['market_regime']['regime']> = {
    TREND_DAY: 'trend_day',
    MEAN_REVERT_DAY: 'mean_revert_day',
    VOL_EXPANSION: 'vol_expansion',
    VOL_COMPRESSION: 'vol_compression',
    LIQUIDITY_VACUUM: 'liquidity_vacuum',
    NEWS_SHOCK: 'news_shock',
  };

  const volMap: Record<ReturnType<typeof computeRegimeEngine>['volState'], MSPBrainDecisionObjectV1['market_regime']['volatility_state']> = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    EXTREME: 'extreme',
  };

  const liqMap: Record<ReturnType<typeof computeRegimeEngine>['liquidityState'], MSPBrainDecisionObjectV1['market_regime']['liquidity_state']> = {
    THIN: 'low',
    NORMAL: 'normal',
    RICH: 'high',
  };

  const riskModeMap: Record<BrainDecisionInput['riskMode'], MSPBrainDecisionObjectV1['risk_governor']['mode']> = {
    FULL_OFFENSE: 'offense',
    NORMAL: 'normal',
    DEFENSIVE: 'defensive',
    LOCKDOWN: 'lockdown',
  };

  const optionsBias: MSPBrainDecisionObjectV1['capital_flow']['options_bias'] = input.bias === 'bullish'
    ? 'calls_dominant'
    : input.bias === 'bearish'
      ? 'puts_dominant'
      : 'balanced';

  const normalizedBestPlaybook = normalizePlaybook(probability.bestPlaybook);
  const setupId = `${input.symbol.toUpperCase()}_${input.generatedAt.replace(/[-:TZ.]/g, '').slice(0, 12)}`;

  const triggerDefinition = triggerTemplate(normalizedBestPlaybook, input.flowState);
  const triggerPass = normalizedPermission !== 'BLOCK' && input.executionAllowed;
  const setupMissing = input.stateMachineContext?.setupMissing
    ?? (triggerPass ? [] : ['trigger_not_confirmed']);
  const playbook = input.stateMachineContext?.playbook ?? normalizedBestPlaybook;
  const direction = input.stateMachineContext?.direction
    ?? (input.bias === 'bearish' ? 'short' : 'long');

  const stateMachine = runInstitutionalTransitionEngine({
    nowIso: input.generatedAt,
    currentState: input.stateMachineContext?.currentState ?? (score < 55 ? 'WATCH' : score < 70 ? 'STALK' : 'ARMED'),
    previousState: input.stateMachineContext?.previousState,
    stateSinceIso: input.stateMachineContext?.stateSinceIso ?? input.generatedAt,
    playbook,
    direction,
    event: input.stateMachineContext?.event ?? 'bar_close_5m',
    positionOpen: !!input.stateMachineContext?.positionOpen,
    cooldownUntilIso: input.stateMachineContext?.cooldownUntilIso ?? null,
    trigger: {
      definition: triggerDefinition,
      pass: triggerPass,
      current: input.stateMachineContext?.triggerCurrent ?? (triggerPass ? 'confirmed' : 'waiting_confirmation'),
      eta: input.stateMachineContext?.triggerEta ?? 'unknown',
    },
    context: {
      brainScore: score,
      dataHealthScore: dataHealth,
      dataHealthPass: dataHealth >= 55 && !input.fallbackActive,
      regimeValue: regimeMap[regime.regime],
      regimePass: regime.riskMode === 'risk_on' && regime.regime !== 'NEWS_SHOCK',
      institutionalFilterPass: normalizedPermission !== 'BLOCK',
      institutionalFilterScore: setupQuality,
      filterRejectReasons: normalizedPermission === 'BLOCK' ? input.blocked : [],
      capitalFlowPass: capitalFlow >= 55,
      flowBias: input.bias,
      flowStrength: Math.max(0, Math.min(1, capitalFlow / 100)),
      flowStatePass: timing >= 60,
      flowState: input.flowState,
      timingQuality: Math.max(0, Math.min(1, timing / 100)),
      setupQualityPass: setupQuality >= 60 && setupMissing.length === 0,
      setupMissing,
      invalidateLevel: typeof input.nextBelow === 'number'
        ? round2(input.nextBelow)
        : typeof input.nextAbove === 'number'
          ? round2(input.nextAbove)
          : null,
      riskGovernorPass: input.executionAllowed,
      permission: normalizedPermission,
      sizeMultiplier: input.finalSize,
      riskBlockReasons: normalizedPermission === 'BLOCK' ? input.blocked : [],
      edgeDecay: !!input.stateMachineContext?.edgeDecay,
      decisionConfidence: Math.max(0, Math.min(1, probability.confidence / 100)),
    },
  });

  const v1: MSPBrainDecisionObjectV1 = {
    meta: {
      schema_version: '1.0',
      generated_at: input.generatedAt,
      symbol: input.symbol.toUpperCase(),
      asset_class: input.marketType,
      timeframes: input.timeframes,
      data_confidence: round2(dataHealth / 100),
    },
    data_health: {
      freshness_ms: Math.max(0, Math.round(input.dataFreshnessMs)),
      sources: input.dataSources,
      fallback_active: input.fallbackActive,
      health_score: Math.round(dataHealth),
    },
    market_regime: {
      regime: regimeMap[regime.regime],
      risk_mode: regime.riskMode,
      volatility_state: volMap[regime.volState],
      liquidity_state: liqMap[regime.liquidityState],
      confidence: round2(regimeFit / 100),
    },
    capital_flow: {
      flow_bias: input.bias,
      flow_strength: round2(capitalFlow / 100),
      sector_rotation_rank: Math.max(1, Math.min(10, Math.round((100 - capitalFlow) / 10) + 1)),
      leadership_score: round2(flow.flowStrength / 100),
      options_bias: optionsBias,
    },
    institutional_filter: {
      eligible: normalizedPermission !== 'BLOCK',
      score: Math.round(setupQuality),
      reject_reasons: normalizedPermission === 'BLOCK' ? input.blocked : [],
    },
    probability_matrix: {
      p_up: round2(probability.pUp / 100),
      p_down: round2(probability.pDown / 100),
      expected_move_pct: round2(movePct),
      confidence: round2(probability.confidence / 100),
      best_playbook: normalizedBestPlaybook,
    },
    flow_state: {
      state: stateLower,
      timing_quality: round2(timing / 100),
      invalidate_level: typeof input.nextBelow === 'number'
        ? round2(input.nextBelow)
        : typeof input.nextAbove === 'number'
          ? round2(input.nextAbove)
          : null,
    },
    trade_permission: {
      permission: normalizedPermission,
      size_multiplier: round2(input.finalSize),
      required_trigger: input.requiredTrigger.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      blocked_playbooks: input.blocked.slice(0, 3).map((reason) => reason.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')),
    },
    risk_governor: {
      mode: riskModeMap[input.riskMode],
      account_risk_pct: round2(Math.max(0, Math.min(2, input.finalSize))),
      cooldown_active: input.riskMode === 'LOCKDOWN',
      correlation_risk: round2(1 - (riskPermission / 100)),
      override_reason: normalizedPermission === 'BLOCK' ? (input.blocked[0] || 'governor_override') : null,
    },
    execution_plan: {
      entry_type: plan.entryType,
      entry_zone: entryZone,
      stop,
      targets: [target1, target2],
      r_multiple_targets: [1.5, 3.0],
      management_rules: plan.management.map((rule) => rule.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')),
    },
    brain_score: {
      overall: Math.round(score),
      components: {
        regime_fit: Math.round(regimeFit / 10),
        flow_alignment: Math.round(flowAlignment / 10),
        setup_quality: Math.round(setupQuality / 10),
        risk_permission: Math.round(riskPermission / 10),
        data_health: Math.round(dataHealth / 10),
      },
    },
    learning_hooks: {
      setup_id: setupId,
      model_weights_version: 'msp_weights_v12',
      features_snapshot: {
        regime_fit: round2(regimeFit / 100),
        capital_flow: round2(capitalFlow / 100),
        structure_quality: round2(structureQuality / 100),
        options_alignment: round2(optionsAlignment / 100),
        timing: round2(timing / 100),
        data_health: round2(dataHealth / 100),
      },
    },
    state_machine: stateMachine.state_machine,
  };

  const summary: BrainDecisionSummary = {
    score: Number(score.toFixed(1)),
    regimeFit: Number(regimeFit.toFixed(1)),
    flowAlignment: Number(flowAlignment.toFixed(1)),
    setupQuality: Number(setupQuality.toFixed(1)),
    riskPermission: Number(riskPermission.toFixed(1)),
    dataHealth: Number(dataHealth.toFixed(1)),
    mode: input.riskMode,
    permission: normalizedPermission,
    stateSummary: `${regime.regime.replace(/_/g, ' ')} • ${input.flowState} • ${input.bias.toUpperCase()}`,
    allowed: input.allowed,
    blocked: input.blocked,
    requiredTrigger: input.requiredTrigger,
    plan,
    details: {
      regime,
      flow,
      probability,
    },
  };

  return {
    summary,
    v1,
  };
}
