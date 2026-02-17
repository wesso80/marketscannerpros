import type { DecisionPacket } from '@/lib/workflow/types';

export type FeedbackTag = 'validated' | 'ignored' | 'wrong_context' | 'timing_issue';

export interface ConsciousnessObserved {
  symbol: string;
  market: {
    mode: string;
    score: number;
    volatilityState: string;
  };
  operator: {
    mode: string;
    score: number;
  };
  risk: {
    mode: string;
    score: number;
  };
  intent: {
    mode: string;
    score: number;
  };
  setup: {
    signalScore: number;
    operatorFit: number;
    confidence: number;
  };
  behavior: {
    quality: number;
    lateEntryPct: number;
    earlyExitPct: number;
    ignoredSetupPct: number;
  };
  automation: {
    hasPendingTask: boolean;
    hasTopAttention: boolean;
  };
}

export interface ConsciousnessLoopOutput {
  observe: ConsciousnessObserved;
  interpret: {
    decisionContext: string;
    suitability: 'high' | 'moderate' | 'low';
  };
  decide: {
    decisionPacket: DecisionPacket;
    confidence: number;
    suggestedActions: string[];
  };
  act: {
    autoActions: string[];
  };
  learn: {
    feedbackTag: FeedbackTag;
    rationale: string;
  };
  adapt: {
    adjustments: string[];
  };
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function determineFeedbackTag(input: ConsciousnessObserved): { tag: FeedbackTag; rationale: string } {
  if (input.behavior.ignoredSetupPct >= 55) {
    return { tag: 'ignored', rationale: 'High ignored setup rate indicates execution follow-through is weak.' };
  }
  if (input.behavior.lateEntryPct >= 40 || input.behavior.earlyExitPct >= 40) {
    return { tag: 'timing_issue', rationale: 'Entry/exit timing drift detected from behavior metrics.' };
  }
  if (input.risk.mode === 'defensive' || input.risk.score >= 80) {
    return { tag: 'wrong_context', rationale: 'Risk regime is constrained versus current setup aggression.' };
  }
  return { tag: 'validated', rationale: 'Context and behavior are aligned with execution goals.' };
}

export function runConsciousnessLoop(input: ConsciousnessObserved): ConsciousnessLoopOutput {
  const suitabilityScore = clamp(
    input.setup.operatorFit * 0.45 +
      input.behavior.quality * 0.3 +
      (100 - input.risk.score) * 0.25,
    0,
    100
  );

  const suitability = suitabilityScore >= 70 ? 'high' : suitabilityScore >= 52 ? 'moderate' : 'low';

  const decisionContext = `${input.market.mode} market, ${input.operator.mode} operator, ${input.risk.mode} risk, ${input.intent.mode} intent`;

  const suggestedActions = suitability === 'high'
    ? ['promote_candidate', 'prepare_trade_plan', 'arm_alert']
    : suitability === 'moderate'
    ? ['review_risk', 'refine_entry', 'run_backtest']
    : ['reduce_exposure', 'pause_new_entries', 'review_coach_notes'];

  const status: DecisionPacket['status'] = input.automation.hasPendingTask
    ? 'planned'
    : input.automation.hasTopAttention
    ? 'candidate'
    : 'alerted';

  const decisionPacket: DecisionPacket = {
    id: `dp_${input.symbol}_${Date.now()}`,
    createdAt: new Date().toISOString(),
    symbol: input.symbol,
    market: 'stocks',
    signalSource: 'operator_presence',
    signalScore: Math.round(input.setup.signalScore),
    bias: input.market.score >= 55 ? 'bullish' : input.market.score <= 45 ? 'bearish' : 'neutral',
    timeframeBias: [input.market.volatilityState || 'normal', input.intent.mode],
    riskScore: Math.round(input.risk.score),
    volatilityRegime: input.market.volatilityState,
    operatorFit: Number(input.setup.operatorFit.toFixed(1)),
    status,
  };

  const feedback = determineFeedbackTag(input);

  const autoActions = [
    input.automation.hasPendingTask ? 'task_queue_prioritized' : 'no_pending_task',
    suitability === 'high' ? 'alert_auto_ready' : 'alert_throttled',
  ];

  const adjustments = suitability === 'high'
    ? ['increase_signal_emphasis', 'keep_low_friction']
    : suitability === 'moderate'
    ? ['maintain_medium_friction', 'increase_risk_visibility']
    : ['increase_action_friction', 'reduce_alert_intensity', 'elevate_learning_prompts'];

  return {
    observe: input,
    interpret: {
      decisionContext,
      suitability,
    },
    decide: {
      decisionPacket,
      confidence: Number(suitabilityScore.toFixed(1)),
      suggestedActions,
    },
    act: {
      autoActions,
    },
    learn: {
      feedbackTag: feedback.tag,
      rationale: feedback.rationale,
    },
    adapt: {
      adjustments,
    },
  };
}
