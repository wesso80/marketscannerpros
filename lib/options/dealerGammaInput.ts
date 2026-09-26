/**
 * MV-3: the signed dealer-gamma input for Capital Pressure, built from the options chain the Capital Pressure run has
 * ALREADY fetched (the confluence analyzer's openInterestAnalysis.gexStrikes), so no extra Alpha Vantage calls.
 * Uses the same GEX estimate as /api/options/gex and the Intraday Charts overlay (lib/options-gex.ts): dealers long
 * calls, short puts. Alpha Vantage has no dealer positions, so this is always an estimate, and it says so.
 */
import {
  DEALER_GAMMA_CONVENTION,
  MIN_GEX_STRIKES,
  calculateDealerGammaFromContracts,
  countGexStrikes,
  type DealerGammaRegime,
  type GexContractInput,
} from '@/lib/options-gex';
import { isEodDataCurrent } from '@/lib/equityDataHealth';

export type DealerGammaInput =
  | {
      state: 'available';
      regime: DealerGammaRegime;
      netGexUsd: number;
      gammaFlip: number | null;
      /** Strike with the largest positive net GEX (same definition as the GEX overlay). */
      callWall: number | null;
      /** Strike with the largest negative net GEX. */
      putWall: number | null;
      expiration: string | null;
      strikesUsed: number;
      /** Chain data date (YYYY-MM-DD) when known. */
      asOf: string | null;
      /** REALTIME_OPTIONS chain vs the previous session's HISTORICAL_OPTIONS chain. */
      source: 'realtime' | 'previous_session';
      /** Greeks from the provider, or Black-Scholes estimates where the provider sent none. */
      greeks: 'api' | 'model';
      convention: string;
    }
  | { state: 'unavailable'; reason: string };

export interface AnalysisForDealerGamma {
  currentPrice?: number | null;
  openInterestAnalysis?: {
    expirationDate?: string | null;
    gexStrikes?: Array<{ strike: number; openInterest: number; type: 'call' | 'put'; delta?: number; gamma?: number }>;
  } | null;
  dataQuality?: { freshness?: string | null; lastUpdated?: string | null; greeksModel?: string | null } | null;
}

const YMD = /^\d{4}-\d{2}-\d{2}/;

export const CRYPTO_DEALER_GAMMA_REASON =
  'no crypto options chain is connected; funding and open interest do not identify dealer gamma';

export function dealerGammaFromAnalysis(analysis: AnalysisForDealerGamma | null | undefined, nowMs: number = Date.now()): DealerGammaInput {
  const unavailable = (reason: string): DealerGammaInput => ({ state: 'unavailable', reason });
  if (!analysis) return unavailable('options analysis unavailable');
  const spot = Number(analysis.currentPrice);
  if (!(spot > 0)) return unavailable('underlying price unavailable');
  const oi = analysis.openInterestAnalysis;
  if (!oi) return unavailable('no usable options chain for this symbol');

  const freshness = String(analysis.dataQuality?.freshness ?? '').toUpperCase();
  const lastUpdated = analysis.dataQuality?.lastUpdated ?? null;
  const asOf = lastUpdated && YMD.test(lastUpdated) ? lastUpdated.slice(0, 10) : null;
  let source: 'realtime' | 'previous_session';
  if (freshness === 'REALTIME') source = 'realtime';
  else if (freshness === 'EOD') {
    if (!isEodDataCurrent(asOf, nowMs)) return unavailable(`options chain is from ${asOf ?? 'an unknown date'}, older than the previous session`);
    source = 'previous_session';
  } else return unavailable(`options chain freshness is ${freshness || 'unknown'} (no dated chain)`);

  const contracts: GexContractInput[] = (oi.gexStrikes ?? []).filter((c) =>
    Number(c.strike) > 0 && Number(c.openInterest) > 0 && Math.abs(Number(c.gamma)) > 0 && (c.type === 'call' || c.type === 'put'));
  const expiration = oi.expirationDate ?? null;
  const strikesUsed = countGexStrikes(contracts);
  if (strikesUsed < MIN_GEX_STRIKES) {
    return unavailable(`only ${strikesUsed} strike${strikesUsed === 1 ? '' : 's'} with open interest and gamma${expiration ? ` in the ${expiration} expiry` : ''} (need ${MIN_GEX_STRIKES})`);
  }

  const snap = calculateDealerGammaFromContracts(contracts, spot, expiration);
  if (snap.coverage === 'none') return unavailable('not enough gamma coverage to estimate dealer gamma');
  return {
    state: 'available',
    regime: snap.regime,
    netGexUsd: Math.round(snap.netGexUsd),
    gammaFlip: snap.gammaFlipPrice != null ? Number(snap.gammaFlipPrice.toFixed(2)) : null,
    callWall: snap.topPositiveStrikes[0]?.strike ?? null,
    putWall: snap.topNegativeStrikes[0]?.strike ?? null,
    expiration,
    strikesUsed,
    asOf,
    source,
    greeks: analysis.dataQuality?.greeksModel === 'api' ? 'api' : 'model',
    convention: DEALER_GAMMA_CONVENTION,
  };
}

export interface GammaInputView {
  status: 'available' | 'unavailable';
  reason: string | null;
  net_gex_usd: number | null;
  gamma_flip: number | null;
  call_wall: number | null;
  put_wall: number | null;
  expiration: string | null;
  as_of: string | null;
  source: 'realtime' | 'previous_session' | null;
  greeks: 'api' | 'model' | null;
}

const usdShort = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${a.toFixed(0)}`;
  return v < 0 ? `−${s}` : `+${s}`;
};

/** One line under the Capital Pressure "Gamma" tile: the estimate, its levels, as-of and source — or why it is missing. */
export function describeGammaInput(gi: GammaInputView | null | undefined): string {
  if (!gi) return 'Unavailable (no gamma input in this response)';
  if (gi.status !== 'available' || gi.net_gex_usd == null) return `Unavailable (${gi.reason ?? 'no signed gamma source'})`;
  const lvl = (v: number | null) => (v == null ? 'n/a' : String(v));
  const src = gi.source === 'realtime' ? 'realtime chain' : 'previous-session chain';
  return [
    `Net dealer GEX ${usdShort(gi.net_gex_usd)} (estimate)`,
    `flip ${lvl(gi.gamma_flip)}`,
    `call wall ${lvl(gi.call_wall)} / put wall ${lvl(gi.put_wall)}`,
    `${src}${gi.as_of ? ` ${gi.as_of}` : ''}${gi.expiration ? `, ${gi.expiration} expiry` : ''}${gi.greeks === 'model' ? ', model greeks' : ''}`,
  ].join(' · ');
}
