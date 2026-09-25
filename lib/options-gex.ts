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
  evidenceQualityDegraded: boolean;
  evidenceQualityNote?: string;
  dealerStructure: DealerStructureLevels;
  attention: DealerAttentionTrigger;
}

const REGIME_THRESHOLD_USD = 50_000_000;
const PIN_ZONE_PCT = 0.0025; // 0.25%

/**
 * Alpha Vantage has no dealer positions, so every GEX/DEX number here is an ESTIMATE under the
 * standard public convention: customers sell calls and buy puts, i.e. dealers are LONG calls and
 * SHORT puts. Gamma and delta use the same assumption so the two never contradict each other.
 */
export const DEALER_GAMMA_CONVENTION =
  'Estimate from open interest under the standard convention (dealers long calls, short puts). Alpha Vantage has no dealer positions, so this is not verified dealer positioning.';

export interface GexContractInput {
  strike: number;
  openInterest: number;
  type: 'call' | 'put';
  gamma?: number;
  delta?: number;
}

export function calculateDealerGammaSnapshot(
  openInterestAnalysis: OpenInterestData | null | undefined,
  currentPrice: number
): DealerGammaSnapshot {
  // Prefer every strike of the analysed expiry (gexStrikes); older payloads only carry the ~10 top-OI strikes.
  const contracts = openInterestAnalysis
    ? (openInterestAnalysis.gexStrikes?.length ? openInterestAnalysis.gexStrikes : openInterestAnalysis.highOIStrikes || [])
    : null;
  return calculateDealerGammaFromContracts(contracts, currentPrice, openInterestAnalysis?.expirationDate ?? null);
}

export function calculateDealerGammaFromContracts(
  contracts: GexContractInput[] | null | undefined,
  currentPrice: number,
  expirationDate: string | null,
): DealerGammaSnapshot {
  if (!contracts || !Number.isFinite(currentPrice) || currentPrice <= 0) {
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
      basedOnExpiration: expirationDate,
      coverage: 'none',
    };
  }

  const byStrike = new Map<number, { callGexUsd: number; putGexUsd: number }>();
  let netDexUsd = 0;

  for (const contract of contracts) {
    const strike = Number(contract.strike);
    const openInterest = Number(contract.openInterest);
    const gamma = Math.abs(Number(contract.gamma ?? 0));
    const delta = Number(contract.delta ?? 0);

    if (!Number.isFinite(strike) || !Number.isFinite(openInterest) || strike <= 0 || openInterest <= 0) {
      continue;
    }

    // DEX (dealer delta, USD) under the SAME convention as GEX below: dealers long calls, short puts.
    // Long call: +|call delta|. Short put: −(put delta) = −(−|put delta|) = +|put delta|.
    if (Number.isFinite(delta) && delta !== 0) {
      const contractDelta = contract.type === 'call' ? Math.abs(delta) : -Math.abs(delta);
      const dealerSide = contract.type === 'call' ? 1 : -1;
      netDexUsd += dealerSide * contractDelta * openInterest * 100 * currentPrice;
    }

    // GEX: skip if gamma missing
    if (!Number.isFinite(gamma) || gamma <= 0) continue;

    const exposure = gamma * openInterest * 100 * currentPrice * currentPrice * 0.01;
    const bucket = byStrike.get(strike) || { callGexUsd: 0, putGexUsd: 0 };

    if (contract.type === 'call') {
      bucket.callGexUsd += exposure;   // dealers long calls → long gamma
    } else {
      bucket.putGexUsd -= exposure;    // dealers short puts → short gamma
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
    basedOnExpiration: expirationDate,
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

  // When options data is missing (coverage:'none'), the Evidence Quality is degraded.
  // Per options-data-rules: missing data must reduce Evidence Quality Score, not fabricate a proxy.
  const noCoverageMultiplier = snapshot.coverage === 'none' ? 0.5 : 1.0;
  const adjustedScore = Math.max(1, Math.min(99, Math.round(baseScore * setupScoreMultiplier * noCoverageMultiplier)));

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
    evidenceQualityDegraded: snapshot.coverage === 'none',
    evidenceQualityNote: snapshot.coverage === 'none' ? 'Options data unavailable for this symbol — GEX metrics are absent and score has been reduced.' : undefined,
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

// ── GEX estimate straight from a raw Alpha Vantage chain (used by /api/options/gex) ─────────────

export interface RawChainRowForGex {
  expiration?: string;
  strike?: string | number;
  type?: string;
  open_interest?: string | number;
  gamma?: string | number;
  delta?: string | number;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenYmd(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/**
 * The expiry the estimate is built on: the requested one if the chain has it, otherwise the listed
 * expiry (today or later) closest to this week's Friday — the same default the Options Scanner uses.
 */
export function pickGexExpiry(rows: RawChainRowForGex[], todayYmd: string, requested?: string | null): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const exp = String(row.expiration || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || exp < todayYmd) continue;
    counts.set(exp, (counts.get(exp) || 0) + 1);
  }
  if (requested && counts.has(requested)) return requested;
  if (!counts.size) return null;
  const dow = new Date(`${todayYmd}T12:00:00Z`).getUTCDay();
  const friday = addDaysYmd(todayYmd, dow === 6 ? 6 : (5 - dow + 7) % 7);
  let best: string | null = null;
  for (const [exp, n] of counts) {
    if (best === null) { best = exp; continue; }
    const d = Math.abs(daysBetweenYmd(friday, exp));
    const bd = Math.abs(daysBetweenYmd(friday, best));
    if (d < bd || (d === bd && n > (counts.get(best) || 0))) best = exp;
  }
  return best;
}

/** Contracts of one expiry with open interest and a usable gamma. Every strike is kept. */
export function gexContractsForExpiry(rows: RawChainRowForGex[], expiration: string): GexContractInput[] {
  const out: GexContractInput[] = [];
  for (const row of rows) {
    if (String(row.expiration || '') !== expiration) continue;
    const type = String(row.type || '').toLowerCase();
    if (type !== 'call' && type !== 'put') continue;
    const strike = Number(row.strike);
    const openInterest = Number(row.open_interest);
    const gamma = Number(row.gamma);
    const delta = Number(row.delta);
    if (!(strike > 0) || !(openInterest > 0) || !(Math.abs(gamma) > 0)) continue;
    out.push({ strike, openInterest, type, gamma: Math.abs(gamma), delta: Number.isFinite(delta) ? delta : undefined });
  }
  return out;
}

/** Minimum strikes (with OI and gamma) before an estimate is shown instead of "unavailable". */
export const MIN_GEX_STRIKES = 4;

export function countGexStrikes(contracts: GexContractInput[]): number {
  return new Set(contracts.map((c) => c.strike)).size;
}
