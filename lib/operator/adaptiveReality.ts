export type MarketMode = 'expansion' | 'compression' | 'trend' | 'chop' | 'event_risk';
export type OperatorMode = 'sharp' | 'neutral' | 'fatigued' | 'emotional' | 'overtrading';
export type RiskMode = 'normal' | 'elevated' | 'constrained' | 'defensive';
export type IntentMode = 'scanning' | 'planning' | 'executing' | 'managing' | 'reviewing';

export type ExperienceModeKey = 'hunt' | 'focus' | 'risk_control' | 'learning' | 'passive_scan';

export interface AdaptiveInputs {
  market: {
    mode: MarketMode;
    score: number;
  };
  operator: {
    mode: OperatorMode;
    score: number;
  };
  risk: {
    mode: RiskMode;
    score: number;
  };
  intent: {
    mode: IntentMode;
    score: number;
  };
}

export interface ExperienceOutput {
  mode: ExperienceModeKey;
  label: string;
  reason: string;
  priorityWidgets: string[];
  hiddenWidgets: string[];
  actionFriction: number;
  alertIntensity: number;
  directives: {
    showScanner: boolean;
    emphasizeRisk: boolean;
    reduceAlerts: boolean;
    highlightLearning: boolean;
    minimalSurface: boolean;
    quickActions: boolean;
    frictionLevel: 'low' | 'medium' | 'high';
  };
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const modeConfig: Record<ExperienceModeKey, Omit<ExperienceOutput, 'mode'>> = {
  hunt: {
    label: 'Hunt Mode',
    reason: 'Market opportunity and operator sharpness are aligned for active setup discovery.',
    priorityWidgets: ['signal_flow', 'scanner', 'top_attention', 'quick_actions'],
    hiddenWidgets: [],
    actionFriction: 0.15,
    alertIntensity: 0.9,
    directives: {
      showScanner: true,
      emphasizeRisk: false,
      reduceAlerts: false,
      highlightLearning: false,
      minimalSurface: false,
      quickActions: true,
      frictionLevel: 'low',
    },
  },
  focus: {
    label: 'Focus Mode',
    reason: 'Execution context is active, so the environment prioritizes trade management over discovery.',
    priorityWidgets: ['risk_command', 'decision_cockpit', 'live_alerts'],
    hiddenWidgets: ['broad_scanner'],
    actionFriction: 0.45,
    alertIntensity: 0.65,
    directives: {
      showScanner: false,
      emphasizeRisk: true,
      reduceAlerts: false,
      highlightLearning: false,
      minimalSurface: false,
      quickActions: true,
      frictionLevel: 'medium',
    },
  },
  risk_control: {
    label: 'Risk-Control Mode',
    reason: 'Risk stress is elevated; environment is constrained to protect capital and decision quality.',
    priorityWidgets: ['risk_command', 'drawdown_state', 'coach_guardrails'],
    hiddenWidgets: ['broad_scanner', 'aggressive_actions'],
    actionFriction: 0.85,
    alertIntensity: 0.35,
    directives: {
      showScanner: false,
      emphasizeRisk: true,
      reduceAlerts: true,
      highlightLearning: false,
      minimalSurface: false,
      quickActions: false,
      frictionLevel: 'high',
    },
  },
  learning: {
    label: 'Learning Mode',
    reason: 'Review context is active; coaching and pattern reinforcement are prioritized.',
    priorityWidgets: ['learning_loop', 'coach_insights', 'journal_patterns'],
    hiddenWidgets: ['aggressive_actions'],
    actionFriction: 0.25,
    alertIntensity: 0.3,
    directives: {
      showScanner: false,
      emphasizeRisk: false,
      reduceAlerts: true,
      highlightLearning: true,
      minimalSurface: false,
      quickActions: false,
      frictionLevel: 'low',
    },
  },
  passive_scan: {
    label: 'Passive Scan Mode',
    reason: 'Opportunity is limited; maintain minimal surface and wait for higher-conviction context.',
    priorityWidgets: ['top_attention', 'high_conviction_alerts'],
    hiddenWidgets: ['broad_scanner', 'execution_controls'],
    actionFriction: 0.35,
    alertIntensity: 0.25,
    directives: {
      showScanner: true,
      emphasizeRisk: false,
      reduceAlerts: true,
      highlightLearning: false,
      minimalSurface: true,
      quickActions: false,
      frictionLevel: 'low',
    },
  },
};

export function evaluateAdaptiveReality(inputs: AdaptiveInputs): {
  output: ExperienceOutput;
  matrixScore: number;
} {
  const marketScore = clamp(inputs.market.score);
  const operatorScore = clamp(inputs.operator.score);
  const riskScore = clamp(inputs.risk.score);
  const intentScore = clamp(inputs.intent.score);

  const matrixScore = Number(
    (marketScore * 0.3 + operatorScore * 0.25 + (100 - riskScore) * 0.3 + intentScore * 0.15).toFixed(1)
  );

  let mode: ExperienceModeKey;
  if (inputs.risk.mode === 'defensive' || inputs.risk.mode === 'constrained') {
    mode = 'risk_control';
  } else if (inputs.operator.mode === 'fatigued' || inputs.operator.mode === 'emotional' || inputs.operator.mode === 'overtrading') {
    mode = 'risk_control';
  } else if (inputs.intent.mode === 'reviewing') {
    mode = 'learning';
  } else if ((inputs.market.mode === 'compression' || inputs.market.mode === 'chop') && inputs.intent.mode === 'scanning') {
    mode = 'passive_scan';
  } else if (inputs.intent.mode === 'executing' || inputs.intent.mode === 'managing') {
    mode = 'focus';
  } else if ((inputs.market.mode === 'expansion' || inputs.market.mode === 'trend') && inputs.operator.mode === 'sharp') {
    mode = 'hunt';
  } else {
    mode = matrixScore >= 60 ? 'focus' : 'learning';
  }

  return {
    output: {
      mode,
      ...modeConfig[mode],
    },
    matrixScore,
  };
}

export function mapUserModeToIntentMode(userMode: string): IntentMode {
  const mode = String(userMode || '').toUpperCase();
  if (mode === 'OBSERVE') return 'scanning';
  if (mode === 'EVALUATE') return 'planning';
  if (mode === 'EXECUTE') return 'executing';
  if (mode === 'MANAGE') return 'managing';
  return 'reviewing';
}
