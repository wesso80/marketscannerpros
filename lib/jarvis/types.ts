/**
 * Private Jarvis — prototype types.
 * Owner-only, read-only, not wired to any route. Every dataset carries provenance.
 */

export type Freshness = 'LIVE' | 'DELAYED' | 'STALE' | 'PARTIAL' | 'PROXY' | 'MISSING' | 'CONFLICT';
export type Environment = 'PRODUCTION_LIVE' | 'PRODUCTION_DB' | 'LOCAL_LIVE' | 'LIB' | 'NONE';

export interface Dataset<T> {
  key: string;
  label: string;
  provider: string;
  environment: Environment;
  observedAt: string | null;
  updatedAt: string | null;
  ageMinutes: number | null;
  freshness: Freshness;
  coverage: string;
  confidence: number;
  critical: boolean;
  warnings: string[];
  data: T | null;
}

export interface RegimeSnapshotRow {
  id: string;
  snapshot_type: 'open' | 'close';
  regime: 'risk_on' | 'neutral' | 'risk_off';
  capital_mode: string;
  volatility_state: string;
  liquidity_state: string;
  adaptive_confidence: number;
  components: Record<string, unknown>;
  created_at: string;
}

export interface MicroRegimeRow {
  asset_class: string;
  micro_state: string;
  breadthPercent: number | null;
  avgAbsMove: number | null;
  symbolCount: number | null;
  computed_at: string;
}

export interface QuoteRow {
  symbol: string;
  asset_type: string | null;
  price: number;
  change_percent: number;
  volume: number;
  latest_trading_day: string | null;
  fetched_at: string;
}

export interface IndicatorRow {
  symbol: string;
  rsi14: number | null;
  adx14: number | null;
  macd_hist: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  atr14: number | null;
  natr14: number | null;
  roc12: number | null;
  in_squeeze: boolean | null;
  computed_at: string;
}

export interface BreadthAggregate {
  assetClass: 'equity' | 'crypto';
  total: number;
  advancing: number;
  declining: number;
  breadthPct: number;
  avgAbsChange: number;
}

export interface SectorPerf {
  name: string;
  etf: string;
  realtime: number;
  d1: number;
  d5: number;
  m1: number;
  m3: number;
  ytd: number | null;
  /** Persistence rank: lower = stronger across 5d/1m/3m. */
  persistenceRank: number;
}

export interface CrcsRow {
  symbol: string;
  asset_class: 'equity' | 'crypto' | string;
  cluster: string;
  global_eligibility: 'eligible' | 'conditional' | 'blocked' | string;
  confluence_score: number;
  rar_score: number;
  crcs_final: number;
  computed_at: string;
}

export interface CryptoSnapshot {
  totalMarketCapUsd: number | null;
  marketCapChange24hPct: number | null;
  btcDominance: number | null;
  ethDominance: number | null;
  top100: Array<{ symbol: string; change24h: number | null; change7d: number | null; marketCap: number | null; volume24h: number | null }>;
  breadth24hPct: number | null;
  breadth7dPct: number | null;
  medianAlt24h: number | null;
  btc24h: number | null;
  eth24h: number | null;
  funding: Record<string, { fundingRatePct: number; annualised: number; exchangeCount: number; sentiment: string } | null>;
  openInterest: Record<string, { totalOI: number; exchangeCount: number } | null>;
  categories: Array<{ name: string; change24h: number | null; marketCap: number | null }>;
}

export interface DerivativesDbRow {
  symbol: string;
  funding_rate_pct: number;
  total_oi: number;
  sentiment: string;
  captured_at: string;
}

export interface MacroSeriesPoint {
  key: string;
  value: number;
  observedOn: string;
  /** Value ~20 observations earlier (same cadence), for direction. */
  prior: number | null;
  priorObservedOn: string | null;
  source: string;
}

export interface IntelligenceBundle {
  fragility: Record<string, any> | null;
  liquidity: Record<string, any> | null;
  globalM2: Record<string, any> | null;
}

export type StateLabel = 'STRENGTHENING' | 'STABLE' | 'DETERIORATING' | 'CONFLICTED' | 'INSUFFICIENT_DATA';

export interface Assessment<L extends string> {
  label: L;
  evidence: string[];
  conflicts: string[];
  provenance: string[];
  confidence: number;
}

export type MacroRegimeLabel = 'RISK_ON' | 'RISK_OFF' | 'TRANSITION' | 'RANGE' | 'MIXED' | 'INSUFFICIENT_DATA';
export type ConfirmationLabel = 'CONFIRMED' | 'PARTIAL_CONFIRMATION' | 'DIVERGENCE' | 'CONFLICTED' | 'INSUFFICIENT_DATA';
export type LiquidityLabel = 'STRONGLY_IMPROVING' | 'IMPROVING' | 'NEUTRAL' | 'DETERIORATING' | 'STRONGLY_DETERIORATING' | 'INSUFFICIENT_DATA';
export type FragilityLabel = 'FALLING' | 'STABLE' | 'RISING' | 'ELEVATED' | 'INSUFFICIENT_DATA';
export type BreadthLabel = 'BROADENING' | 'HEALTHY' | 'NARROWING' | 'WEAK' | 'CONFLICTED' | 'INSUFFICIENT_DATA';
export type ResearchStatus = 'HIGH_PRIORITY' | 'IMPROVING' | 'WATCH' | 'DETERIORATING' | 'AVOID_LOW_QUALITY';
export type ConfidenceLabel = 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT_DATA';

export interface ResearchCandidate {
  symbol: string;
  assetClass: string;
  rank: number;
  composite: number;
  percentile: number;
  bias: 'constructive' | 'deteriorating' | 'neutral';
  confidence: number;
  whyInteresting: string[];
  confirmingEvidence: string[];
  conflictingEvidence: string[];
  confirmationLevel: string | null;
  invalidationLevel: string | null;
  catalysts: string[];
  eventRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  liquidityState: string;
  dataQuality: Freshness;
  researchStatus: ResearchStatus;
}

export interface CatalystItem {
  event: string;
  country: string;
  timeUtc: string;
  timeLocal: string;
  importance: string;
  assetsMostExposed: string[];
  whyItMatters: string;
  currentMarketSensitivity: string;
  timingStatus: string;
  sourceAuthority: string;
}

export interface WhatChanged {
  basis: string;
  NEW_STRENGTH: string[];
  NEW_WEAKNESS: string[];
  REGIME_CHANGES: string[];
  BREADTH_CHANGES: string[];
  LIQUIDITY_CHANGES: string[];
  FRAGILITY_CHANGES: string[];
  SCANNER_ROTATION: string[];
  SECTOR_ROTATION: string[];
  CRYPTO_ROTATION: string[];
  CATALYST_CHANGES: string[];
}

export interface JarvisBrief {
  generatedAt: string;
  environmentNote: string;
  confidence: { label: ConfidenceLabel; score: number; methodology: string[] };
  criticalCoverage: { covered: number; total: number; pct: number; sufficient: boolean; missing: string[]; stale: string[] };
  datasets: Array<Omit<Dataset<unknown>, 'data'>>;
  marketState: {
    regime: Assessment<MacroRegimeLabel>;
    crossAsset: Assessment<ConfirmationLabel> & { pairs: Array<{ pair: string; reading: string }> };
    liquidity: Assessment<LiquidityLabel>;
    fragility: Assessment<FragilityLabel> & { score: number | null; components: Array<{ label: string; value: number; semantic: string }> };
    breadth: Assessment<BreadthLabel>;
    volatility: string;
    usd: string;
    rates: string;
    crypto: string;
  };
  drivers: Array<{ rank: number; driver: string; evidence: string }>;
  leadership: {
    strongestSectors: SectorPerf[];
    weakestSectors: SectorPerf[];
    assetClasses: Array<{ asset: string; change: number | null; note: string }>;
    strongestCryptoGroups: Array<{ name: string; change24h: number | null }>;
    weakestCryptoGroups: Array<{ name: string; change24h: number | null }>;
  };
  crypto: Record<string, string>;
  candidates: ResearchCandidate[];
  deteriorating: string[];
  catalysts: { next24Hours: CatalystItem[]; next72Hours: CatalystItem[]; next7Days: CatalystItem[] };
  whatChanged: WhatChanged;
  cases: { bull: string[]; bear: string[]; base: string[]; whatWouldChangeTheView: { strengthenIf: string[]; weakenIf: string[] } };
  dataHealth: { stale: string[]; missing: string[]; proxies: string[]; conflicts: string[]; warnings: string[] };
  executiveSummary: string[];
}
