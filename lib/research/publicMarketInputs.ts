/**
 * Public Market Inputs contract (/api/market-pressure).
 *
 * The Market Pressure Engine (lib/marketPressureEngine) turns these inputs into per-dimension scores, weights, a
 * 0-100 composite, a LONG/SHORT direction, an alignment percentage and a pressure label. None of that is published;
 * the engine is unchanged and still used internally (admin quant discovery, Symbol packet). The public reading is
 * the measured inputs themselves, each with its source and time, and an explicit "not collected" (with the reason)
 * instead of a default value.
 */

export const PUBLIC_MARKET_INPUTS_CONTRACT = 'public-market-inputs-v1';

export interface Measured<T> { value: T | null; note?: string }
export interface InputSection<T> { available: boolean; source: string; asOf: string | null; values: T; missing: string[] }

export interface PublicMarketInputs {
  contract: typeof PUBLIC_MARKET_INPUTS_CONTRACT;
  symbol: string;
  assetClass: 'crypto' | 'equity';
  observedAt: string;
  volatility: InputSection<{ adx14: number | null; atrPercent14: number | null; inSqueeze: boolean | null; squeezeDefinition: string }>;
  derivatives: InputSection<{ openInterestUsd: number | null; exchanges: number | null; fundingRatePercent: number | null }> | null;
  options: InputSection<{
    putCallRatio: number | null;
    maxPainStrike: number | null;
    maxPainReliable: boolean | null;
    ivRank: number | null;
    strikesWithHighVolumeVsOpenInterest: number | null;
    estimatedNetGammaUsd: number | null;
    estimatedGammaFlipPrice: number | null;
    gammaEstimateBasis: string;
    expiry: string | null;
  }> | null;
  note: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export const SQUEEZE_DEFINITION = 'Squeeze = daily Bollinger Bands (20, 2) entirely inside Keltner Channels (EMA 20 ± 1.5 × ATR 20).';
export const GAMMA_ESTIMATE_BASIS = 'Estimate from open interest and Greeks for one expiry, assuming dealers hold the opposite side of customer positions. Not observed dealer positioning.';
export const FUNDING_NOT_COLLECTED = 'Funding rate not collected: the feed does not supply funding intervals, so cross-venue rates cannot be compared.';

export function volatilitySection(ind: { adx14?: number; atrPercent14?: number; inSqueeze?: boolean; computedAt?: string; source?: string } | null): PublicMarketInputs['volatility'] {
  const values = { adx14: num(ind?.adx14), atrPercent14: num(ind?.atrPercent14), inSqueeze: typeof ind?.inSqueeze === 'boolean' ? ind.inSqueeze : null, squeezeDefinition: SQUEEZE_DEFINITION };
  const missing = [values.adx14 == null && 'ADX (14)', values.atrPercent14 == null && 'ATR % (14)', values.inSqueeze == null && 'Squeeze state'].filter(Boolean) as string[];
  return { available: !!ind && missing.length < 3, source: 'Alpha Vantage daily indicators', asOf: iso(ind?.computedAt), values, missing: ind ? missing : ['Daily indicators not collected for this symbol'] };
}

export function derivativesSection(
  oi: { totalOpenInterest?: number; exchanges?: number } | null,
  funding: { fundingRatePercent?: number; fundingRateMissing?: boolean } | null,
  observedAt: string,
): NonNullable<PublicMarketInputs['derivatives']> {
  const values = { openInterestUsd: num(oi?.totalOpenInterest), exchanges: num(oi?.exchanges), fundingRatePercent: funding && !funding.fundingRateMissing ? num(funding.fundingRatePercent) : null };
  const missing = [values.openInterestUsd == null && 'Open interest not collected for this coin', values.fundingRatePercent == null && FUNDING_NOT_COLLECTED].filter(Boolean) as string[];
  return { available: values.openInterestUsd != null || values.fundingRatePercent != null, source: 'CoinGecko derivatives (spot data cannot supply these)', asOf: values.openInterestUsd != null ? observedAt : null, values, missing };
}

export function optionsSection(a: any | null, gamma: { netGexUsd?: number; gammaFlipPrice?: number | null; basedOnExpiration?: string | null; coverage?: string } | null): NonNullable<PublicMarketInputs['options']> {
  const oi = a?.openInterestAnalysis;
  const ua = a?.unusualActivity;
  const values = {
    putCallRatio: num(oi?.pcRatio),
    maxPainStrike: num(oi?.maxPainStrike),
    maxPainReliable: typeof oi?.maxPainReliability?.reliable === 'boolean' ? oi.maxPainReliability.reliable : null,
    ivRank: num(a?.ivAnalysis?.ivRank),
    strikesWithHighVolumeVsOpenInterest: Array.isArray(ua?.unusualStrikes) ? ua.unusualStrikes.length : null,
    estimatedNetGammaUsd: gamma && gamma.coverage !== 'none' ? num(gamma.netGexUsd) : null,
    estimatedGammaFlipPrice: gamma && gamma.coverage !== 'none' ? num(gamma.gammaFlipPrice) : null,
    gammaEstimateBasis: GAMMA_ESTIMATE_BASIS,
    expiry: typeof oi?.expirationDate === 'string' ? oi.expirationDate : (typeof gamma?.basedOnExpiration === 'string' ? gamma.basedOnExpiration : null),
  };
  const labels: Record<string, string> = { putCallRatio: 'Put/call ratio', maxPainStrike: 'Max pain', ivRank: 'IV rank', strikesWithHighVolumeVsOpenInterest: 'Volume vs open interest', estimatedNetGammaUsd: 'Gamma estimate' };
  const missing = a ? Object.entries(labels).filter(([k]) => (values as any)[k] == null).map(([, l]) => l) : ['Options chain not collected for this symbol'];
  const source = typeof a?.dataQuality?.optionsChainSource === 'string' ? `${a.dataQuality.optionsChainSource} options chain` : 'Options chain';
  return { available: !!a && missing.length < Object.keys(labels).length, source, asOf: iso(a?.dataQuality?.lastUpdated), values, missing };
}

export const MARKET_INPUTS_NOTE = 'Measured inputs only, each with its source and time. They are not combined into a score, direction or pressure label.';
