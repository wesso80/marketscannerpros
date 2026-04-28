/**
 * v2 Data Hooks — Wire v2 surfaces to v1 API endpoints
 * 
 * Strategy: Call existing /api/* routes (same origin), transform responses
 * into v2 types. No new backend code needed.
 * 
 * Auth: v1 routes read the `ms_auth` cookie. If the user isn't logged in,
 * most endpoints return 401. We detect that and expose `isAuthError` so the
 * UI can show a friendly "Sign in" prompt instead of raw error text.
 */

/* ------------------------------------------------------------------ */
/*  Auth error class                                                   */
/* ------------------------------------------------------------------ */

export class AuthError extends Error {
  constructor(url: string) {
    super('Sign in required');
    this.name = 'AuthError';
  }
}

/* ------------------------------------------------------------------ */
/*  Generic fetcher                                                    */
/* ------------------------------------------------------------------ */

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',          // ensure cookies are sent
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (res.status === 401 || res.status === 403) throw new AuthError(url);
  if (!res.ok) {
    let detail = '';
    try { const body = await res.json(); detail = body?.error || body?.message || ''; } catch {}
    throw new Error(detail ? `${detail}` : `API ${res.status}: ${url}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Response Types (matching v1 API shapes)                            */
/* ------------------------------------------------------------------ */

// --- Regime ---
export interface RegimeResponse {
  regime: string;
  riskLevel: string;
  permission: string;
  sizing: string;
  signals: Array<{ source: string; regime: string; weight: number; stale: boolean }>;
  updatedAt: string;
}

// --- Quote ---
export interface QuoteResponse {
  ok: boolean;
  price: number;
  symbol: string;
  type: string;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
}

// --- Scanner ---
export interface ScanResult {
  symbol: string;
  score: number;
  direction?: string;
  signals?: { bullish: number; bearish: number; neutral: number };
  scoreQuality?: {
    evidenceLayers: number;
    missingEvidencePenalty: number;
    derivativesEvidenceStatus?: 'available' | 'missing' | 'not_applicable';
    derivativesBoost?: number;
    staleDataPenalty?: number;
    freshnessStatus?: 'fresh' | 'stale' | 'missing';
    liquidityPenalty?: number;
    liquidityStatus?: 'sufficient' | 'thin' | 'missing' | 'not_applicable';
  };
  rankWarnings?: string[];
  rankExplanation?: {
    rank: number;
    scoreGapToLeader: number;
    summary: string;
    strengths: string[];
    penalties: string[];
    warnings: string[];
  };
  timeframe: string;
  type: string;
  price?: number;
  confidence?: number;
  setup?: string;
  entry?: number;
  stop?: number;
  target?: number;
  rMultiple?: number;
  rsi?: number;
  atr?: number;
  adx?: number;
  dveFlags?: string[];
  dveBreakoutScore?: number;
  dveBbwp?: number;
  dveDirectionalBias?: string;
  dveSignalType?: string | null;
  dveContractionContinuation?: number;
  dveExpansionContinuation?: number;
  derivatives?: {
    openInterest: number;
    fundingRate?: number;
    longShortRatio?: number;
  };
  capitalFlow?: any;
  scoreV2?: {
    regime: { label: string; confidence: number };
    regimeScore: { weightedScore: number; tradeBias: string; gated: boolean };
    acl: { confidence: number; reasonCodes: string[] };
  };
}

export interface ScannerResponse {
  success: boolean;
  results: ScanResult[];
  metadata: {
    timestamp: string;
    count: number;
    localDemo?: boolean;
    dataQuality?: {
      source: string;
      computedAt: string | null;
      stale: boolean;
      coverageScore: number | null;
      warnings: string[];
      providerStatus?: {
        source: string;
        provider: string;
        live: boolean;
        simulated: boolean;
        stale: boolean;
        degraded: boolean;
        productionDemoEnabled: boolean;
        alertLevel: 'none' | 'info' | 'warning' | 'critical';
        warnings: string[];
      } | null;
    };
    riskGovernor?: { regime: string; riskMode: string; permission: string } | null;
  };
}

// --- Golden Egg ---
export interface GoldenEggResponse {
  success: boolean;
  data: {
    meta: { symbol: string; assetClass: string; price: number; asOfTs: string; timeframe: string };
    layer1: {
      assessment: string;
      permission: string;
      direction: string;
      confluenceScore: number;
      confidence: number;
      grade: string;
      primaryDriver: string;
      primaryBlocker?: string;
      scoreBreakdown: Array<{ key: string; weight: number; value: number; note?: string }>;
    };
    layer2: {
      setup: {
        setupType: string;
        thesis: string;
        timeframeAlignment: { score: number; max: number; details: string[] };
        keyLevels: Array<{ label: string; price: number; kind: string }>;
        invalidation: string;
      };
      execution: {
        entryTrigger: string;
        entry: { type: string; price?: number };
        stop: { price: number; logic: string };
        targets: Array<{ price: number; rMultiple?: number; note?: string }>;
        rr: { expectedR: number; minR: number };
      };
      scenario: {
        referenceTrigger: string;
        referenceLevel: { type: string; price?: number };
        invalidationLevel: { price: number; logic: string };
        reactionZones: Array<{ price: number; rMultiple?: number; note?: string }>;
        hypotheticalRr: { expectedR: number; minR: number };
        hypotheticalRisk?: { riskPct: number; riskUsd?: number; sizeUnits?: number };
      };
    };
    layer3: {
      structure: {
        verdict: string;
        trend: { htf: string; mtf: string; ltf: string };
        volatility: {
          regime: string;
          bbwp?: number;
          rateOfChange?: number;
          directionalBias?: string;
          directionalConfidence?: number;
          contractionContinuation?: number;
          expansionContinuation?: number;
          signalType?: string;
          breakoutScore?: number;
          trapDetected?: boolean;
          exhaustionRisk?: number;
        };
        liquidity: { overhead?: string; below?: string; note?: string };
      };
      options?: {
        enabled: boolean;
        verdict: string;
        highlights: Array<{ label: string; value: string }>;
        notes?: string[];
      };
      momentum: {
        verdict: string;
        indicators: Array<{ name: string; value: string; state: string }>;
      };
      narrative?: {
        enabled: boolean;
        summary: string;
        bullets: string[];
        risks: string[];
      };
    };
  };
}

// --- News ---
export interface NewsArticle {
  title: string;
  url: string;
  timePublished: string;
  summary: string;
  source: string;
  sentiment: { label: string; score: number };
  tickerSentiments: Array<{ ticker: string; relevance: number; sentimentScore: number; sentimentLabel: string }>;
}

export interface NewsResponse {
  success: boolean;
  articlesCount: number;
  articles: NewsArticle[];
  aiAnalysis: string | null;
}

// --- Economic Calendar ---
export interface EconomicEvent {
  date: string;
  time: string;
  event: string;
  country: string;
  impact: string;
  category: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

export interface EconomicCalendarResponse {
  events: EconomicEvent[];
  count: number;
  nextMajorEvent: EconomicEvent | null;
  daysUntilMajor: number | null;
  dateRange: { from: string; to: string };
}

// --- Market Movers ---
export interface Mover {
  ticker: string;
  price: string;
  change_amount: string;
  change_percentage: string;
  volume: string;
  market_cap: string;
  market_cap_rank: string;
  asset_class?: 'equity' | 'crypto';
}

export interface MarketMoversResponse {
  success: boolean;
  source: string;
  topGainers: Mover[];
  topLosers: Mover[];
  mostActive: Mover[];
}

// --- DVE ---
export interface DVEResponse {
  success: boolean;
  price: number;
  data: {
    symbol: string;
    volatility: {
      bbwp: number;
      regime: string;
      regimeConfidence: number;
      rateOfChange: number;
      inSqueeze: boolean;
      squeezeStrength: number;
    };
    direction: {
      score: number;
      bias: string;
      confidence: number;
      components: Record<string, number>;
    };
    phasePersistence: {
      contraction: { active: boolean; continuationProbability: number; stats: { currentBars: number; agePercentile: number } };
      expansion: { active: boolean; continuationProbability: number; stats: { currentBars: number; agePercentile: number } };
    };
    signal: { type: string; state: string; active: boolean; strength: number; triggerReason: string[] };
    projection: {
      expectedMovePct: number;
      hitRate: number;
      sampleSize: number;
      averageBarsToMove: number;
      dispersionPct?: number;
      projectionQuality?: 'unavailable' | 'low' | 'medium' | 'high';
      projectionQualityScore?: number;
      projectionWarning?: string;
    };
    breakout: { score: number; label: string; components: Record<string, number> };
    trap: { detected: boolean; score: number };
    exhaustion: { level: number; label: string; signals: string[] };
    flags: string[];
    summary: string;
  };
}

// --- Sectors Heatmap ---
export interface SectorData {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  changePercent: number;
  weight: number;
  color: string;
  daily?: number;
  weekly?: number;
  monthly?: number;
}

export interface SectorsResponse {
  sectors: SectorData[];
  timestamp: string;
}

// --- Crypto Market Overview ---
export interface CryptoOverviewResponse {
  success: boolean;
  data: {
    totalMarketCap: number;
    totalMarketCapFormatted: string;
    totalVolume: number;
    totalVolumeFormatted: string;
    marketCapChange24h: number;
    btcDominance: number;
    ethDominance: number;
    dominance: Array<{ symbol: string; dominance: number }>;
    sparkline: Array<{ time: number; value: number }>;
  };
}

// --- Commodities ---
export interface CommodityData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
  category: string;
  history: Array<{ date: string; value: number }>;
}

export interface CommoditiesResponse {
  success: boolean;
  commodities: CommodityData[];
  summary: { gainers: number; losers: number; avgChange: number };
}

// --- Watchlists ---
export interface WatchlistResponse {
  watchlists: Array<{
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string;
    is_default: boolean;
    item_count: number;
    created_at: string;
  }>;
}

export interface WatchlistItemsResponse {
  items: Array<{
    id: string;
    watchlist_id: string;
    symbol: string;
    asset_class: string;
    notes: string | null;
    added_at: string;
  }>;
}

// --- Journal ---
export interface JournalEntry {
  id: number;
  date: string;
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pl: number;
  plPercent: number;
  strategy: string;
  setup: string;
  notes: string;
  outcome: string;
  isOpen: boolean;
  tags: string[];
  rMultiple?: number;
}

export interface JournalResponse {
  entries: JournalEntry[];
}

// --- Earnings ---
export interface EarningsEntry {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: number | null;
  currency: string;
}

export interface EarningsResponse {
  timestamp: string;
  totalUpcoming: number;
  thisWeek: EarningsEntry[];
  nextWeek: EarningsEntry[];
  majorEarnings: EarningsEntry[];
  allUpcoming: EarningsEntry[];
}

// --- Options Scan ---
export interface OptionsScanResponse {
  success: boolean;
  data: {
    currentPrice: number;
    direction: string;
    compositeScore: { confidence: number };
    tradeQuality: string;
    expectedMove: { selectedExpiry: number; selectedExpiryPercent: number };
    ivAnalysis: { ivRank?: number; ivRankHeuristic?: number };
    openInterestAnalysis: { totalCallOI: number; totalPutOI: number; pcRatio: number; highOIStrikes: any[] };
    strategyRecommendation: { strategy: string };
    tradeSnapshot: { oneLine: string };
    unusualActivity: { hasUnusualActivity: boolean };
    locationContext: { keyZones: Array<{ level: number; type: string }> };
    dataQuality?: {
      freshness?: 'REALTIME' | 'DELAYED' | 'EOD' | 'STALE';
      lastUpdated?: string;
      providerStatus?: {
        source: string;
        provider: string;
        live: boolean;
        simulated: boolean;
        stale: boolean;
        degraded: boolean;
        productionDemoEnabled: boolean;
        alertLevel: 'none' | 'info' | 'warning' | 'critical';
        warnings: string[];
      } | null;
      optionsChainQuality?: {
        status: 'sufficient' | 'thin' | 'missing';
        totalContracts: number;
        quotedContracts: number;
        liquidContracts: number;
        avgSpreadPct: number | null;
        warnings: string[];
      };
    };
    universalScoringV21?: {
      topCandidates?: unknown[];
      diagnostics?: {
        optionsProvider?: string;
        warnings?: string[];
        staleSeconds?: number;
        tfConfluenceScore?: number;
        candidateEligibility?: {
          totalCandidates: number;
          allowCandidates: number;
          waitCandidates: number;
          blockedCandidates: number;
          topCandidateBlocked: boolean;
          blockerCounts: Record<string, number>;
          warnings: string[];
        };
      };
    };
  };
  dataSources?: {
    underlyingPrice: string;
    optionsChain: string;
  };
}

/* ------------------------------------------------------------------ */
/*  API Functions                                                      */
/* ------------------------------------------------------------------ */

// --- Regime ---
export function fetchRegime(): Promise<RegimeResponse> {
  return apiFetch('/api/regime');
}

// --- Scanner ---
export type ScanTimeframe = '15m' | '1h' | 'daily' | 'weekly';
export const SCAN_TIMEFRAMES: { value: ScanTimeframe; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function fetchScannerResults(type: 'crypto' | 'equity' = 'equity', timeframe: ScanTimeframe = 'daily', symbols?: string[]): Promise<ScannerResponse> {
  // When no symbols provided, let the backend pull from symbol_universe DB table
  // for full bi-directional coverage instead of hardcoded 10 symbols
  const body: Record<string, unknown> = { timeframe, type };
  if (symbols?.length) body.symbols = symbols;
  return apiFetch('/api/scanner/run', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// --- Golden Egg ---
export function fetchGoldenEgg(symbol: string, timeframe: ScanTimeframe = 'daily', assetType?: string): Promise<GoldenEggResponse> {
  const params = new URLSearchParams({ symbol, timeframe });
  if (assetType) params.set('type', assetType);
  return apiFetch(`/api/golden-egg?${params}`);
}

// --- DVE ---
export function fetchDVE(symbol: string, timeframe: ScanTimeframe = 'daily', assetType?: string): Promise<DVEResponse> {
  const params = new URLSearchParams({ symbol, timeframe });
  if (assetType) params.set('type', assetType);
  return apiFetch(`/api/dve?${params}`);
}

// --- Quote ---
export function fetchQuote(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<QuoteResponse> {
  return apiFetch(`/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`);
}

// --- News ---
export function fetchNews(tickers?: string, limit = 20): Promise<NewsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (tickers) params.set('tickers', tickers);
  return apiFetch(`/api/news-sentiment?${params}`);
}

// --- Economic Calendar ---
export function fetchEconomicCalendar(days = 14): Promise<EconomicCalendarResponse> {
  return apiFetch(`/api/economic-calendar?days=${days}&impact=all`);
}

// --- Market Movers ---
export function fetchMarketMovers(duration = '24h'): Promise<MarketMoversResponse> {
  return apiFetch(`/api/market-movers?duration=${duration}`);
}

// --- Sectors Heatmap ---
export function fetchSectorsHeatmap(): Promise<SectorsResponse> {
  return apiFetch('/api/sectors/heatmap');
}

// --- Crypto Overview ---
export function fetchCryptoOverview(): Promise<CryptoOverviewResponse> {
  return apiFetch('/api/crypto/market-overview');
}

// --- Crypto Categories ---
export interface CryptoCategory {
  id: string;
  name: string;
  marketCap: number;
  change24h: number;
  volume24h: number;
  topCoins: string[];
}
export interface CryptoCategoriesResponse {
  success: boolean;
  highlighted: CryptoCategory[];
  categories: CryptoCategory[];
}
export function fetchCryptoCategories(): Promise<CryptoCategoriesResponse> {
  return apiFetch('/api/crypto/categories');
}

// --- Commodities ---
export function fetchCommodities(): Promise<CommoditiesResponse> {
  return apiFetch('/api/commodities');
}

// --- Watchlists ---
export function fetchWatchlists(): Promise<WatchlistResponse> {
  return apiFetch('/api/watchlists');
}

export function fetchWatchlistItems(watchlistId: string): Promise<WatchlistItemsResponse> {
  return apiFetch(`/api/watchlists/items?watchlistId=${watchlistId}`);
}

// --- Journal ---
export function fetchJournal(): Promise<JournalResponse> {
  return apiFetch('/api/journal');
}

// --- Earnings ---
export function fetchEarningsCalendar(): Promise<EarningsResponse> {
  return apiFetch('/api/earnings?type=calendar');
}

// --- Options Scan ---
export function fetchOptionsScan(symbol: string): Promise<OptionsScanResponse> {
  return apiFetch('/api/options-scan', {
    method: 'POST',
    body: JSON.stringify({ symbol, marketType: 'equity' }),
  });
}

// --- Flow ---
export function fetchFlow(symbol: string, marketType = 'equity'): Promise<{ success: boolean; data: any }> {
  return apiFetch(`/api/flow?symbol=${encodeURIComponent(symbol)}&marketType=${marketType}`);
}

// --- Close Calendar (Confluence Scan) ---
export type CloseCalendarAnchor = 'NOW' | 'TODAY' | 'PRIOR_DAY' | 'EOW' | 'EOM' | 'CUSTOM';
export type CloseCalendarScheduleModel = 'crypto_247' | 'equity_session' | 'forex_session';

export interface ForwardCloseScheduleRow {
  tf: string;
  category: 'intraday' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  weight: number;
  firstCloseAtISO: string | null;
  minsToFirstClose: number | null;
  closesInHorizon: number;
  closesOnAnchorDay: boolean;
}

export interface ForwardCloseCluster {
  label: string;
  tfs: string[];
  weight: number;
  clusterScore: number;
}

export interface ForwardCloseCalendar {
  anchor: CloseCalendarAnchor;
  anchorTimeISO: string;
  horizonDays: number;
  horizonEndISO: string;
  assetClass: 'crypto' | 'equity';
  scheduleModel: CloseCalendarScheduleModel;
  scheduleModelLabel: string;
  scheduleBasis: string;
  timezone: 'UTC' | 'America/New_York';
  sessionMode: 'regular' | 'extended' | 'full';
  warnings: string[];
  totalCloseEventsInHorizon: number;
  schedule: ForwardCloseScheduleRow[];
  closesOnAnchorDay: ForwardCloseScheduleRow[];
  forwardClusters: ForwardCloseCluster[];
}

export function fetchCloseCalendar(
  symbol: string,
  anchor: CloseCalendarAnchor = 'TODAY',
  horizonDays = 1,
  anchorTime?: string,
): Promise<ForwardCloseCalendar> {
  return apiFetch('/api/confluence-scan', {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      mode: 'calendar',
      anchor,
      horizonDays: anchor === 'PRIOR_DAY' ? 1 : horizonDays,
      anchorTime: anchor === 'CUSTOM' && anchorTime ? anchorTime : undefined,
    }),
  }).then((r: any) => r.data as ForwardCloseCalendar);
}

/* ------------------------------------------------------------------ */
/*  React Hooks (SWR-like pattern with useState/useEffect)             */
/* ------------------------------------------------------------------ */

import { useState, useEffect, useCallback } from 'react';

export interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  isAuthError: boolean;
  refetch: () => void;
}

function useApi<T>(fetcher: () => Promise<T>, deps: any[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIsAuthError(false);
    fetcher()
      .then(res => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch(err => {
        if (cancelled) return;
        const isAuth = err instanceof AuthError;
        setIsAuthError(isAuth);
        setError(isAuth ? null : err.message);   // don't show auth as "error"
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, ...deps]);

  return { data, error, loading, isAuthError, refetch };
}

// --- Typed hooks ---

export function useRegime() {
  return useApi(fetchRegime);
}

export function useScannerResults(type: 'crypto' | 'equity' = 'equity', timeframe: ScanTimeframe = 'daily') {
  return useApi(() => fetchScannerResults(type, timeframe), [type, timeframe]);
}

export function useGoldenEgg(symbol: string | null, timeframe: ScanTimeframe = 'daily', assetType?: string) {
  return useApi(() => symbol ? fetchGoldenEgg(symbol, timeframe, assetType) : Promise.resolve(null as any), [symbol, timeframe, assetType]);
}

export function useDVE(symbol: string | null, timeframe: ScanTimeframe = 'daily', assetType?: string) {
  return useApi(() => symbol ? fetchDVE(symbol, timeframe, assetType) : Promise.resolve(null as any), [symbol, timeframe, assetType]);
}

export function useQuote(symbol: string | null, type: 'stock' | 'crypto' = 'stock') {
  return useApi(() => symbol ? fetchQuote(symbol, type) : Promise.resolve(null as any), [symbol, type]);
}

export function useNews(tickers?: string) {
  return useApi(() => fetchNews(tickers), [tickers]);
}

export function useEconomicCalendar() {
  return useApi(fetchEconomicCalendar);
}

export function useMarketMovers() {
  return useApi(fetchMarketMovers);
}

export function useSectorsHeatmap() {
  return useApi(fetchSectorsHeatmap);
}

export function useCryptoOverview() {
  return useApi(fetchCryptoOverview);
}

export function useCryptoCategories() {
  return useApi(fetchCryptoCategories);
}

export function useCommodities() {
  return useApi(fetchCommodities);
}

export function useWatchlists() {
  return useApi(fetchWatchlists);
}

export function useJournal() {
  return useApi(fetchJournal);
}

export function useEarningsCalendar() {
  return useApi(fetchEarningsCalendar);
}

export function useOptionsScan(symbol: string | null) {
  return useApi(() => symbol ? fetchOptionsScan(symbol) : Promise.resolve(null as any), [symbol]);
}

export function useFlow(symbol: string | null, marketType = 'equity') {
  return useApi(() => symbol ? fetchFlow(symbol, marketType) : Promise.resolve(null as any), [symbol, marketType]);
}

export function useCloseCalendar(symbol: string | null, anchor: CloseCalendarAnchor = 'TODAY', horizonDays = 1) {
  return useApi(
    () => symbol ? fetchCloseCalendar(symbol, anchor, horizonDays) : Promise.resolve(null as any),
    [symbol, anchor, horizonDays],
  );
}

// --- Backtest ---

export interface BacktestRequest {
  symbol: string;
  strategy: string;
  startDate: string;
  endDate: string;
  initialCapital?: number;
  timeframe?: string;
  minSignalScore?: number;
}

export interface ScannerBacktestRequest {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital?: number;
  timeframe?: string;
  minScore?: number;
  stopMultiplier?: number;
  targetMultiplier?: number;
  maxHoldBars?: number;
  allowShorts?: boolean;
}

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  exitReason?: string;
  holdingPeriodDays: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades?: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number | null;
  profitFactorLabel?: string;
  avgWin: number;
  avgLoss: number;
  cagr: number;
  volatility: number;
  sortinoRatio: number;
  calmarRatio: number;
  timeInMarket: number;
  bestTrade: BacktestTrade | null;
  worstTrade: BacktestTrade | null;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  dataCoverage?: {
    requested: { startDate: string; endDate: string };
    applied: { startDate: string; endDate: string };
    bars: number;
    provider?: string;
  };
  executionAssumptions?: {
    version: string;
    strategyId: string;
    timeframe: string;
    assetType: 'stock' | 'crypto';
    fillModel: {
      label: string;
      entryTiming: string;
      exitTiming: string;
      intrabarPriority: string;
      intrabarAmbiguity: string;
      endOfDataExit: string;
    };
    costs: {
      slippageBps: number;
      slippageApplied: boolean;
      spreadModel: string;
      commissionModel: string;
      feeModel: string;
      borrowCostsModel: string;
      marketImpactModel: string;
    };
    liquidity: {
      volumeData: string;
      sizeModel: string;
      partialFills: string;
      depthModel: string;
    };
    sampleQuality: {
      label: string;
      totalTrades: number;
      bars: number;
      warning: string;
    };
    warnings: string[];
  };
  diagnostics?: {
    score: number;
    verdict: string;
    failureTags: string[];
    summary: string;
  };
  validation?: {
    status: string;
    direction: string;
    reason: string;
  };
}

export interface SymbolRangeResult {
  resolvedSymbol: string;
  assetType: string;
  coverage: { startDate: string; endDate: string; bars: number };
}

export async function fetchBacktest(req: BacktestRequest): Promise<BacktestResult> {
  const endpoint = req.strategy === 'brain_signal_replay' ? '/api/backtest/brain'
    : req.strategy === 'time_scanner_signal_replay' ? '/api/backtest/time-scanner'
    : '/api/backtest';
  return apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchScannerBacktest(req: ScannerBacktestRequest): Promise<BacktestResult & { scoreSeries?: { date: string; score: number; direction: string }[] }> {
  return apiFetch('/api/backtest/scanner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchSymbolRange(symbol: string): Promise<SymbolRangeResult> {
  return apiFetch(`/api/backtest/symbol-range?symbol=${encodeURIComponent(symbol)}`);
}
