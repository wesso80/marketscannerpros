export interface OutcomeTagInput {
  symbol: string;
  regime: string;
  flowState: string;
  playbook: string;
  taken: boolean;
  resultR: number;
  mfeR: number;
  maeR: number;
  /** 0-100, or null when the user didn't say whether they followed the plan (then it is left out). */
  ruleAdherence: number | null;
}

export interface OutcomeTag {
  key: string;
  label: 'win' | 'loss' | 'flat' | 'skipped';
  efficiency: number;
  quality: number;
}

export interface LearningUpdate {
  weightDelta: number;
  thresholdDelta: number;
  note: string;
}

export function tagOutcome(input: OutcomeTagInput): OutcomeTag {
  const label: OutcomeTag['label'] = !input.taken
    ? 'skipped'
    : input.resultR > 0.15
      ? 'win'
      : input.resultR < -0.15
        ? 'loss'
        : 'flat';

  const efficiency = Number((input.mfeR - Math.abs(Math.min(0, input.maeR))).toFixed(2));
  const clampedR = Math.max(-2, Math.min(2, input.resultR));
  // With no adherence answer, quality comes from the result alone on the same 0-100 scale
  // (0R = 50, ±2R = 100/0) instead of scoring an assumed adherence.
  const rawQuality = input.ruleAdherence == null
    ? 50 + clampedR * 25
    : (input.ruleAdherence * 0.7) + (clampedR * 15) + 35;
  const quality = Number(Math.max(0, Math.min(100, rawQuality)).toFixed(1));

  return {
    key: `${input.symbol.toUpperCase()}|${input.regime}|${input.flowState}|${input.playbook}`,
    label,
    efficiency,
    quality,
  };
}

export function computeLearningUpdate(tag: OutcomeTag): LearningUpdate {
  if (tag.label === 'skipped') {
    return { weightDelta: 0, thresholdDelta: 0, note: 'No execution sample; preserve current weights' };
  }

  if (tag.label === 'win') {
    return {
      weightDelta: Number((0.02 + (tag.quality / 5000)).toFixed(4)),
      thresholdDelta: Number((-0.005).toFixed(4)),
      note: 'Increase factor weights for this regime/profile and slightly lower trigger threshold',
    };
  }

  if (tag.label === 'loss') {
    return {
      weightDelta: Number((-0.02 - ((100 - tag.quality) / 6000)).toFixed(4)),
      thresholdDelta: Number((0.008).toFixed(4)),
      note: 'Reduce factor weights and tighten threshold for this regime/profile',
    };
  }

  return {
    weightDelta: Number((-0.005).toFixed(4)),
    thresholdDelta: Number((0.002).toFixed(4)),
    note: 'Flat outcome: slight conservative adjustment',
  };
}
