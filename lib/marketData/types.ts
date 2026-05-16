/**
 * marketData/types.ts — shared types for the market-data layer.
 */

export type Freshness = 'real-time' | 'delayed' | 'stale' | 'unknown';
export type CacheLayer = 'redis' | 'postgres' | 'av' | 'miss';

export interface DataEnvelope<T> {
  data: T | null;
  source: string;                 // e.g. 'alpha-vantage:TIME_SERIES_DAILY_ADJUSTED'
  fetchedAt: string;              // ISO timestamp of the underlying fetch
  freshness: Freshness;
  fromCache: CacheLayer;          // which layer answered the call
  missingFields: string[];        // critical fields the source did not provide
  staleAfter: string;             // ISO timestamp; after this the consumer should re-hydrate
  ageSeconds: number;             // computed at return time
  error?: string;                 // populated when data === null and a real error occurred
}

export interface OhlcBar {
  date: string;                   // YYYY-MM-DD for daily, ISO for intraday
  ts: number;                     // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type BarTimeframe = '1min' | '5min' | '15min' | '30min' | '60min' | 'daily' | 'weekly' | 'monthly';

export interface QuoteData {
  symbol: string;
  price: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  latestTradingDay: string | null;
}

export interface OverviewData {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  currency: string | null;
  description: string | null;
  marketCap: number | null;
  peRatio: number | null;
  pegRatio: number | null;
  bookValue: number | null;
  dividendYield: number | null;
  eps: number | null;
  revenueTTM: number | null;
  profitMargin: number | null;
  beta: number | null;
  high52w: number | null;
  low52w: number | null;
  sharesOutstanding: number | null;
  /** Raw OVERVIEW payload for fields we don't yet map. */
  raw: Record<string, unknown>;
}

export interface EarningsRow {
  symbol: string;
  reportDate: string;             // YYYY-MM-DD
  fiscalQuarter: string | null;
  fiscalYear: number | null;
  reportTime: 'BMO' | 'AMC' | 'TNS' | null;
  epsEstimate: number | null;
  epsActual: number | null;
  epsSurprisePercent: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export interface OptionContract {
  symbol: string;
  expiry: string;                 // YYYY-MM-DD
  strike: number;
  type: 'C' | 'P';
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  openInterest: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface IndicatorSnapshot {
  symbol: string;
  timeframe: BarTimeframe;
  rsi14: number | null;
  macd: { line: number | null; signal: number | null; hist: number | null };
  ema: { e9: number | null; e20: number | null; e50: number | null; e200: number | null };
  sma: { s20: number | null; s50: number | null; s200: number | null };
  atr14: number | null;
  adx14: number | null;
  plusDI: number | null;
  minusDI: number | null;
  stoch: { k: number | null; d: number | null };
  bb: { upper: number | null; middle: number | null; lower: number | null };
  obv: number | null;
  vwap: number | null;
  inSqueeze: boolean | null;
  computedAt: string;             // ISO
}

export interface NewsEvent {
  symbol: string;
  source: string;
  url: string;
  title: string;
  summary: string | null;
  sentiment: number | null;
  sentimentLabel: 'bullish' | 'bearish' | 'neutral' | null;
  relevance: number | null;
  topics: string[];
  publishedAt: string;
}
