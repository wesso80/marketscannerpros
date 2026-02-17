export type OperatorBrainState = 'FLOW' | 'FOCUSED' | 'STRESSED' | 'OVERLOADED';

export interface OperatorBrainInputs {
  cognitiveLoad: number;
  behaviorQuality: number;
  recentLossPressure: number;
  feedbackPenalty: number;
  actions8h: number;
  ignoredSetupPct: number;
  lateEntryPct: number;
  earlyExitPct: number;
}

export interface OperatorBrainProfile {
  state: OperatorBrainState;
  executionMode: 'flow' | 'hesitant' | 'aggressive';
  fatigueScore: number;
  riskToleranceScore: number;
  riskCapacity: 'HIGH' | 'MEDIUM' | 'LOW';
  thresholdShift: number;
  aggressionBias: 'reduced' | 'balanced' | 'elevated';
  guidance: string;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function deriveOperatorBrainState(input: OperatorBrainInputs): OperatorBrainProfile {
  const fatigueScore = clamp(
    input.cognitiveLoad * 0.45 +
      (100 - input.behaviorQuality) * 0.25 +
      input.feedbackPenalty * 0.2 +
      input.recentLossPressure * 0.1,
    0,
    100
  );

  const riskToleranceScore = clamp(
    100 - (
      input.cognitiveLoad * 0.35 +
      input.recentLossPressure * 0.3 +
      input.feedbackPenalty * 0.25 +
      (input.ignoredSetupPct * 0.1)
    ),
    0,
    100
  );

  const instability = clamp(
    input.lateEntryPct * 0.35 + input.earlyExitPct * 0.35 + input.ignoredSetupPct * 0.3,
    0,
    100
  );

  let state: OperatorBrainState;
  if (fatigueScore >= 78 || riskToleranceScore <= 28 || instability >= 60) {
    state = 'OVERLOADED';
  } else if (fatigueScore >= 58 || riskToleranceScore <= 45 || instability >= 40) {
    state = 'STRESSED';
  } else if (fatigueScore <= 32 && riskToleranceScore >= 72 && input.actions8h <= 10) {
    state = 'FLOW';
  } else {
    state = 'FOCUSED';
  }

  const profileByState: Record<OperatorBrainState, Omit<OperatorBrainProfile, 'state' | 'fatigueScore' | 'riskToleranceScore'>> = {
    FLOW: {
      executionMode: 'flow',
      riskCapacity: 'HIGH',
      thresholdShift: -6,
      aggressionBias: 'elevated',
      guidance: 'Operator is in sync. Surface top opportunities quickly with low friction.',
    },
    FOCUSED: {
      executionMode: 'flow',
      riskCapacity: 'MEDIUM',
      thresholdShift: 0,
      aggressionBias: 'balanced',
      guidance: 'Operator is stable. Keep balanced setup quality and risk checks.',
    },
    STRESSED: {
      executionMode: 'hesitant',
      riskCapacity: 'LOW',
      thresholdShift: 10,
      aggressionBias: 'reduced',
      guidance: 'Operator pressure rising. Raise setup threshold and emphasize risk controls.',
    },
    OVERLOADED: {
      executionMode: 'hesitant',
      riskCapacity: 'LOW',
      thresholdShift: 18,
      aggressionBias: 'reduced',
      guidance: 'Operator is overloaded. Minimize noise, reduce actions, enforce defensive posture.',
    },
  };

  return {
    state,
    fatigueScore: Number(fatigueScore.toFixed(1)),
    riskToleranceScore: Number(riskToleranceScore.toFixed(1)),
    ...profileByState[state],
  };
}
