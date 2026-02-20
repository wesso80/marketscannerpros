import {
  Direction,
  TimeConfluenceV2Inputs,
  TimeConfluenceV2Output,
  TimeContextInputs,
  TimeExecutionInputs,
  TimeSetupInputs,
  TimePermission,
} from '@/components/time/types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp100 = (x: number) => Math.max(0, Math.min(100, x));
const round = (x: number) => Math.round(x);

export function pct(x01: number) {
  return round(clamp01(x01) * 100);
}

function weightedAvg(parts: Array<{ v: number; w: number }>) {
  const wSum = parts.reduce((sum, part) => sum + part.w, 0);
  if (wSum <= 0) return 0;
  return parts.reduce((sum, part) => sum + part.v * part.w, 0) / wSum;
}

export function computeContextScore(
  context: TimeContextInputs,
  primaryDirection: Direction,
): { score: number; reasons: string[]; breakdown: Record<string, number> } {
  const reasons: string[] = [];

  const freshness = clamp01(1 - context.dataIntegrity.freshnessSec / 600);
  const coverage = clamp01(context.dataIntegrity.coveragePct);
  const gaps = clamp01(1 - context.dataIntegrity.gapsPct);
  const dataIntegrityScore = weightedAvg([
    { v: freshness, w: 0.35 },
    { v: coverage, w: 0.45 },
    { v: gaps, w: 0.2 },
  ]);

  if (dataIntegrityScore < 0.6) reasons.push('Data integrity is degraded (freshness/coverage/gaps).');

  const regimeScore01 =
    context.regime === 'trend'
      ? 1
      : context.regime === 'expansion'
      ? 0.85
      : context.regime === 'range'
      ? 0.55
      : context.regime === 'compression'
      ? 0.45
      : 0.5;

  const volScore01 =
    context.volState === 'low'
      ? 0.65
      : context.volState === 'normal'
      ? 1
      : context.volState === 'high'
      ? 0.7
      : 0.4;

  const trendStrength01 = clamp01(context.trendStrength);

  const agree = (a: Direction, b: Direction) =>
    a === 'neutral' || b === 'neutral' ? 0.5 : a === b ? 1 : 0;

  const biasAgreement01 = weightedAvg([
    { v: agree(context.macroBias, primaryDirection), w: 0.5 },
    { v: agree(context.htfBias, primaryDirection), w: 0.5 },
  ]);

  if (biasAgreement01 < 0.5) reasons.push('HTF/Macro bias conflicts with the primary time direction.');

  const score01 = weightedAvg([
    { v: dataIntegrityScore, w: 0.4 },
    { v: regimeScore01, w: 0.2 },
    { v: volScore01, w: 0.15 },
    { v: trendStrength01, w: 0.15 },
    { v: biasAgreement01, w: 0.1 },
  ]);

  const breakdown = {
    dataIntegrity: pct(dataIntegrityScore),
    regime: pct(regimeScore01),
    volatility: pct(volScore01),
    trendStrength: pct(trendStrength01),
    biasAgreement: pct(biasAgreement01),
  };

  if (context.extremeConditions.includes('VOL_SPIKE')) reasons.push('Volatility spike detected.');
  if (context.extremeConditions.includes('DISLOCATION')) reasons.push('Market dislocation detected.');
  if (context.extremeConditions.includes('LIQUIDITY_THIN')) reasons.push('Liquidity thin / degraded conditions.');

  return { score: pct(score01), reasons, breakdown };
}

export function computeSetupScore(setup: TimeSetupInputs): {
  score: number;
  reasons: string[];
  breakdown: Record<string, number>;
} {
  const reasons: string[] = [];

  const tfCount = Math.max(1, setup.window.tfCount || setup.decomposition.length || 1);
  const alignmentRatio01 = clamp01((setup.window.alignmentCount || 0) / tfCount);

  const aligned = setup.decomposition.filter((row) => row.alignedToPrimary);
  const alignedStrength01 =
    aligned.length === 0
      ? 0
      : clamp01(aligned.reduce((sum, row) => sum + clamp01(row.strength), 0) / aligned.length);

  const directionConsistency01 = clamp01(setup.window.directionConsistency);
  const clusterIntegrity01 = clamp01(setup.window.clusterIntegrity);
  const windowStrength01 = clamp01(setup.window.strength);

  const opposed = setup.decomposition.filter((row) => !row.alignedToPrimary && row.closeBias !== 'neutral').length;
  const opposeRatio = opposed / tfCount;
  const mixedPenalty01 = opposeRatio >= 0.5 ? 0.2 : opposeRatio >= 0.35 ? 0.1 : 0;

  if (alignmentRatio01 < 0.5) reasons.push('Low multi-timeframe alignment count.');
  if (alignedStrength01 < 0.55) reasons.push('Aligned timeframes are weak (low strength).');
  if (clusterIntegrity01 < 0.55) reasons.push('Cluster integrity is low (noisy/unstable windows).');
  if (directionConsistency01 < 0.55) reasons.push('Direction consistency is weak across timeframes.');
  if (windowStrength01 < 0.55) reasons.push('Active window strength is weak.');

  let score01 = weightedAvg([
    { v: alignmentRatio01, w: 0.25 },
    { v: alignedStrength01, w: 0.25 },
    { v: directionConsistency01, w: 0.15 },
    { v: clusterIntegrity01, w: 0.15 },
    { v: windowStrength01, w: 0.2 },
  ]);

  score01 = clamp01(score01 - mixedPenalty01);
  if (mixedPenalty01 > 0) reasons.push('Mixed-direction decomposition detected (penalized).');

  const breakdown = {
    alignmentRatio: pct(alignmentRatio01),
    alignedStrength: pct(alignedStrength01),
    directionConsistency: pct(directionConsistency01),
    clusterIntegrity: pct(clusterIntegrity01),
    windowStrength: pct(windowStrength01),
    mixedPenalty: pct(mixedPenalty01),
  };

  return { score: pct(score01), reasons, breakdown };
}

export function computeExecutionScore(exec: TimeExecutionInputs): {
  score: number;
  reasons: string[];
  breakdown: Record<string, number>;
} {
  const reasons: string[] = [];

  const closeConfirmation01 =
    exec.closeConfirmation === 'CONFIRMED' ? 1 : exec.closeConfirmation === 'PENDING' ? 0.55 : 0.1;
  const closeStrength01 = clamp01(exec.closeStrength);
  const entryWindow01 = clamp01(exec.entryWindowQuality);
  const liquidity01 = exec.liquidityOK ? 1 : 0.3;
  const risk01 = exec.riskState === 'controlled' ? 1 : exec.riskState === 'elevated' ? 0.6 : 0.35;

  if (exec.closeConfirmation !== 'CONFIRMED') reasons.push('Close confirmation not confirmed.');
  if (closeStrength01 < 0.55) reasons.push('Close strength is weak.');
  if (entryWindow01 < 0.6) reasons.push('Entry window quality is weak.');
  if (!exec.liquidityOK) reasons.push('Liquidity gate failed.');
  if (exec.riskState !== 'controlled') reasons.push(`Risk state is ${exec.riskState}.`);

  const score01 = weightedAvg([
    { v: closeConfirmation01, w: 0.35 },
    { v: closeStrength01, w: 0.2 },
    { v: entryWindow01, w: 0.25 },
    { v: liquidity01, w: 0.1 },
    { v: risk01, w: 0.1 },
  ]);

  const breakdown = {
    closeConfirmation: pct(closeConfirmation01),
    closeStrength: pct(closeStrength01),
    entryWindowQuality: pct(entryWindow01),
    liquidity: pct(liquidity01),
    riskState: pct(risk01),
  };

  return { score: pct(score01), reasons, breakdown };
}

export function computeTimeConfluenceV2(input: TimeConfluenceV2Inputs): TimeConfluenceV2Output {
  const direction = input.setup.primaryDirection;

  const ctx = computeContextScore(input.context, direction);
  const setup = computeSetupScore(input.setup);
  const exec = computeExecutionScore(input.execution);

  const timeConfluenceScore = clamp100(round(0.25 * ctx.score + 0.55 * setup.score + 0.2 * exec.score));

  let gateScore = clamp100(round(0.15 * ctx.score + 0.35 * setup.score + 0.5 * exec.score));
  const reasons: string[] = [];

  const hardBlockers: string[] = [];
  if (ctx.breakdown.dataIntegrity < 50) hardBlockers.push('BLOCK: Data integrity below 50.');
  if (input.context.extremeConditions.includes('DISLOCATION')) hardBlockers.push('BLOCK: Market dislocation flagged.');
  if (input.context.extremeConditions.includes('LIQUIDITY_THIN') && !input.execution.liquidityOK) {
    hardBlockers.push('BLOCK: Liquidity thin + liquidity gate failed.');
  }
  if (input.execution.riskState === 'high' && input.execution.closeConfirmation !== 'CONFIRMED') {
    hardBlockers.push('BLOCK: Risk=high while close is not confirmed.');
  }
  if (setup.score < 40) hardBlockers.push('BLOCK: Setup score < 40 (no reliable time structure).');

  const penalties: Array<{ flag: string; delta: number }> = [];
  if (input.context.extremeConditions.includes('VOL_SPIKE')) penalties.push({ flag: 'VOL_SPIKE', delta: 8 });
  if (input.context.extremeConditions.includes('PRICE_MAGNET')) penalties.push({ flag: 'PRICE_MAGNET', delta: 6 });
  if (input.context.extremeConditions.includes('NEWS_RISK')) penalties.push({ flag: 'NEWS_RISK', delta: 10 });
  if (input.context.extremeConditions.includes('HTF_CONFLICT')) penalties.push({ flag: 'HTF_CONFLICT', delta: 6 });

  const totalPenalty = penalties.reduce((sum, penalty) => sum + penalty.delta, 0);
  if (totalPenalty > 0) {
    gateScore = clamp100(gateScore - totalPenalty);
    reasons.push(`Gate penalties applied: -${totalPenalty} (${penalties.map((p) => p.flag).join(', ')}).`);
  }

  let permission: TimePermission = 'WAIT';
  if (hardBlockers.length > 0) {
    permission = 'BLOCK';
    reasons.push(...hardBlockers);
  } else if (gateScore >= 70 && exec.score >= 65 && setup.score >= 55) {
    permission = 'ALLOW';
    reasons.push('ALLOW: GateScore>=70 with sufficient execution + setup.');
  } else if (gateScore < 45 || setup.score < 45) {
    permission = 'BLOCK';
    reasons.push('BLOCK: GateScore<45 or SetupScore<45.');
  } else {
    permission = 'WAIT';
    reasons.push('WAIT: Structure exists but execution timing is not fully confirmed.');
  }

  const top = (arr: string[]) => arr.slice(0, 3);
  reasons.push(...top(setup.reasons));
  reasons.push(...top(exec.reasons));
  reasons.push(...top(ctx.reasons));

  const gateScorePrePenalty = clamp100(round(0.15 * ctx.score + 0.35 * setup.score + 0.5 * exec.score));

  return {
    contextScore: ctx.score,
    setupScore: setup.score,
    executionScore: exec.score,
    timeConfluenceScore,
    permission,
    gateScore,
    direction,
    reasons: Array.from(new Set(reasons)).slice(0, 12),
    debug: {
      contextBreakdown: ctx.breakdown,
      setupBreakdown: setup.breakdown,
      executionBreakdown: exec.breakdown,
      penalties,
      gateScorePrePenalty,
    },
  };
}
