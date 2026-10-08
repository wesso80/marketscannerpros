import type { OptionsSetup } from '@/lib/options-confluence-analyzer';
import type { OptionsChainQuality } from '@/lib/options/dataQuality';
import { measuredIvRank } from '@/lib/options/ivRank';
import { oiBasisLabel } from '@/lib/options/oiSummary';

/**
 * Public Options evidence contract (W3; product decision 8 Oct: "rebuild the Options setup scanner as evidence").
 * /api/options-scan returns only measured chain evidence for one expiry, built leaf by leaf from the analyzer output.
 *
 * Not public (they stay on the server; the state machine still reads its inputs):
 *   - the analyzer's setup: direction, trade quality / options grade and their reasons, composite score, signal
 *     strength, strike and expiry recommendations, research candidates, Greeks advice, max risk %, stop / target
 *     strategy, entry timing, trade levels, strategy recommendation, trade snapshot, AI market state, institutional
 *     intent, professional trade stack, decompression stack, location context, time-confluence stack;
 *   - the institutional filter, scored candidates (universalScoringV21), the canonical verdict;
 *   - the capital-flow engine output (bias, conviction, brain decision, risk governor, trade permission, paths);
 *   - the workspace's adaptive profile and match;
 *   - put/call "sentiment", IV "buy / sell premium" signal and per-strike bullish/bearish tags (a chain has no
 *     buy/sell side); unusual-activity alert levels.
 */
export const PUBLIC_OPTIONS_EVIDENCE_CONTRACT = 'public-options-evidence-v1' as const;

export interface PublicOptionsEvidence {
  contract: typeof PUBLIC_OPTIONS_EVIDENCE_CONTRACT;
  symbol: string;
  underlying: { price: number | null; asOf: string | null };
  chain: {
    source: string; freshness: string; expiry: string | null; daysToExpiry: number | null;
    contracts: { calls: number; puts: number }; strikesListed: number; hasMeaningfulOi: boolean;
    greeks: 'provider' | 'model (Black-Scholes, European)' | 'not available'; lastUpdated: string | null;
    quality: { status: OptionsChainQuality['status']; quotedContracts: number; liquidContracts: number; avgSpreadPct: number | null; warnings: string[] } | null;
  };
  openInterest: {
    calls: number; puts: number; putCall: number | null; putCallBasis: string;
    maxPain: { strike: number | null; reliable: boolean; strikesUsed: number; note: string };
    largestStrikes: Array<{ strike: number; type: 'call' | 'put'; openInterest: number; volume: number; iv: number | null }>;
  } | null;
  impliedVolatility: { atmIvPct: number | null; ivRank: number | null; ivRankNote: string } | null;
  expectedMove: { pct: number | null; usd: number | null; daysToExpiry: number | null; calculation: string; note: string } | null;
  volumeVsOpenInterest: {
    strikes: Array<{ strike: number; type: 'call' | 'put'; volume: number; openInterest: number; volumeOiRatio: number }>;
    tilt: 'calls' | 'puts' | 'mixed' | 'none' | null; note: string;
  } | null;
  warnings: string[];
  missing: string[];
}

const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function toPublicOptionsEvidence(a: OptionsSetup, extras: { chainQuality: OptionsChainQuality | null; providerWarnings: string[] }): PublicOptionsEvidence {
  const dq = a.dataQuality, oi = a.openInterestAnalysis, iv = a.ivAnalysis, em = a.expectedMove, ua = a.unusualActivity;
  const missing: string[] = [];
  const expiry = dq?.chainExpiryUsed ?? oi?.expirationDate ?? null;
  if (!expiry) missing.push('Options expiry: no usable chain was loaded');
  if (!oi) missing.push('Open interest: not available for this expiry');
  if (iv?.currentIV == null) missing.push('ATM implied volatility: not available');
  if (fin(em?.selectedExpiryPercent) == null) missing.push('Expected move: not available for this expiry');
  const q = extras.chainQuality;
  return {
    contract: PUBLIC_OPTIONS_EVIDENCE_CONTRACT,
    symbol: a.symbol,
    underlying: { price: fin(a.currentPrice), asOf: dq?.underlyingAsOf ?? null },
    chain: {
      source: dq?.optionsChainSource ?? 'none', freshness: dq?.freshness ?? 'STALE', expiry, daysToExpiry: fin(em?.selectedExpiryDTE),
      contracts: { calls: dq?.contractsCount?.calls ?? 0, puts: dq?.contractsCount?.puts ?? 0 },
      strikesListed: Array.isArray(dq?.availableStrikes) ? dq.availableStrikes.length : 0,
      hasMeaningfulOi: !!dq?.hasMeaningfulOI,
      greeks: dq?.hasGreeksFromAPI ? 'provider' : dq?.greeksModel === 'black_scholes_european' ? 'model (Black-Scholes, European)' : 'not available',
      lastUpdated: dq?.lastUpdated ?? null,
      quality: q ? { status: q.status, quotedContracts: q.quotedContracts, liquidContracts: q.liquidContracts, avgSpreadPct: q.avgSpreadPct, warnings: strs(q.warnings) } : null,
    },
    openInterest: oi ? {
      calls: oi.totalCallOI, puts: oi.totalPutOI,
      putCall: oi.basis ? oi.basis.inRange.putCall : fin(oi.pcRatio),
      putCallBasis: oi.basis ? oiBasisLabel(oi.basis) : 'strikes within ±30% of spot',
      maxPain: {
        strike: fin(oi.maxPainStrike), reliable: !!oi.maxPainReliability?.reliable, strikesUsed: oi.maxPainReliability?.strikesUsed ?? 0,
        note: 'The strike where in-range option holders would collect the least at expiry. A calculation from open interest, not a price forecast.',
      },
      largestStrikes: (oi.highOIStrikes ?? []).slice(0, 12).map((s) => ({ strike: s.strike, type: s.type, openInterest: s.openInterest, volume: s.volume, iv: fin(s.iv) })),
    } : null,
    impliedVolatility: iv ? {
      atmIvPct: fin(iv.currentIV) != null ? Math.round(iv.currentIV * 1000) / 10 : null,
      ivRank: measuredIvRank(iv),
      ivRankNote: measuredIvRank(iv) == null ? 'IV rank needs a history of implied volatility, which is not collected.' : 'Where today\'s IV sits within its past year.',
    } : null,
    expectedMove: em ? {
      pct: fin(em.selectedExpiryPercent), usd: fin(em.selectedExpiry), daysToExpiry: fin(em.selectedExpiryDTE), calculation: em.calculation ?? '',
      note: 'An estimate from implied volatility (about one standard deviation to expiry), not a realised move or a promised range.',
    } : null,
    volumeVsOpenInterest: ua ? {
      strikes: (ua.unusualStrikes ?? []).slice(0, 10).map((s) => ({ strike: s.strike, type: s.type, volume: s.volume, openInterest: s.openInterest, volumeOiRatio: s.volumeOIRatio })),
      tilt: ua.volumeTilt ?? null,
      note: 'Strikes where today\'s volume is high against open interest. The chain shows no buy or sell side, so this is not a direction.',
    } : null,
    warnings: strs(extras.providerWarnings),
    missing,
  };
}
