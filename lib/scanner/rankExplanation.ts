export interface ScannerRankExplanationInput {
  rank: number;
  symbol: string;
  score: number;
  topScore: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  scoreQuality?: {
    evidenceLayers?: number;
    missingEvidencePenalty?: number;
    staleDataPenalty?: number;
    liquidityPenalty?: number;
    freshnessStatus?: string;
    liquidityStatus?: string;
  };
  rankWarnings?: string[];
  dveFlags?: string[];
}

export interface ScannerRankExplanation {
  rank: number;
  scoreGapToLeader: number;
  summary: string;
  strengths: string[];
  penalties: string[];
  warnings: string[];
}

function directionLabel(direction?: 'bullish' | 'bearish' | 'neutral') {
  if (direction === 'bullish') return 'bullish evidence';
  if (direction === 'bearish') return 'bearish evidence';
  return 'mixed or neutral evidence';
}

export function buildScannerRankExplanation(input: ScannerRankExplanationInput): ScannerRankExplanation {
  const quality = input.scoreQuality ?? {};
  const evidenceLayers = Number(quality.evidenceLayers ?? 0);
  const strengths: string[] = [];
  const penalties: string[] = [];

  if (evidenceLayers >= 7) strengths.push(`${evidenceLayers} independent evidence layers contributed`);
  else if (evidenceLayers >= 5) strengths.push(`${evidenceLayers} evidence layers contributed`);
  else penalties.push(`only ${evidenceLayers} evidence layer${evidenceLayers === 1 ? '' : 's'} contributed`);

  if (input.dveFlags?.length) strengths.push(`DVE flags: ${input.dveFlags.slice(0, 4).join(', ')}`);

  if ((quality.missingEvidencePenalty ?? 0) > 0) penalties.push(`missing evidence penalty ${quality.missingEvidencePenalty}`);
  if ((quality.staleDataPenalty ?? 0) > 0) penalties.push(`stale data penalty ${quality.staleDataPenalty}`);
  if ((quality.liquidityPenalty ?? 0) > 0) penalties.push(`liquidity penalty ${quality.liquidityPenalty}`);

  const scoreGapToLeader = Math.max(0, Math.round((input.topScore - input.score) * 10) / 10);
  const gapText = input.rank === 1
    ? 'ranked first by current confluence score'
    : `${scoreGapToLeader} points behind the current leader`;
  const summary = `${input.symbol} is ${gapText} with ${directionLabel(input.direction)}; rank is reduced when evidence is missing, stale, or liquidity is thin.`;

  return {
    rank: input.rank,
    scoreGapToLeader,
    summary,
    strengths,
    penalties,
    warnings: input.rankWarnings ?? [],
  };
}
