/**
 * Crypto network / market-structure context built ONLY from data already available (CoinGecko coin detail + the
 * canonical daily series of the symbol, BTC and ETH). No corporate-style fundamentals are invented.
 */

export interface CoinDetailLike {
  market_cap_rank?: number | null;
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    fully_diluted_valuation?: { usd?: number };
    total_volume?: { usd?: number };
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
    ath?: { usd?: number };
    ath_change_percentage?: { usd?: number };
    ath_date?: { usd?: string };
    atl?: { usd?: number };
    price_change_percentage_7d?: number;
    price_change_percentage_30d?: number;
  };
  categories?: string[];
  links?: { homepage?: string[] };
  genesis_date?: string | null;
}

export interface RelativeStrength { benchmark: 'BTC' | 'ETH'; ratio: number; symbolPct: number; benchmarkPct: number; window: string; label: 'outperforming' | 'in line' | 'underperforming' }

export interface NetworkContext {
  marketCap: number | null;
  marketCapRank: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  totalSupply: number | null;
  /** FDV from provider, else circulating-price × max supply when max supply is known. */
  fdv: number | null;
  fdvBasis: 'provider' | 'derived_max_supply' | 'unavailable';
  /** Share of max supply already circulating (0–1); null when uncapped. */
  supplyIssuedPct: number | null;
  spotVolume24h: number | null;
  volumeToMcap: number | null;
  ath: number | null;
  athDate: string | null;
  distanceFromAthPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  categories: string[];
  relative: RelativeStrength[];
  notes: string[];
}

function pctReturn(closes: number[], bars: number): number | null {
  if (closes.length < bars + 1) return null;
  const a = closes[closes.length - 1 - bars];
  const b = closes[closes.length - 1];
  if (!(a > 0) || !(b > 0)) return null;
  return ((b - a) / a) * 100;
}

export function relativeStrength(symbolCloses: number[], benchCloses: number[], benchmark: 'BTC' | 'ETH', bars = 20, interval = '1d'): RelativeStrength | null {
  const s = pctReturn(symbolCloses, bars);
  const b = pctReturn(benchCloses, bars);
  if (s == null || b == null) return null;
  const ratio = (1 + s / 100) / (1 + b / 100);
  const label: RelativeStrength['label'] = ratio >= 1.03 ? 'outperforming' : ratio <= 0.97 ? 'underperforming' : 'in line';
  return { benchmark, ratio: Math.round(ratio * 1000) / 1000, symbolPct: Math.round(s * 10) / 10, benchmarkPct: Math.round(b * 10) / 10, window: `${bars} ${interval} bars`, label };
}

export function buildNetworkContext(detail: CoinDetailLike | null | undefined, series: { symbolCloses: number[]; btcCloses?: number[]; ethCloses?: number[]; interval?: string; isBtc?: boolean; isEth?: boolean }): NetworkContext {
  const md = detail?.market_data;
  const notes: string[] = [];
  const marketCap = md?.market_cap?.usd ?? null;
  const price = md?.current_price?.usd ?? null;
  const circ = md?.circulating_supply ?? null;
  const max = md?.max_supply ?? null;
  const total = md?.total_supply ?? null;
  let fdv = md?.fully_diluted_valuation?.usd ?? null;
  let fdvBasis: NetworkContext['fdvBasis'] = fdv != null ? 'provider' : 'unavailable';
  if (fdv == null && price != null && max != null && max > 0) { fdv = price * max; fdvBasis = 'derived_max_supply'; }
  if (fdv == null) notes.push('FDV unavailable — no max supply reported (uncapped or unknown issuance).');
  const supplyIssuedPct = circ != null && max != null && max > 0 ? Math.min(1, circ / max) : null;
  if (supplyIssuedPct != null && supplyIssuedPct < 0.6) notes.push(`Only ${(supplyIssuedPct * 100).toFixed(0)}% of max supply is circulating — future issuance/unlock overhang.`);
  const vol = md?.total_volume?.usd ?? null;
  const volumeToMcap = vol != null && marketCap ? vol / marketCap : null;
  if (volumeToMcap != null && volumeToMcap > 0.5) notes.push(`24h spot turnover is ${(volumeToMcap * 100).toFixed(0)}% of market cap — very high churn.`);
  if (volumeToMcap != null && volumeToMcap < 0.01) notes.push(`24h spot turnover is ${(volumeToMcap * 100).toFixed(1)}% of market cap — thin.`);
  const ath = md?.ath?.usd ?? null;
  const distanceFromAthPct = md?.ath_change_percentage?.usd ?? (ath != null && price != null && ath > 0 ? ((price - ath) / ath) * 100 : null);

  const relative: RelativeStrength[] = [];
  const interval = series.interval ?? '1d';
  if (!series.isBtc && series.btcCloses?.length) { const r = relativeStrength(series.symbolCloses, series.btcCloses, 'BTC', 20, interval); if (r) relative.push(r); }
  if (!series.isEth && !series.isBtc && series.ethCloses?.length) { const r = relativeStrength(series.symbolCloses, series.ethCloses, 'ETH', 20, interval); if (r) relative.push(r); }

  return {
    marketCap, marketCapRank: detail?.market_cap_rank ?? null,
    circulatingSupply: circ, maxSupply: max, totalSupply: total,
    fdv, fdvBasis, supplyIssuedPct,
    spotVolume24h: vol, volumeToMcap,
    ath, athDate: md?.ath_date?.usd ?? null, distanceFromAthPct: distanceFromAthPct != null ? Math.round(distanceFromAthPct * 10) / 10 : null,
    change7dPct: md?.price_change_percentage_7d ?? null, change30dPct: md?.price_change_percentage_30d ?? null,
    categories: (detail?.categories ?? []).filter(Boolean).slice(0, 4),
    relative, notes,
  };
}
