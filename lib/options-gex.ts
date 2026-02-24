import type { OpenInterestData } from '@/lib/options-confluence-analyzer';

export type DealerGammaRegime = 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';

export interface GexStrikeSnapshot {
  strike: number;
  netGexUsd: number;
  callGexUsd: number;
  putGexUsd: number;
}

export interface DealerGammaSnapshot {
  regime: DealerGammaRegime;
  netGexUsd: number;
  callGexUsd: number;
  putGexUsd: number;
  netDexUsd: number;
  gammaFlipPrice: number | null;
  flipDistancePct: number | null;
  pinZone: 'IN' | 'OUT' | 'UNKNOWN';
  topPositiveStrikes: GexStrikeSnapshot[];
  topNegativeStrikes: GexStrikeSnapshot[];
  basedOnExpiration: string | null;
  coverage: 'partial' | 'none';
}

export interface DealerStructureLevels {
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  topNodes: Array<{ strike: number; netGexUsd: number }>;
}

export interface DealerAttentionTrigger {
  triggered: boolean;
  reason: string | null;
  distanceToFlipPct: number | null;
  distanceToWallPct: number | null;
}

export interface DealerIntelligence {
  volatilityState: 'suppressed' | 'amplified' | 'mixed';
  setupType: 'momentum' | 'mean_reversion' | 'neutral';
  setupScoreMultiplier: number;
  adjustedScore: number;
  dealerStructure: DealerStructureLevels;
  attention: DealerAttentionTrigger;
}

const REGIME_THRESHOLD_USD = 50_000_000;
const PIN_ZONE_PCT = 0.0025; // 0.25%

export function calculateDealerGammaSnapshot(
  openInterestAnalysis: OpenInterestData | null | undefined,
  currentPrice: number
): DealerGammaSnapshot {
  if (!openInterestAnalysis || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      regime: 'NEUTRAL',
      netGexUsd: 0,
      callGexUsd: 0,
      putGexUsd: 0,
      netDexUsd: 0,
      gammaFlipPrice: null,
      flipDistancePct: null,
      pinZone: 'UNKNOWN',
      topPositiveStrikes: [],
      topNegativeStrikes: [],
      basedOnExpiration: openInterestAnalysis?.expirationDate ?? null,
      coverage: 'none',
    };
  }

  const byStrike = new Map<number, { callGexUsd: number; putGexUsd: number }>();
  let netDexUsd = 0;

  for (const contract of openInterestAnalysis.highOIStrikes || []) {
    const strike = Number(contract.strike);
    const openInterest = Number(contract.openInterest);
    const gamma = Math.abs(Number(contract.gamma ?? 0));
    const delta = Number(contract.delta ?? 0);

    if (!Number.isFinite(strike) || !Number.isFinite(openInterest) || strike <= 0 || openInterest <= 0) {
      continue;
    }

    // DEX: Net Delta Exposure in USD
    // Dealers are short calls / long puts → net delta exposure = -call_delta + put_delta (dealer perspective)
    if (Number.isFinite(delta) && delta !== 0) {
      const dexContractUsd = Math.abs(delta) * openInterest * 100 * currentPrice;
      if (contract.type === 'call') {
        netDexUsd -= dexContractUsd;  // Dealer short calls → negative delta
      } else {
        netDexUsd += dexContractUsd;  // Dealer long puts → positive delta (short stock)
      }
    }

    // GEX: skip if gamma missing
    if (!Number.isFinite(gamma) || gamma <= 0) continue;

    const exposure = gamma * openInterest * 100 * currentPrice * currentPrice * 0.01;
    const bucket = byStrike.get(strike) || { callGexUsd: 0, putGexUsd: 0 };

    if (contract.type === 'call') {
      bucket.callGexUsd += exposure;
    } else {
      bucket.putGexUsd -= exposure;
    }

    byStrike.set(strike, bucket);
  }

  const strikeRows: GexStrikeSnapshot[] = [...byStrike.entries()]
    .map(([strike, bucket]) => ({
      strike,
      callGexUsd: bucket.callGexUsd,
      putGexUsd: bucket.putGexUsd,
      netGexUsd: bucket.callGexUsd + bucket.putGexUsd,
    }))
    .sort((a, b) => a.strike - b.strike);

  const callGexUsd = strikeRows.reduce((sum, item) => sum + item.callGexUsd, 0);
  const putGexUsd = strikeRows.reduce((sum, item) => sum + item.putGexUsd, 0);
  const netGexUsd = callGexUsd + putGexUsd;

  let regime: DealerGammaRegime = 'NEUTRAL';
  if (netGexUsd > REGIME_THRESHOLD_USD) regime = 'LONG_GAMMA';
  if (netGexUsd < -REGIME_THRESHOLD_USD) regime = 'SHORT_GAMMA';

  const gammaFlipPrice = estimateGammaFlip(strikeRows, currentPrice);
  const flipDistancePct = gammaFlipPrice && currentPrice > 0
    ? Math.abs(currentPrice - gammaFlipPrice) / currentPrice
    : null;

  const topPositiveStrikes = strikeRows
    .filter((item) => item.netGexUsd > 0)
    .sort((a, b) => b.netGexUsd - a.netGexUsd)
    .slice(0, 3);

  const topNegativeStrikes = strikeRows
    .filter((item) => item.netGexUsd < 0)
    .sort((a, b) => a.netGexUsd - b.netGexUsd)
    .slice(0, 3);

  return {
    regime,
    netGexUsd,
    callGexUsd,
    putGexUsd,
    netDexUsd,
    gammaFlipPrice,
    flipDistancePct,
    pinZone: flipDistancePct == null ? 'UNKNOWN' : (flipDistancePct <= PIN_ZONE_PCT ? 'IN' : 'OUT'),
    topPositiveStrikes,
    topNegativeStrikes,
    basedOnExpiration: openInterestAnalysis.expirationDate,
    coverage: strikeRows.length >= 4 ? 'partial' : 'none',
  };
}

export function buildDealerIntelligence(args: {
  snapshot: DealerGammaSnapshot;
  currentPrice: number;
  baseScore: number;
  setupDescriptor: string;
  direction: 'bullish' | 'bearish' | 'neutral';
}): DealerIntelligence {
  const { snapshot, currentPrice, baseScore, setupDescriptor } = args;

  const setupType = classifySetupType(setupDescriptor);
  const setupScoreMultiplier = getSetupMultiplier(snapshot.regime, setupType);
  const adjustedScore = Math.max(1, Math.min(99, Math.round(baseScore * setupScoreMultiplier)));

  const callWall = snapshot.topPositiveStrikes[0]?.strike ?? null;
  const putWall = snapshot.topNegativeStrikes[0]?.strike ?? null;
  const gammaFlip = snapshot.gammaFlipPrice;
  const topNodes = [...snapshot.topPositiveStrikes, ...snapshot.topNegativeStrikes]
    .sort((a, b) => Math.abs(b.netGexUsd) - Math.abs(a.netGexUsd))
    .slice(0, 3)
    .map((item) => ({ strike: item.strike, netGexUsd: item.netGexUsd }));

  const distanceToFlipPct = gammaFlip && currentPrice > 0
    ? Math.abs(currentPrice - gammaFlip) / currentPrice
    : null;

  const wallDistances = [callWall, putWall]
    .filter((level): level is number => Number.isFinite(level))
    .map((level) => Math.abs(currentPrice - level) / currentPrice);
  const distanceToWallPct = wallDistances.length ? Math.min(...wallDistances) : null;

  let triggerReason: string | null = null;
  if (snapshot.regime === 'SHORT_GAMMA' && distanceToFlipPct != null && distanceToFlipPct <= 0.003) {
    triggerReason = 'Dealer structure inflection zone approaching (near gamma flip).';
  } else if (snapshot.regime === 'SHORT_GAMMA' && distanceToWallPct != null && distanceToWallPct <= 0.005) {
    triggerReason = 'Dealer wall proximity in short-gamma regime.';
  }

  return {
    volatilityState: snapshot.regime === 'LONG_GAMMA' ? 'suppressed' : snapshot.regime === 'SHORT_GAMMA' ? 'amplified' : 'mixed',
    setupType,
    setupScoreMultiplier,
    adjustedScore,
    dealerStructure: {
      callWall,
      putWall,
      gammaFlip,
      topNodes,
    },
    attention: {
      triggered: !!triggerReason,
      reason: triggerReason,
      distanceToFlipPct,
      distanceToWallPct,
    },
  };
}

function estimateGammaFlip(strikes: GexStrikeSnapshot[], currentPrice: number): number | null {
  if (strikes.length < 2) return null;

  const signChangeCandidates: number[] = [];

  for (let index = 0; index < strikes.length - 1; index += 1) {
    const left = strikes[index];
    const right = strikes[index + 1];

    if (left.netGexUsd === 0) signChangeCandidates.push(left.strike);
    if (right.netGexUsd === 0) signChangeCandidates.push(right.strike);

    if (left.netGexUsd === 0 || right.netGexUsd === 0) continue;
    if (Math.sign(left.netGexUsd) === Math.sign(right.netGexUsd)) continue;

    const numerator = -left.netGexUsd;
    const denominator = right.netGexUsd - left.netGexUsd;
    if (!Number.isFinite(denominator) || denominator === 0) continue;

    const t = numerator / denominator;
    const interpolated = left.strike + (right.strike - left.strike) * t;
    if (Number.isFinite(interpolated)) signChangeCandidates.push(interpolated);
  }

  if (signChangeCandidates.length === 0) return null;

  return signChangeCandidates.sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice))[0];
}

function classifySetupType(descriptor: string): 'momentum' | 'mean_reversion' | 'neutral' {
  const text = String(descriptor || '').toLowerCase();
  if (/breakout|momentum|trend|continuation/.test(text)) return 'momentum';
  if (/mean reversion|mean-reversion|fade|range|reversion/.test(text)) return 'mean_reversion';
  return 'neutral';
}

function getSetupMultiplier(
  regime: DealerGammaRegime,
  setupType: 'momentum' | 'mean_reversion' | 'neutral'
): number {
  if (setupType === 'neutral') return 1;
  if (regime === 'LONG_GAMMA') return setupType === 'momentum' ? 0.75 : 1.2;
  if (regime === 'SHORT_GAMMA') return setupType === 'momentum' ? 1.2 : 0.85;
  return 1;
}
