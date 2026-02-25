/* ─── Crypto Derivatives Terminal — shared types ────────────────── */

/** A single perpetual contract row from one exchange */
export interface DerivativeRow {
  market: string;          // "Binance (Futures)"
  symbol: string;          // "BTCUSDT"
  indexId: string;         // "BTC"
  price: number;
  priceChange24h: number;  // percent
  index: number;           // underlying spot price
  basis: number;           // premium/discount
  spread: number;          // bid-ask
  fundingRate: number;     // raw decimal e.g. 0.0001
  fundingPct: number;      // as percent e.g. 0.01
  openInterest: number;    // USD
  volume24h: number;       // USD
  lastTradedAt: number;    // unix seconds
}

/** Coin-level overview (spot + meta) */
export interface CoinOverview {
  id: string;              // CoinGecko id e.g. "bitcoin"
  symbol: string;          // "BTC"
  name: string;
  price: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  rank: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  circulatingSupply: number;
  totalSupply: number;
  ath: number;
  athDate: string;
  athDistance: number;      // percent from ATH (negative)
  sparkline7d: number[];   // 168-point price array
}

/** Aggregated funding across exchanges for one coin */
export interface AggregatedFunding {
  symbol: string;
  avgFundingRate: number;
  fundingRatePct: number;
  annualised: number;
  exchangeCount: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  min: number;    // lowest funding pct across exchanges
  max: number;    // highest funding pct across exchanges
}

/** Aggregated open interest for one coin */
export interface AggregatedOI {
  symbol: string;
  totalOI: number;
  totalVolume24h: number;
  exchangeCount: number;
}

/** Funding heatmap row — one coin × one exchange */
export interface FundingHeatmapCell {
  symbol: string;
  exchange: string;
  fundingPct: number;      // colour-keyed
  oi: number;
}

/** OI vs Price divergence signal */
export interface OIDivergence {
  symbol: string;
  oiChange: 'rising' | 'falling' | 'flat';
  priceChange: 'rising' | 'falling' | 'flat';
  signal: string;          // e.g. "Rising OI + flat price → breakout setup"
  severity: 'high' | 'medium' | 'low';
}

/** Generated positioning signal */
export interface DerivedSignal {
  symbol: string;
  type: 'funding' | 'oi' | 'basis' | 'divergence';
  label: string;
  detail: string;
  severity: 'bullish' | 'bearish' | 'neutral';
}

/** Full API response from /api/crypto-derivatives */
export interface CryptoDerivativesResponse {
  coin: CoinOverview;
  rows: DerivativeRow[];
  aggregatedFunding: AggregatedFunding;
  aggregatedOI: AggregatedOI;
  fetchedAt: string;
}

/** Top-coins summary for the funding heatmap */
export interface TopCoinsDerivativesResponse {
  coins: {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    exchanges: DerivativeRow[];
    aggregatedFunding: AggregatedFunding;
    aggregatedOI: AggregatedOI;
  }[];
  fetchedAt: string;
}
