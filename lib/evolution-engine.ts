export type OutcomeLabel =
  | 'WIN'
  | 'LOSS'
  | 'SCRATCH'
  | 'LATE_ENTRY'
  | 'EARLY_EXIT'
  | 'FORCED_TRADE'
  | 'NO_FOLLOW_THROUGH';

export interface EvolutionSample {
  symbol: string;
  symbolGroup: string;
  state: string;
  transitionPath: string;
  playbook: string;
  outcome: OutcomeLabel;
  riskMultiple: number;
  holdingMinutes: number;
  timeOfDay: 'OPEN' | 'MIDDAY' | 'CLOSE' | 'AFTERHOURS';
  stateAlignment: number;
  flowQuality: number;
  timingPrecision: number;
  volatilityMatch: number;
  executionQuality: number;
}

export interface EvolutionCycleInput {
  symbolGroup: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  baselineWeights: {
    regimeFit: number;
    capitalFlow: number;
    structureQuality: number;
    optionsAlignment: number;
    timing: number;
    dataHealth: number;
  };
  armedThreshold: number; // 0-1
  samples: EvolutionSample[];
}

export interface EvolutionChange {
  parameter: string;
  old: number;
  new: number;
  reason: string;
}

export interface EvolutionCycleOutput {
  symbol_group: string;
  learning_period: string;
  changes: EvolutionChange[];
  confidence: number;
  metrics: {
    sampleCount: number;
    stateWinRates: Array<{ state: string; winRate: number; sampleSize: number }>;
    playbookWinRates: Array<{ playbook: string; winRate: number; sampleSize: number }>;
    timeOfDayEdge: Array<{ bucket: EvolutionSample['timeOfDay']; winRate: number; sampleSize: number }>;
    idqsAverage: number;
    idqsWinAverage: number;
    idqsLossAverage: number;
    transitionQuality: {
      fullPathWinRate: number | null;
      fastJumpWinRate: number | null;
    };
  };
  adjustments: {
    weights: EvolutionCycleInput['baselineWeights'];
    thresholds: {
      armedThreshold: number;
    };
    triggerSensitivity: {
      reclaim_vwap_and_hold_2m: number;
      break_prev_high_with_volume: number;
      pullback_to_20ema_then_bounce: number;
      sweep_low_then_reclaim_level: number;
      range_break_after_compression: number;
    };
    transitionPenalty: {
      fastJumpPenalty: number;
      fullPathBoost: number;
    };
  };
  cadencePolicy: {
    intraday: 'passive_learning_only';
    daily: 'micro_adjustments';
    weekly: 'medium_recalibration';
    monthly: 'major_structural_update';
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const MAX_WEIGHT_STEP = 0.10;
const MAX_THRESHOLD_STEP = 0.05;
const MAX_TRIGGER_STEP = 0.10;

const CADENCE_POLICY: EvolutionCycleOutput['cadencePolicy'] = {
  intraday: 'passive_learning_only',
  daily: 'micro_adjustments',
  weekly: 'medium_recalibration',
  monthly: 'major_structural_update',
};

function isWin(outcome: OutcomeLabel): boolean {
  return outcome === 'WIN';
}

function isLoss(outcome: OutcomeLabel): boolean {
  return outcome === 'LOSS' || outcome === 'NO_FOLLOW_THROUGH' || outcome === 'FORCED_TRADE';
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function winRate(samples: EvolutionSample[]): number {
  if (!samples.length) return 0;
  const wins = samples.filter((sample) => isWin(sample.outcome)).length;
  return wins / samples.length;
}

function computeIDQS(sample: EvolutionSample): number {
  const score =
    (sample.stateAlignment * 0.30) +
    (sample.flowQuality * 0.25) +
    (sample.timingPrecision * 0.20) +
    (sample.volatilityMatch * 0.15) +
    (sample.executionQuality * 0.10);

  return clamp(score, 0, 1);
}

function windowBlend(samples: EvolutionSample[]): EvolutionSample[] {
  const windows = [
    { size: 30, blend: 0.5 },
    { size: 100, blend: 0.3 },
    { size: 300, blend: 0.2 },
  ];

  const seen = new Set<string>();
  const blended: EvolutionSample[] = [];

  for (const window of windows) {
    const bucket = samples.slice(0, window.size);
    const takeCount = Math.max(0, Math.round(bucket.length * window.blend));
    let added = 0;

    for (const sample of bucket) {
      if (added >= takeCount) break;
      const fingerprint = `${sample.symbol}:${sample.playbook}:${sample.outcome}:${sample.holdingMinutes}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      blended.push(sample);
      added += 1;
    }
  }

  return blended.length ? blended : samples.slice(0, 30);
}

function computePredictivePower(samples: EvolutionSample[], key: keyof Pick<EvolutionSample, 'stateAlignment' | 'flowQuality' | 'timingPrecision' | 'volatilityMatch' | 'executionQuality'>): number {
  const winners = samples.filter((sample) => isWin(sample.outcome));
  const losers = samples.filter((sample) => isLoss(sample.outcome));
  if (!winners.length || !losers.length) return 0;

  const winnerMean = mean(winners.map((sample) => sample[key]));
  const loserMean = mean(losers.map((sample) => sample[key]));
  return clamp((winnerMean - loserMean) * 2, -0.3, 0.3);
}

function normalizeWeights(weights: EvolutionCycleInput['baselineWeights']): EvolutionCycleInput['baselineWeights'] {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return weights;
  return {
    regimeFit: weights.regimeFit / total,
    capitalFlow: weights.capitalFlow / total,
    structureQuality: weights.structureQuality / total,
    optionsAlignment: weights.optionsAlignment / total,
    timing: weights.timing / total,
    dataHealth: weights.dataHealth / total,
  };
}

export function runEvolutionCycle(input: EvolutionCycleInput): EvolutionCycleOutput {
  const blended = windowBlend(input.samples);
  const sampleCount = blended.length;

  const idqs = blended.map(computeIDQS);
  const idqsWin = blended.filter((sample) => isWin(sample.outcome)).map(computeIDQS);
  const idqsLoss = blended.filter((sample) => isLoss(sample.outcome)).map(computeIDQS);

  const stateGroups = new Map<string, EvolutionSample[]>();
  const playbookGroups = new Map<string, EvolutionSample[]>();
  const todGroups = new Map<EvolutionSample['timeOfDay'], EvolutionSample[]>();

  for (const sample of blended) {
    const stateBucket = stateGroups.get(sample.state) ?? [];
    stateBucket.push(sample);
    stateGroups.set(sample.state, stateBucket);

    const playbookBucket = playbookGroups.get(sample.playbook) ?? [];
    playbookBucket.push(sample);
    playbookGroups.set(sample.playbook, playbookBucket);

    const todBucket = todGroups.get(sample.timeOfDay) ?? [];
    todBucket.push(sample);
    todGroups.set(sample.timeOfDay, todBucket);
  }

  const fullPath = blended.filter((sample) => sample.transitionPath === 'WATCH>STALK>ARMED>EXECUTE');
  const fastJump = blended.filter((sample) => sample.transitionPath === 'SCAN>ARMED>EXECUTE');

  const power = {
    regimeFit: computePredictivePower(blended, 'stateAlignment'),
    capitalFlow: computePredictivePower(blended, 'flowQuality'),
    structureQuality: computePredictivePower(blended, 'executionQuality'),
    optionsAlignment: computePredictivePower(blended, 'volatilityMatch'),
    timing: computePredictivePower(blended, 'timingPrecision'),
    dataHealth: computePredictivePower(blended, 'stateAlignment') * 0.6,
  };

  const nextWeightsRaw = {
    regimeFit: clamp(input.baselineWeights.regimeFit * (1 + power.regimeFit), input.baselineWeights.regimeFit * (1 - MAX_WEIGHT_STEP), input.baselineWeights.regimeFit * (1 + MAX_WEIGHT_STEP)),
    capitalFlow: clamp(input.baselineWeights.capitalFlow * (1 + power.capitalFlow), input.baselineWeights.capitalFlow * (1 - MAX_WEIGHT_STEP), input.baselineWeights.capitalFlow * (1 + MAX_WEIGHT_STEP)),
    structureQuality: clamp(input.baselineWeights.structureQuality * (1 + power.structureQuality), input.baselineWeights.structureQuality * (1 - MAX_WEIGHT_STEP), input.baselineWeights.structureQuality * (1 + MAX_WEIGHT_STEP)),
    optionsAlignment: clamp(input.baselineWeights.optionsAlignment * (1 + power.optionsAlignment), input.baselineWeights.optionsAlignment * (1 - MAX_WEIGHT_STEP), input.baselineWeights.optionsAlignment * (1 + MAX_WEIGHT_STEP)),
    timing: clamp(input.baselineWeights.timing * (1 + power.timing), input.baselineWeights.timing * (1 - MAX_WEIGHT_STEP), input.baselineWeights.timing * (1 + MAX_WEIGHT_STEP)),
    dataHealth: clamp(input.baselineWeights.dataHealth * (1 + power.dataHealth), input.baselineWeights.dataHealth * (1 - MAX_WEIGHT_STEP), input.baselineWeights.dataHealth * (1 + MAX_WEIGHT_STEP)),
  };

  const nextWeights = normalizeWeights(nextWeightsRaw);

  const winnerIdqs = mean(idqsWin);
  const targetThreshold = clamp(winnerIdqs - 0.04, 0.55, 0.9);
  const armedThreshold = clamp(
    targetThreshold,
    input.armedThreshold - MAX_THRESHOLD_STEP,
    input.armedThreshold + MAX_THRESHOLD_STEP
  );

  const triggerBase = {
    reclaim_vwap_and_hold_2m: 1,
    break_prev_high_with_volume: 1,
    pullback_to_20ema_then_bounce: 1,
    sweep_low_then_reclaim_level: 1,
    range_break_after_compression: 1,
  };

  const openWinRate = winRate(blended.filter((sample) => sample.timeOfDay === 'OPEN'));
  const middayWinRate = winRate(blended.filter((sample) => sample.timeOfDay === 'MIDDAY'));
  const sessionDrift = openWinRate - middayWinRate;

  const triggerSensitivity = {
    reclaim_vwap_and_hold_2m: clamp(triggerBase.reclaim_vwap_and_hold_2m + sessionDrift * 0.3, 1 - MAX_TRIGGER_STEP, 1 + MAX_TRIGGER_STEP),
    break_prev_high_with_volume: clamp(triggerBase.break_prev_high_with_volume + sessionDrift * 0.35, 1 - MAX_TRIGGER_STEP, 1 + MAX_TRIGGER_STEP),
    pullback_to_20ema_then_bounce: clamp(triggerBase.pullback_to_20ema_then_bounce + sessionDrift * 0.2, 1 - MAX_TRIGGER_STEP, 1 + MAX_TRIGGER_STEP),
    sweep_low_then_reclaim_level: clamp(triggerBase.sweep_low_then_reclaim_level + sessionDrift * 0.15, 1 - MAX_TRIGGER_STEP, 1 + MAX_TRIGGER_STEP),
    range_break_after_compression: clamp(triggerBase.range_break_after_compression + sessionDrift * 0.25, 1 - MAX_TRIGGER_STEP, 1 + MAX_TRIGGER_STEP),
  };

  const fullPathWinRate = fullPath.length ? winRate(fullPath) : null;
  const fastJumpWinRate = fastJump.length ? winRate(fastJump) : null;
  const transitionGap = (fullPathWinRate !== null && fastJumpWinRate !== null)
    ? fullPathWinRate - fastJumpWinRate
    : 0;
  const transitionPenalty = {
    fastJumpPenalty: Number(clamp(1 + transitionGap * 0.4, 0.9, 1.1).toFixed(3)),
    fullPathBoost: Number(clamp(1 + transitionGap * 0.3, 0.9, 1.1).toFixed(3)),
  };

  const changes: EvolutionChange[] = [];

  const pushWeightChange = (key: keyof EvolutionCycleInput['baselineWeights'], label: string) => {
    const oldVal = input.baselineWeights[key];
    const newVal = nextWeights[key];
    if (Math.abs(newVal - oldVal) >= 0.005) {
      changes.push({
        parameter: `${label}_weight`,
        old: Number(oldVal.toFixed(4)),
        new: Number(newVal.toFixed(4)),
        reason: newVal > oldVal ? 'Higher predictive power' : 'Lower predictive power',
      });
    }
  };

  pushWeightChange('regimeFit', 'regime_fit');
  pushWeightChange('capitalFlow', 'capital_flow');
  pushWeightChange('structureQuality', 'structure_quality');
  pushWeightChange('optionsAlignment', 'options_alignment');
  pushWeightChange('timing', 'timing');
  pushWeightChange('dataHealth', 'data_health');

  if (Math.abs(armedThreshold - input.armedThreshold) >= 0.005) {
    changes.push({
      parameter: 'armed_threshold',
      old: Number(input.armedThreshold.toFixed(4)),
      new: Number(armedThreshold.toFixed(4)),
      reason: 'Threshold updated from observed decision quality outcomes',
    });
  }

  if (transitionGap !== 0) {
    changes.push({
      parameter: 'fast_jump_penalty',
      old: 1,
      new: transitionPenalty.fastJumpPenalty,
      reason: transitionGap > 0
        ? 'Fast state jumps underperform full path transitions'
        : 'Fast state jumps outperform full path transitions',
    });
  }

  const confidence = clamp(
    (sampleCount / 200) * 0.6 +
    Math.abs(mean(idqsWin) - mean(idqsLoss)) * 0.4,
    0,
    1
  );

  return {
    symbol_group: input.symbolGroup,
    learning_period: sampleCount >= 100 ? 'last_100_trades' : sampleCount >= 30 ? 'last_30_trades' : 'last_window',
    changes,
    confidence: Number(confidence.toFixed(2)),
    metrics: {
      sampleCount,
      stateWinRates: Array.from(stateGroups.entries()).map(([state, rows]) => ({
        state,
        winRate: Number(winRate(rows).toFixed(2)),
        sampleSize: rows.length,
      })),
      playbookWinRates: Array.from(playbookGroups.entries()).map(([playbook, rows]) => ({
        playbook,
        winRate: Number(winRate(rows).toFixed(2)),
        sampleSize: rows.length,
      })),
      timeOfDayEdge: Array.from(todGroups.entries()).map(([bucket, rows]) => ({
        bucket,
        winRate: Number(winRate(rows).toFixed(2)),
        sampleSize: rows.length,
      })),
      idqsAverage: Number(mean(idqs).toFixed(3)),
      idqsWinAverage: Number(mean(idqsWin).toFixed(3)),
      idqsLossAverage: Number(mean(idqsLoss).toFixed(3)),
      transitionQuality: {
        fullPathWinRate: fullPathWinRate !== null ? Number(fullPathWinRate.toFixed(2)) : null,
        fastJumpWinRate: fastJumpWinRate !== null ? Number(fastJumpWinRate.toFixed(2)) : null,
      },
    },
    adjustments: {
      weights: {
        regimeFit: Number(nextWeights.regimeFit.toFixed(4)),
        capitalFlow: Number(nextWeights.capitalFlow.toFixed(4)),
        structureQuality: Number(nextWeights.structureQuality.toFixed(4)),
        optionsAlignment: Number(nextWeights.optionsAlignment.toFixed(4)),
        timing: Number(nextWeights.timing.toFixed(4)),
        dataHealth: Number(nextWeights.dataHealth.toFixed(4)),
      },
      thresholds: {
        armedThreshold: Number(armedThreshold.toFixed(4)),
      },
      triggerSensitivity: {
        reclaim_vwap_and_hold_2m: Number(triggerSensitivity.reclaim_vwap_and_hold_2m.toFixed(3)),
        break_prev_high_with_volume: Number(triggerSensitivity.break_prev_high_with_volume.toFixed(3)),
        pullback_to_20ema_then_bounce: Number(triggerSensitivity.pullback_to_20ema_then_bounce.toFixed(3)),
        sweep_low_then_reclaim_level: Number(triggerSensitivity.sweep_low_then_reclaim_level.toFixed(3)),
        range_break_after_compression: Number(triggerSensitivity.range_break_after_compression.toFixed(3)),
      },
      transitionPenalty,
    },
    cadencePolicy: CADENCE_POLICY,
  };
}
