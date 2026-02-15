export interface ProbabilityMatrixEngineInput {
  pTrend: number;
  pPin: number;
  pExpansion: number;
  conviction: number;
  expectedMove: number;
}

export interface ProbabilityMatrixEngineOutput {
  pUp: number;
  pDown: number;
  expectedMove: number;
  confidence: number;
  bestPlaybook: string;
  score: number;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function computeProbabilityMatrixEngine(input: ProbabilityMatrixEngineInput): ProbabilityMatrixEngineOutput {
  const pUp = clamp((input.pTrend * 0.7) + (input.pExpansion * 0.3), 0, 100);
  const pDown = clamp(100 - pUp, 0, 100);
  const confidence = clamp((Math.max(input.pTrend, input.pPin, input.pExpansion) * 0.65) + (input.conviction * 0.35), 0, 100);

  const bestPlaybook = input.pTrend >= input.pPin && input.pTrend >= input.pExpansion
    ? 'Trend continuation with pullback confirmation'
    : input.pPin >= input.pTrend && input.pPin >= input.pExpansion
      ? 'Mean-reversion around pin / VWAP'
      : 'Breakout expansion with retest confirmation';

  return {
    pUp: Number(pUp.toFixed(1)),
    pDown: Number(pDown.toFixed(1)),
    expectedMove: Number(input.expectedMove.toFixed(2)),
    confidence: Number(confidence.toFixed(1)),
    bestPlaybook,
    score: Number(confidence.toFixed(1)),
  };
}
