export type InstitutionalState =
  | 'SCAN'
  | 'WATCH'
  | 'STALK'
  | 'ARMED'
  | 'EXECUTE'
  | 'MANAGE'
  | 'COOLDOWN'
  | 'BLOCKED';

export type StateDirection = 'long' | 'short';

export type StateEventType =
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

export interface StateGateStatus {
  pass: boolean;
  reason: string | null;
}

export interface InstitutionalStateMachineInput {
  nowIso: string;
  currentState: InstitutionalState;
  previousState?: InstitutionalState;
  stateSinceIso: string;
  playbook: string;
  direction: StateDirection;
  event: StateEventType;
  positionOpen: boolean;
  cooldownUntilIso?: string | null;
  trigger: {
    definition: string;
    pass: boolean;
    current: string;
    eta?: string;
  };
  context: {
    brainScore: number;
    dataHealthScore: number;
    dataHealthPass: boolean;
    regimeValue: string;
    regimePass: boolean;
    institutionalFilterPass: boolean;
    institutionalFilterScore: number;
    filterRejectReasons: string[];
    capitalFlowPass: boolean;
    flowBias: 'bullish' | 'bearish' | 'neutral';
    flowStrength: number; // 0-1
    flowStatePass: boolean;
    flowState: string;
    timingQuality: number; // 0-1
    setupQualityPass: boolean;
    setupMissing: string[];
    invalidateLevel: number | null;
    riskGovernorPass: boolean;
    permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
    sizeMultiplier: number;
    riskBlockReasons: string[];
    edgeDecay?: boolean;
    decisionConfidence: number; // 0-1
  };
}

export interface InstitutionalStateMachineOutput {
  state_machine: {
    state: InstitutionalState;
    previous_state: InstitutionalState;
    state_since: string;
    playbook: string;
    direction: StateDirection;
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
  transition: {
    old_state: InstitutionalState;
    new_state: InstitutionalState;
    reason: string;
    timestamp: string;
    changed: boolean;
  };
}

function minutesBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function scoreBandState(score: number): InstitutionalState {
  if (score < 40) return 'BLOCKED';
  if (score < 55) return 'WATCH';
  if (score < 70) return 'STALK';
  return 'ARMED';
}

function mapMomentum(ageMinutes: number): { velocity: 'slow' | 'medium' | 'fast'; decay: 'low' | 'medium' | 'high' } {
  if (ageMinutes <= 10) return { velocity: 'fast', decay: 'low' };
  if (ageMinutes <= 45) return { velocity: 'medium', decay: 'medium' };
  return { velocity: 'slow', decay: 'high' };
}

function bestAction(state: InstitutionalState, triggerDef: string, permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK'): InstitutionalStateMachineOutput['state_machine']['next_best_action'] {
  switch (state) {
    case 'SCAN':
      return { action: 'STANDBY', when: 'eligible_universe_match', notes: 'Keep CPU cheap; monitor broad universe only.' };
    case 'WATCH':
      return { action: 'SET_ALERT', when: triggerDef || 'structure_alignment', notes: 'Monitor setup progress and wait for quality improvement.' };
    case 'STALK':
      return { action: 'SET_ALERT', when: triggerDef || 'trigger_template', notes: 'Set trap: wait for missing components to align.' };
    case 'ARMED':
      return { action: 'PREP_ORDER', when: triggerDef || 'trigger_fire', notes: `All preconditions met; permission ${permission}.` };
    case 'EXECUTE':
      return { action: 'EXECUTE', when: 'now', notes: 'Trigger fired with risk governor approval.' };
    case 'MANAGE':
      return { action: 'MANAGE', when: 'position_open', notes: 'Apply stop/target/trailing management rules.' };
    case 'COOLDOWN':
      return { action: 'REVIEW', when: 'cooldown_complete', notes: 'Prevent churn/revenge; tag outcome before re-entry.' };
    default:
      return { action: 'WAIT', when: 'block_removed', notes: 'Blocked by risk/data/regime governance.' };
  }
}

export function runInstitutionalTransitionEngine(input: InstitutionalStateMachineInput): InstitutionalStateMachineOutput {
  const stateAgeMinutes = minutesBetween(input.stateSinceIso, input.nowIso);
  const cooldownActive = !!input.cooldownUntilIso && new Date(input.cooldownUntilIso).getTime() > new Date(input.nowIso).getTime();

  const gateData = input.context.dataHealthPass;
  const gateRegime = input.context.regimePass;
  const gateFilter = input.context.institutionalFilterPass;
  const gateFlow = input.context.capitalFlowPass;
  const gateFlowState = input.context.flowStatePass;
  const gateSetup = input.context.setupQualityPass;
  const gateTrigger = input.trigger.pass;
  const gateRisk = input.context.riskGovernorPass && input.context.permission !== 'BLOCK';

  const watchReady = gateData && gateRegime && gateFilter && input.context.brainScore >= 40;
  const stalkReady = watchReady && gateFlow && input.context.brainScore >= 55;
  const armedReady = stalkReady && gateFlowState && gateSetup && input.context.brainScore >= 70;
  const edgeDecay = !!input.context.edgeDecay || (input.currentState === 'ARMED' && stateAgeMinutes > 45 && !gateTrigger);

  let newState: InstitutionalState = input.currentState;
  let reason = 'No transition';

  // Priority 1: hard blocks
  if (!gateData) {
    newState = 'BLOCKED';
    reason = 'Data health gate failed';
  } else if (!gateRisk) {
    newState = 'BLOCKED';
    reason = input.context.riskBlockReasons[0] || 'Risk governor gate failed';
  }
  // Priority 2: position/exit
  else if (input.event === 'position_closed' || input.event === 'stop_hit' || input.event === 'target_hit') {
    newState = 'COOLDOWN';
    reason = 'Position closed; cooldown started';
  } else if (input.positionOpen) {
    newState = 'MANAGE';
    reason = 'Position open; manage state enforced';
  }
  // Priority 3: execution
  else if (input.currentState === 'ARMED' && gateTrigger && gateRisk) {
    newState = 'EXECUTE';
    reason = 'Trigger fired with risk approval';
  } else if (input.event === 'entry_filled') {
    newState = 'MANAGE';
    reason = 'Entry confirmed';
  }
  // Priority 4: upgrades
  else if (input.currentState === 'SCAN' && watchReady) {
    newState = 'WATCH';
    reason = 'Eligible + data healthy + edge present';
  } else if (input.currentState === 'WATCH' && stalkReady) {
    newState = 'STALK';
    reason = 'Structure/flow alignment improving';
  } else if (input.currentState === 'STALK' && armedReady) {
    newState = 'ARMED';
    reason = 'All preconditions met; waiting trigger';
  }
  // Priority 5: decays
  else if (input.currentState === 'ARMED' && edgeDecay) {
    newState = 'WATCH';
    reason = 'Edge decay detected; de-escalating from ARMED';
  } else if (input.currentState === 'STALK' && stateAgeMinutes > 120 && !armedReady) {
    newState = 'WATCH';
    reason = 'Stalk timeout without maturation';
  } else if (input.currentState === 'WATCH' && stateAgeMinutes > 24 * 60 && !watchReady) {
    newState = 'SCAN';
    reason = 'Watch stale >1 day; returning to SCAN';
  }

  if (input.currentState === 'COOLDOWN') {
    if (!cooldownActive && watchReady) {
      newState = 'WATCH';
      reason = 'Cooldown elapsed and eligibility restored';
    } else if (cooldownActive) {
      newState = 'COOLDOWN';
      reason = 'Cooldown active';
    }
  }

  if (input.currentState === 'BLOCKED' && gateData && gateRisk) {
    const band = scoreBandState(input.context.brainScore);
    newState = band === 'BLOCKED' ? 'SCAN' : band;
    reason = 'Block removed and eligibility rechecked';
  }

  const changed = newState !== input.currentState;
  const nextStateSince = changed ? input.nowIso : input.stateSinceIso;
  const blockReasons = newState === 'BLOCKED'
    ? [
        ...(!gateData ? ['data_health_failed'] : []),
        ...(!gateRisk ? (input.context.riskBlockReasons.length ? input.context.riskBlockReasons : ['risk_governor_failed']) : []),
        ...(!gateRegime ? ['regime_hostile'] : []),
      ]
    : [];

  const momentum = mapMomentum(stateAgeMinutes);

  return {
    state_machine: {
      state: newState,
      previous_state: input.currentState,
      state_since: nextStateSince,
      playbook: input.playbook,
      direction: input.direction,
      gates: {
        data_health: {
          pass: gateData,
          score: Math.round(input.context.dataHealthScore),
          reason: gateData ? null : 'stale_or_low_confidence_data',
        },
        regime: {
          pass: gateRegime,
          value: input.context.regimeValue,
          reason: gateRegime ? null : 'regime_misaligned',
        },
        institutional_filter: {
          pass: gateFilter,
          score: Math.round(input.context.institutionalFilterScore),
          reason: gateFilter ? null : (input.context.filterRejectReasons[0] || 'institutional_filter_failed'),
        },
        capital_flow: {
          pass: gateFlow,
          bias: input.context.flowBias,
          strength: Number(Math.max(0, Math.min(1, input.context.flowStrength)).toFixed(2)),
        },
        flow_state: {
          pass: gateFlowState,
          state: input.context.flowState.toLowerCase(),
          timing_quality: Number(Math.max(0, Math.min(1, input.context.timingQuality)).toFixed(2)),
        },
        setup_quality: {
          pass: gateSetup,
          missing: input.context.setupMissing,
          invalidate_level: input.context.invalidateLevel,
        },
        trigger: {
          pass: gateTrigger,
          definition: input.trigger.definition,
          current: input.trigger.current,
          eta: input.trigger.eta || 'unknown',
        },
        risk_governor: {
          pass: gateRisk,
          permission: input.context.permission,
          size_multiplier: Number(Math.max(0, Math.min(1.5, input.context.sizeMultiplier)).toFixed(2)),
        },
      },
      next_best_action: bestAction(newState, input.trigger.definition, input.context.permission),
      block_reasons: blockReasons,
      cooldown: {
        active: cooldownActive,
        until: cooldownActive ? (input.cooldownUntilIso || null) : null,
      },
      audit: {
        transition_reason: reason,
        decision_confidence: Number(Math.max(0, Math.min(1, input.context.decisionConfidence)).toFixed(2)),
      },
      state_momentum: {
        velocity: momentum.velocity,
        decay: momentum.decay,
        state_age_minutes: stateAgeMinutes,
      },
    },
    transition: {
      old_state: input.currentState,
      new_state: newState,
      reason,
      timestamp: input.nowIso,
      changed,
    },
  };
}
