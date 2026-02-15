/**
 * Options Confluence Analyzer
 * 
 * Integrates Time Confluence system with options trading:
 * 1. Uses confluence stack to determine trade quality
 * 2. Uses 50% levels to suggest strike prices
 * 3. Uses decompression timing to suggest expiration
 * 4. Calculates theoretical Greeks impact
 * 5. Analyzes Open Interest for sentiment/liquidity
 */

import { HierarchicalScanResult, ConfluenceLearningAgent, ScanMode, CandleCloseConfluence } from './confluence-learning-agent';
import { scanPatterns, Candle as PatternCandle } from './patterns/pattern-engine';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER UTILITIES (Production-grade parsing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safely get a numeric value from an object with multiple possible field names
 * Handles vendor-specific field name variations
 */
function getNumericField(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const val = obj?.[key];
    if (val !== null && val !== undefined) {
      const num = typeof val === 'number' ? val : parseFloat(String(val));
      if (!isNaN(num)) return num;
    }
  }
  return fallback;
}

function getIntField(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  const value = getNumericField(obj, keys, fallback);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function getOptionalNumericField(obj: Record<string, unknown>, keys: string[]): number | undefined {
  const value = getNumericField(obj, keys, Number.NaN);
  return Number.isFinite(value) ? value : undefined;
}

function aggregatePatternCandles(candles: PatternCandle[], factor: number): PatternCandle[] {
  if (!candles.length || factor <= 1) return candles;
  const sorted = [...candles].sort((a, b) => a.ts - b.ts);
  const aggregated: PatternCandle[] = [];

  for (let i = 0; i < sorted.length; i += factor) {
    const bucket = sorted.slice(i, i + factor);
    if (!bucket.length) continue;
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    aggregated.push({
      ts: first.ts,
      open: first.open,
      high: Math.max(...bucket.map(c => c.high)),
      low: Math.min(...bucket.map(c => c.low)),
      close: last.close,
      volume: bucket.reduce((sum, c) => sum + (Number(c.volume) || 0), 0),
    });
  }

  return aggregated;
}

function parseAvTimeSeriesToPatternCandles(series: Record<string, any> | undefined): PatternCandle[] {
  if (!series || typeof series !== 'object') return [];
  return Object.entries(series)
    .map(([timestamp, values]) => ({
      ts: Date.parse(timestamp),
      open: Number(values?.['1. open']),
      high: Number(values?.['2. high']),
      low: Number(values?.['3. low']),
      close: Number(values?.['4. close']),
      volume: Number(values?.['5. volume'] ?? 0),
    }))
    .filter(c => Number.isFinite(c.ts) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
    .sort((a, b) => a.ts - b.ts);
}

async function fetchPatternCandlesFallback(
  symbol: string,
  assetType: AssetType
): Promise<{ '1H': PatternCandle[]; '4H': PatternCandle[]; '1D': PatternCandle[] }> {
  if (!ALPHA_VANTAGE_KEY) {
    return { '1H': [], '4H': [], '1D': [] };
  }

  const base = 'https://www.alphavantage.co/query';

  try {
    let intradayUrl = '';
    if (assetType === 'crypto') {
      intradayUrl = `${base}?function=CRYPTO_INTRADAY&symbol=${encodeURIComponent(symbol)}&market=USD&interval=60min&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;
    } else if (assetType === 'forex' && symbol.length >= 6) {
      const from = symbol.slice(0, 3);
      const to = symbol.slice(3, 6);
      intradayUrl = `${base}?function=FX_INTRADAY&from_symbol=${encodeURIComponent(from)}&to_symbol=${encodeURIComponent(to)}&interval=60min&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;
    } else {
      intradayUrl = `${base}?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=60min&outputsize=compact&entitlement=delayed&apikey=${ALPHA_VANTAGE_KEY}`;
    }

    const intradayRes = await fetch(intradayUrl);
    const intradayData = await intradayRes.json();
    const intradaySeries = intradayData['Time Series (60min)'] || intradayData['Time Series FX (60min)'] || intradayData['Time Series Crypto (60min)'];
    const oneHour = parseAvTimeSeriesToPatternCandles(intradaySeries);
    const fourHour = aggregatePatternCandles(oneHour, 4);

    let dailyUrl = '';
    if (assetType === 'crypto') {
      dailyUrl = `${base}?function=DIGITAL_CURRENCY_DAILY&symbol=${encodeURIComponent(symbol)}&market=USD&apikey=${ALPHA_VANTAGE_KEY}`;
    } else if (assetType === 'forex' && symbol.length >= 6) {
      const from = symbol.slice(0, 3);
      const to = symbol.slice(3, 6);
      dailyUrl = `${base}?function=FX_DAILY&from_symbol=${encodeURIComponent(from)}&to_symbol=${encodeURIComponent(to)}&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;
    } else {
      dailyUrl = `${base}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=delayed&apikey=${ALPHA_VANTAGE_KEY}`;
    }

    const dailyRes = await fetch(dailyUrl);
    const dailyData = await dailyRes.json();
    const dailySeries = dailyData['Time Series (Daily)'] || dailyData['Time Series FX (Daily)'] || dailyData['Time Series (Digital Currency Daily)'];

    const oneDay = dailySeries === dailyData['Time Series (Digital Currency Daily)']
      ? Object.entries(dailySeries || {})
          .map(([timestamp, values]: [string, any]) => ({
            ts: Date.parse(timestamp),
            open: Number(values?.['1a. open (USD)'] ?? values?.['1. open']),
            high: Number(values?.['2a. high (USD)'] ?? values?.['2. high']),
            low: Number(values?.['3a. low (USD)'] ?? values?.['3. low']),
            close: Number(values?.['4a. close (USD)'] ?? values?.['4. close']),
            volume: Number(values?.['5. volume'] ?? 0),
          }))
          .filter(c => Number.isFinite(c.ts) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
          .sort((a, b) => a.ts - b.ts)
      : parseAvTimeSeriesToPatternCandles(dailySeries);

    return { '1H': oneHour, '4H': fourHour, '1D': oneDay };
  } catch (error) {
    console.warn('[patterns] Fallback candle fetch failed:', error);
    return { '1H': [], '4H': [], '1D': [] };
  }
}

function getNYTimeParts(date: Date = new Date()): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value || '0');
  return { hour: get('hour'), minute: get('minute') };
}

function getNYDateParts(date: Date = new Date()): { year: number; month: number; day: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get('year') || '1970'),
    month: Number(get('month') || '1'),
    day: Number(get('day') || '1'),
    dayOfWeek: weekdayMap[get('weekday')] ?? 1,
  };
}

function formatNYDate(date: Date = new Date()): string {
  const { year, month, day } = getNYDateParts(date);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function parseYMDToUTCNoon(ymd: string): Date {
  const [yearStr, monthStr, dayStr] = ymd.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function addDaysToYMD(ymd: string, days: number): string {
  const date = parseYMDToUTCNoon(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateDiffDaysYMD(fromYmd: string, toYmd: string): number {
  const from = parseYMDToUTCNoon(fromYmd);
  const to = parseYMDToUTCNoon(toYmd);
  const diffMs = to.getTime() - from.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function calculateMarketDTE(
  fromDate: Date,
  toDate: Date,
  assetType: AssetType
): number {
  const millisPerDay = 1000 * 60 * 60 * 24;
  if (toDate.getTime() <= fromDate.getTime()) return 1;

  if (assetType === 'crypto' || assetType === 'forex') {
    return Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / millisPerDay));
  }

  const cursor = new Date(fromDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  let tradingDays = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      tradingDays += 1;
    }
  }

  return Math.max(1, tradingDays);
}

/**
 * Normalize IV from API (handles both decimal 0.25 and percent 25 formats)
 */
function normalizeIV(rawIV: number | string | undefined, fallback = 0.25): number {
  if (rawIV === null || rawIV === undefined) return fallback;
  const parsed = typeof rawIV === 'number' ? rawIV : parseFloat(String(rawIV));
  if (isNaN(parsed) || parsed <= 0) return fallback;
  // If > 3, assume it's in percent format (e.g., 25 instead of 0.25)
  return parsed > 3 ? parsed / 100 : parsed;
}

/**
 * Asset type for proper handling (don't infer from symbol string)
 */
export type AssetType = 'equity' | 'crypto' | 'index' | 'etf' | 'forex';

// ═══════════════════════════════════════════════════════════════════════════
// EARNINGS CALENDAR CHECK (for disclaimer flags)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if symbol has earnings within N days
 * Returns the earnings date if found, null otherwise
 */
async function checkUpcomingEarnings(symbol: string, daysAhead: number = 7): Promise<{
  hasEarnings: boolean;
  earningsDate?: string;
  daysUntil?: number;
} | null> {
  try {
    // Use internal API to check earnings calendar
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/earnings?type=calendar`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    
    if (!response.ok) {
      console.warn(`Earnings calendar fetch failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const upperSymbol = symbol.toUpperCase();
    const now = new Date();
    const todayNY = formatNYDate(now);
    const cutoffNY = addDaysToYMD(todayNY, daysAhead);
    
    // Look for symbol in earnings list
    const earnings = data.earnings || data.upcoming || [];
    for (const event of earnings) {
      if (event.symbol?.toUpperCase() === upperSymbol || event.ticker?.toUpperCase() === upperSymbol) {
        const eventRawDate = String(event.reportDate || event.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(eventRawDate)) continue;
        if (eventRawDate >= todayNY && eventRawDate <= cutoffNY) {
          const daysUntil = Math.max(0, dateDiffDaysYMD(todayNY, eventRawDate));
          return {
            hasEarnings: true,
            earningsDate: eventRawDate,
            daysUntil,
          };
        }
      }
    }
    
    return { hasEarnings: false };
  } catch (error) {
    console.warn('Earnings check failed:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OptionsGreeks {
  delta: number;        // Price sensitivity (-1 to 1)
  gamma: number;        // Delta rate of change
  theta: number;        // Time decay per day (negative for long options)
  vega: number;         // IV sensitivity
  rho: number;          // Interest rate sensitivity
}

export interface StrikeRecommendation {
  strike: number;
  type: 'call' | 'put';
  reason: string;
  distanceFromPrice: number;    // % OTM or ITM
  moneyness: 'ITM' | 'ATM' | 'OTM';
  estimatedDelta: number;
  confidenceScore: number;      // 0-100 based on confluence alignment
  targetLevel: number;          // 50% level this strike targets
}

export interface ExpirationRecommendation {
  dte: number;                  // Days to expiration
  calendarDte: number;          // Calendar days to expiration (0DTE/1DTE semantics)
  expirationDate: string;       // YYYY-MM-DD
  reason: string;
  thetaRisk: 'low' | 'moderate' | 'high';
  timeframe: 'scalping' | 'intraday' | 'swing' | 'position';
  confidenceScore: number;
}

export type EdgeVerdict = 'BULLISH_EDGE' | 'BEARISH_EDGE' | 'WAIT';

export interface LocationContext {
  regime: 'TREND' | 'RANGE' | 'REVERSAL' | 'UNKNOWN';
  keyZones: Array<{
    type: 'demand' | 'supply' | 'liquidity_high' | 'liquidity_low' | 'support' | 'resistance';
    level: number;
    strength: 'strong' | 'moderate' | 'weak';
    reason: string;
  }>;
  patterns: Array<{
    name: string;
    bias: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reason: string;
  }>;
  reflection: {
    nearest: number | null;
    reason: string;
  };
}

export interface TradeSnapshot {
  verdict: EdgeVerdict;
  setupGrade: 'A+' | 'A' | 'B' | 'C' | 'F';
  oneLine: string;
  why: string[];
  risk: {
    invalidationLevel: number | null;
    invalidationReason: string;
  };
  action: {
    entryTrigger: string;
    entryZone?: { low: number; high: number };
    targets?: { price: number; reason: string }[];
  };
  timing: {
    urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
    catalyst: string;
  };
}

export interface OptionsSetup {
  symbol: string;
  currentPrice: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  assetType: AssetType;      // Explicit asset type (not inferred from symbol)
  
  // Confluence data
  confluenceStack: number;
  decompressingTFs: string[];
  pullBias: number;
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  
  // Trade quality assessment
  tradeQuality: 'A+' | 'A' | 'B' | 'C' | 'F';
  qualityReasons: string[];
  
  // OPTIONS COMPOSITE QUALITY (separate from confluence grade)
  optionsQualityScore: number;  // 0-100 from composite scoring
  optionsGrade: 'A+' | 'A' | 'B' | 'C' | 'F';  // Derived from optionsQualityScore
  
  // Recommended strikes
  primaryStrike: StrikeRecommendation | null;
  alternativeStrikes: StrikeRecommendation[];
  
  // Recommended expiration
  primaryExpiration: ExpirationRecommendation | null;
  alternativeExpirations: ExpirationRecommendation[];
  
  // Open Interest analysis
  openInterestAnalysis: OpenInterestData | null;
  
  // Greeks considerations
  greeksAdvice: GreeksAdvice;
  
  // Risk management
  maxRiskPercent: number;       // Suggested max position size
  stopLossStrategy: string;
  profitTargetStrategy: string;
  
  // Entry timing
  entryTiming: EntryTimingAdvice;
  
  // PRO TRADER FEATURES
  ivAnalysis: IVAnalysis | null;
  unusualActivity: UnusualActivity | null;
  expectedMove: ExpectedMove | null;
  tradeLevels: TradeLevels | null;
  
  // COMPOSITE SCORING (NEW)
  compositeScore: CompositeScore;
  strategyRecommendation: StrategyRecommendation | null;
  
  // CANDLE CLOSE CONFLUENCE (NEW) - When multiple TFs close together
  candleCloseConfluence: CandleCloseConfluence | null;
  
  // INSTITUTIONAL AI MARKET STATE (HEDGE FUND MODEL)
  aiMarketState: AIMarketState | null;

  // PROFESSIONAL DECISION STACK (trader-native presentation)
  professionalTradeStack: ProfessionalTradeStack | null;

  // 3-second brain view (always present)
  tradeSnapshot: TradeSnapshot;

  // Location layer (zones/patterns)
  locationContext: LocationContext | null;
  
  // DATA QUALITY TRACKING (Production critical)
  dataQuality: DataQuality;
  
  // EXECUTION NOTES (Production warnings)
  executionNotes: string[];
  
  // CONFIDENCE CAPS (Why confidence was limited)
  dataConfidenceCaps: string[];
  
  // DISCLAIMER FLAGS (Risk events)
  disclaimerFlags: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA QUALITY TRACKING (Production critical)
// ═══════════════════════════════════════════════════════════════════════════

export interface DataQuality {
  optionsChainSource: 'alpha_vantage' | 'nasdaq_fmv' | 'cboe' | 'none';
  freshness: 'REALTIME' | 'DELAYED' | 'EOD' | 'STALE';
  hasGreeksFromAPI: boolean;
  greeksModel?: 'api' | 'black_scholes_european';
  hasMeaningfulOI: boolean;
  contractsCount: { calls: number; puts: number };
  availableStrikes: number[];  // Actual strikes from chain
  chainExpiryUsed: string | null;
  underlyingAsOf: string;
  lastUpdated: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIGHTWEIGHT OI SUMMARY (for composite scoring)
// ═══════════════════════════════════════════════════════════════════════════

export interface OISummary {
  pcRatio: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE SCORING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export interface SignalComponent {
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  weight: number;           // 0-1 how much this factor contributes
  score: number;           // -100 to +100 (negative=bearish, positive=bullish)
  reason: string;
}

export interface CompositeScore {
  finalDirection: 'bullish' | 'bearish' | 'neutral';
  directionScore: number;   // -100 to +100
  confidence: number;       // 0-100% based on signal alignment
  qualityScore: number;     // 0-100 from quality track (now exposed)
  components: SignalComponent[];
  conflicts: string[];      // List of conflicting signals
  alignedCount: number;     // How many signals agree
  alignedWeightPct: number; // Strength-weighted agreement percent
  totalSignals: number;
}

export interface StrategyRecommendation {
  strategy: string;         // e.g., "Bull Put Spread", "Long Call", etc.
  strategyType: 'buy_premium' | 'sell_premium' | 'neutral';
  reason: string;
  strikes?: {
    long?: number;
    short?: number;
  };
  riskProfile: 'defined' | 'undefined';
  maxRisk: string;
  maxReward: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTITUTIONAL AI MARKET STATE (HEDGE FUND MODEL)
// ═══════════════════════════════════════════════════════════════════════════

export type MarketRegimeType = 'TREND' | 'RANGE' | 'EXPANSION' | 'REVERSAL';

export interface MarketRegime {
  regime: MarketRegimeType;
  confidence: number;           // 0-100%
  reason: string;
  characteristics: string[];    // What makes this regime
}

export interface EdgeAnalysis {
  directionEdge: {
    strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    score: number;              // 0-100
    bias: 'bullish' | 'bearish' | 'neutral';
    factors: string[];
  };
  volatilityEdge: {
    strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    score: number;              // 0-100
    signal: 'SELL_VOL' | 'BUY_VOL' | 'NEUTRAL';
    factors: string[];
  };
  timeEdge: {
    strength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    score: number;              // 0-100
    factors: string[];
  };
}

export interface TradeThesis {
  primaryEdge: string;          // "Volatility decay" or "Directional momentum"
  thesis: string;               // Full thesis explanation
  keyFactors: string[];         // Bullet points
  notEdge: string;              // What this trade is NOT about
}

export interface ScenarioMap {
  baseCase: {
    description: string;
    outcome: string;
    probability: number;
  };
  bullCase: {
    trigger: string;
    outcome: string;
    adjustment: string;
  };
  bearCase: {
    trigger: string;
    outcome: string;
    adjustment: string;
  };
}

export interface AIMarketState {
  regime: MarketRegime;
  edges: EdgeAnalysis;
  thesis: TradeThesis;
  scenarios: ScenarioMap;
  strategyMatchScore: number;   // 0-100% how well strategy fits regime
  tradeQualityGate: 'HIGH' | 'MODERATE' | 'LOW' | 'WAIT';
}

export interface ProfessionalStackLayer {
  label: string;
  state: string;
  score: number;
  status: 'ready' | 'caution' | 'waiting';
  reason: string;
}

export interface ProfessionalTradeStack {
  structureState: ProfessionalStackLayer;
  liquidityContext: ProfessionalStackLayer;
  timeEdge: ProfessionalStackLayer;
  optionsEdge: ProfessionalStackLayer;
  executionPlan: ProfessionalStackLayer;
  overallEdgeScore: number;
  overallState: 'A+' | 'A' | 'B' | 'C' | 'WAIT';
}

export interface OpenInterestData {
  totalCallOI: number;
  totalPutOI: number;
  pcRatio: number;              // Put/Call ratio
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentReason: string;
  maxPainStrike: number | null;
  maxPainReliability: {
    score: number;
    strikesUsed: number;
    nonZeroCoverage: number;
    totalOI: number;
    reliable: boolean;
  };
  highOIStrikes: { strike: number; openInterest: number; type: 'call' | 'put'; delta?: number; gamma?: number; theta?: number; vega?: number; iv?: number }[];
  expirationDate: string;       // The expiration date being analyzed
}

export interface GreeksAdvice {
  deltaTarget: string;          // e.g., "0.50-0.70 for directional"
  thetaWarning: string | null;
  vegaConsideration: string | null;
  gammaAdvice: string | null;
  overallAdvice: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface IVAnalysis {
  currentIV: number;              // Current implied volatility (avg across ATM options)
  ivRank: number;                 // 0-100: Where is IV vs last 52 weeks
  ivRankHeuristic: number;        // Alias to make explicit this is heuristic (no historical series)
  ivPercentile: number;           // 0-100: % of days IV was lower
  ivSignal: 'sell_premium' | 'buy_premium' | 'neutral';
  ivReason: string;
}

export interface UnusualActivity {
  hasUnusualActivity: boolean;
  unusualStrikes: {
    strike: number;
    type: 'call' | 'put';
    volume: number;
    openInterest: number;
    volumeOIRatio: number;        // Volume / OI ratio
    signal: 'bullish' | 'bearish';
    reason: string;
  }[];
  smartMoneyDirection: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  alertLevel: 'high' | 'moderate' | 'low' | 'none';
  // Aggregate premium flow estimates
  callPremiumTotal: number;
  putPremiumTotal: number;
}

export interface ExpectedMove {
  weekly: number;                 // Expected $ move for weekly expiry
  weeklyPercent: number;          // Expected % move
  monthly: number;                // Expected $ move for monthly expiry
  monthlyPercent: number;
  selectedExpiry: number;         // Expected move for user-selected expiry
  selectedExpiryPercent: number;
  calculation: string;            // How it was calculated
}

export interface TradeLevels {
  entryZone: { low: number; high: number };
  stopLoss: number;
  stopLossPercent: number;
  target1: { price: number; reason: string; takeProfit: number };  // Take profit %
  target2: { price: number; reason: string; takeProfit: number } | null;
  target3: { price: number; reason: string; takeProfit: number } | null;
  riskRewardRatio: number;
  reasoning: string;
}

export interface EntryTimingAdvice {
  idealEntryWindow: string;     // e.g., "Next 5-15 minutes"
  urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
  reason: string;
  avoidWindows: string[];
  marketSession?: 'premarket' | 'regular' | 'afterhours' | 'closed';
}

export interface OptionsChainData {
  symbol: string;
  expirations: string[];        // Available expiration dates
  strikes: number[];            // Available strikes
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionContract {
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

const DELTA_TARGETS = {
  scalping: { min: 0.65, max: 0.85, label: '0.65-0.85 (high delta for quick moves)' },
  intraday: { min: 0.50, max: 0.70, label: '0.50-0.70 (balanced risk/reward)' },
  swing: { min: 0.40, max: 0.60, label: '0.40-0.60 (more leverage, more time)' },
  position: { min: 0.30, max: 0.50, label: '0.30-0.50 (cheaper, needs bigger move)' },
};

const EXPIRATION_MAP = {
  scalping: { dte: [0, 1, 2], label: '0-2 DTE', reason: 'Quick in/out, high theta but matches confluence timing' },
  intraday_30m: { dte: [1, 2, 3], label: '1-3 DTE', reason: 'Same-day to next-day moves' },
  intraday_1h: { dte: [2, 3, 5], label: '2-5 DTE', reason: 'Gives time for hourly confluence to play out' },
  intraday_4h: { dte: [3, 5, 7], label: '3-7 DTE', reason: '4H moves need a few days' },
  swing_1d: { dte: [5, 7, 14], label: '5-14 DTE', reason: 'Daily confluence = weekly expiration' },
  swing_3d: { dte: [7, 14, 21], label: '1-3 weeks', reason: '3-day moves need 2+ weeks' },
  swing_1w: { dte: [14, 21, 30], label: '2-4 weeks', reason: 'Weekly confluence = monthly options' },
  macro_monthly: { dte: [30, 45, 60], label: '30-60 DTE', reason: 'Monthly moves need time' },
  macro_yearly: { dte: [60, 90, 180], label: 'LEAPS', reason: 'Long-term positioning' },
};

// ═══════════════════════════════════════════════════════════════════════════
// BLACK-SCHOLES GREEKS ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function estimateGreeks(
  spotPrice: number,
  strikePrice: number,
  daysToExpiry: number,
  riskFreeRate: number = 0.05,
  impliedVolatility: number = 0.25,
  isCall: boolean = true
): OptionsGreeks {
  const T = daysToExpiry / 365;
  if (T <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  
  const S = spotPrice;
  const K = strikePrice;
  const r = riskFreeRate;
  const sigma = impliedVolatility;
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  // Delta
  const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1;
  
  // Gamma
  const gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
  
  // Theta (per day)
  const theta1 = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));
  const theta2 = isCall 
    ? -r * K * Math.exp(-r * T) * normalCDF(d2)
    : r * K * Math.exp(-r * T) * normalCDF(-d2);
  const theta = (theta1 + theta2) / 365;
  
  // Vega (per 1% IV move)
  const vega = S * Math.sqrt(T) * normalPDF(d1) / 100;
  
  // Rho (per 1% rate move)
  const rho = isCall
    ? K * T * Math.exp(-r * T) * normalCDF(d2) / 100
    : -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100;
  
  return { delta, gamma, theta, vega, rho };
}

// ═══════════════════════════════════════════════════════════════════════════
// ALPHA VANTAGE OPTIONS CHAIN API
// ═══════════════════════════════════════════════════════════════════════════

interface AVOptionContract {
  contractID: string;
  symbol: string;
  expiration: string;
  strike: string;
  type: string;
  last: string;
  mark: string;
  bid: string;
  bid_size: string;
  ask: string;
  ask_size: string;
  volume: string;
  open_interest: string;
  implied_volatility: string;
  delta?: string;
  gamma?: string;
  theta?: string;
  vega?: string;
  rho?: string;
}

// Get the nearest coming Friday in NY date space (YYYY-MM-DD)
// - Friday: use today (0 days)
// - Saturday: use next Friday (6 days)
// - Sunday-Thursday: use this coming Friday (5 to 1 days)
function getThisWeekFridayYMD(now: Date = new Date()): string {
  const ny = getNYDateParts(now);
  let daysUntilFriday: number;
  if (ny.dayOfWeek === 5) {
    daysUntilFriday = 0;
  } else if (ny.dayOfWeek === 6) {
    daysUntilFriday = 6;
  } else {
    daysUntilFriday = (5 - ny.dayOfWeek + 7) % 7;
  }
  const todayNY = `${ny.year}-${String(ny.month).padStart(2, '0')}-${String(ny.day).padStart(2, '0')}`;
  return addDaysToYMD(todayNY, daysUntilFriday);
}

// ═══════════════════════════════════════════════════════════════════════════
// FIND NEAREST STRIKE FROM ACTUAL CHAIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find the nearest actual strike from the options chain.
 * Falls back to Math.round if no chain strikes available.
 */
function findNearestChainStrike(targetPrice: number, availableStrikes: number[]): number {
  if (!availableStrikes || availableStrikes.length === 0) {
    // Fallback: round to nearest dollar
    return Math.round(targetPrice);
  }
  
  // Find the strike closest to target price
  let nearest = availableStrikes[0];
  let minDiff = Math.abs(targetPrice - nearest);
  
  for (const strike of availableStrikes) {
    const diff = Math.abs(targetPrice - strike);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = strike;
    }
  }
  
  return nearest;
}

function getMoneyness(
  strike: number,
  price: number,
  type: 'call' | 'put'
): 'ITM' | 'ATM' | 'OTM' {
  if (!price || price <= 0) return 'ATM';
  const distance = Math.abs(strike - price) / price;
  if (distance < 0.01) return 'ATM';
  const isITM = type === 'call' ? strike < price : strike > price;
  return isITM ? 'ITM' : 'OTM';
}

function getSpreadLeg(
  centerStrike: number,
  direction: 'up' | 'down',
  availableStrikes: number[]
): number {
  const uniqueSorted = [...new Set(availableStrikes)].filter(s => s > 0).sort((a, b) => a - b);
  if (uniqueSorted.length < 2) {
    const fallbackWidth = Math.max(1, Math.round(centerStrike * 0.02));
    return direction === 'up' ? centerStrike + fallbackWidth : centerStrike - fallbackWidth;
  }
  const nearest = findNearestChainStrike(centerStrike, uniqueSorted);
  const index = uniqueSorted.findIndex(s => s === nearest);
  if (index < 0) {
    const fallbackWidth = Math.max(1, Math.round(centerStrike * 0.02));
    return direction === 'up' ? centerStrike + fallbackWidth : centerStrike - fallbackWidth;
  }
  const targetIndex = direction === 'up'
    ? Math.min(uniqueSorted.length - 1, index + 1)
    : Math.max(0, index - 1);
  return uniqueSorted[targetIndex];
}

async function fetchOptionsChain(symbol: string, targetExpiration?: string): Promise<{
  calls: AVOptionContract[];
  puts: AVOptionContract[];
  selectedExpiry: string;
  dataDate: string | null;
} | null> {
  if (!ALPHA_VANTAGE_KEY) {
    console.warn('No Alpha Vantage API key - skipping options chain fetch');
    return null;
  }
  
  try {
    // Use HISTORICAL_OPTIONS (end-of-day data) - available with 75 req/min premium plan
    // When date is not specified, returns data from the previous trading session
    const url = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    console.log(`📊 Fetching EOD options chain for ${symbol} (historical/delayed)${targetExpiration ? ` for expiry ${targetExpiration}` : ''}...`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Enhanced logging to debug API response
    console.log(`📊 Options API response status: ${response.status}`);
    console.log(`📊 Options API response keys: ${Object.keys(data).join(', ')}`);
    
    if (data['Error Message']) {
      console.error('❌ Options API Error Message:', data['Error Message']);
      return null;
    }
    
    if (data['Note']) {
      console.warn('⚠️ Options API Note (likely rate limit):', data['Note']);
      return null;
    }
    
    if (data['Information']) {
      console.error('❌ Options API Information (likely premium required):', data['Information']);
      return null;
    }
    
    // Alpha Vantage returns data in 'data' array
    const options = data['data'] || [];
    if (!Array.isArray(options) || options.length === 0) {
      console.warn('⚠️ No options data returned. Full response:', JSON.stringify(data).substring(0, 500));
      return null;
    }
    
    // Log first contract to debug field names
    if (options.length > 0) {
      console.log('📊 Sample contract:', JSON.stringify(options[0], null, 2));
    }
    
    // Collect all unique expiration dates
    const expiryMap: Record<string, number> = {};
    for (const opt of options) {
      if (opt.expiration) {
        expiryMap[opt.expiration] = (expiryMap[opt.expiration] || 0) + 1;
      }
    }
    
    // Use user-specified expiration if provided and valid, otherwise auto-select
    let bestExpiry: string;
    
    if (targetExpiration && expiryMap[targetExpiration]) {
      // User specified a valid expiration date
      bestExpiry = targetExpiration;
      console.log(`📅 Using user-specified expiration: ${bestExpiry} (${expiryMap[bestExpiry]} contracts)`);
    } else {
      // Auto-select: Find expiration closest to this Friday with the most contracts
      const targetDateStr = getThisWeekFridayYMD();
      
      bestExpiry = Object.keys(expiryMap)[0];
      let minDiff = Infinity;
      
      for (const expiry of Object.keys(expiryMap)) {
        const diff = Math.abs(dateDiffDaysYMD(targetDateStr, expiry));
        // Prefer closer dates, but also consider contract count
        if (diff < minDiff || (diff === minDiff && expiryMap[expiry] > expiryMap[bestExpiry])) {
          minDiff = diff;
          bestExpiry = expiry;
        }
      }
      
      console.log(`📅 Available expirations: ${Object.keys(expiryMap).slice(0, 5).join(', ')}...`);
      console.log(`📅 Target Friday: ${targetDateStr}, Auto-selected expiry: ${bestExpiry}`);
    }
    
    // Filter to only this expiration
    const calls: AVOptionContract[] = [];
    const puts: AVOptionContract[] = [];
    
    for (const contract of options) {
      if (contract.expiration !== bestExpiry) continue;
      
      const contractType = contract.type?.toLowerCase();
      if (contractType === 'call') {
        calls.push(contract);
      } else if (contractType === 'put') {
        puts.push(contract);
      }
    }
    
    const dataDate = typeof data?.date === 'string'
      ? data.date
      : typeof data?.lastRefreshed === 'string'
      ? data.lastRefreshed
      : typeof data?.last_refreshed === 'string'
      ? data.last_refreshed
      : null;

    console.log(`✅ Filtered to ${bestExpiry}: ${calls.length} calls, ${puts.length} puts`);
    return { calls, puts, selectedExpiry: bestExpiry, dataDate };
  } catch (err) {
    console.error('Options chain fetch failed:', err);
    return null;
  }
}
function analyzeOpenInterest(
  calls: AVOptionContract[],
  puts: AVOptionContract[],
  currentPrice: number,
  expirationDate: string
): OpenInterestData {
  // Calculate DTE for Greeks estimation fallback
  const daysToExpiry = Math.max(1, dateDiffDaysYMD(formatNYDate(new Date()), expirationDate));
  
  // Calculate total OI
  let totalCallOI = 0;
  let totalPutOI = 0;
  
  const strikeOI: Map<number, { callOI: number; putOI: number }> = new Map();
  
  // Store contracts with Greeks for high OI analysis
  const contractsWithGreeks: Array<{
    strike: number;
    openInterest: number;
    type: 'call' | 'put';
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    iv?: number;
  }> = [];
  
  // Sanity check: ensure currentPrice is valid
  if (!currentPrice || currentPrice <= 0) {
    console.error('❌ Invalid currentPrice for O/I analysis:', currentPrice);
    return {
      totalCallOI: 0,
      totalPutOI: 0,
      pcRatio: 1.0,
      sentiment: 'neutral',
      sentimentReason: 'Unable to analyze - invalid price data',
      maxPainStrike: null,
      maxPainReliability: {
        score: 0,
        strikesUsed: 0,
        nonZeroCoverage: 0,
        totalOI: 0,
        reliable: false,
      },
      highOIStrikes: [],
      expirationDate,
    };
  }
  
  // Dynamic strike coverage: default ±30%, expand to ±50% on dense but low-OI chains
  let minStrike = currentPrice * 0.7;
  let maxStrike = currentPrice * 1.3;
  const contractCount = calls.length + puts.length;
  const roughTotalOI = [...calls, ...puts].reduce((sum, contract) => {
    const oi = getIntField(contract as unknown as Record<string, unknown>, ['open_interest', 'openInterest'], 0);
    return sum + oi;
  }, 0);
  if (contractCount > 800 && roughTotalOI < 500) {
    minStrike = currentPrice * 0.5;
    maxStrike = currentPrice * 1.5;
    console.log('📊 Expanding OI strike filter to ±50% due to high contract count with weak OI coverage');
  }
  
  console.log(`📊 Filtering strikes to range: $${minStrike.toFixed(2)} - $${maxStrike.toFixed(2)} (current: $${currentPrice})`);
  
  // Debug: collect all raw strikes to see what's in the data
  const allRawStrikes: number[] = [];
  let debugFirstCall = true;
  
  for (const call of calls) {
    const oi = getIntField(call as unknown as Record<string, unknown>, ['open_interest', 'openInterest'], 0);
    const strike = getNumericField(call as unknown as Record<string, unknown>, ['strike'], 0);
    
    // Debug first call contract
    if (debugFirstCall && calls.length > 0) {
      console.log(`📊 DEBUG First call contract: strike=${strike}, open_interest field="${call.open_interest}", parsed OI=${oi}`);
      console.log(`📊 DEBUG Call fields: ${Object.keys(call).join(', ')}`);
      debugFirstCall = false;
    }
    
    if (strike > 0) allRawStrikes.push(strike);
    
    // Filter to reasonable strike range around current price
    if (strike > 0 && strike >= minStrike && strike <= maxStrike) {
      totalCallOI += oi;
      if (!strikeOI.has(strike)) strikeOI.set(strike, { callOI: 0, putOI: 0 });
      strikeOI.get(strike)!.callOI += oi;
      
      // Capture contract with Greeks - include all ATM/near-ATM contracts even with 0 OI
      // This ensures we always show Greeks data
      const isNearATM = Math.abs(strike - currentPrice) / currentPrice <= 0.10;  // Within 10% of price
      if (oi > 0 || isNearATM) {
        // Parse API Greeks if available
        const apiDelta = getOptionalNumericField(call as unknown as Record<string, unknown>, ['delta', 'Delta']);
        const apiGamma = getOptionalNumericField(call as unknown as Record<string, unknown>, ['gamma', 'Gamma']);
        const apiTheta = getOptionalNumericField(call as unknown as Record<string, unknown>, ['theta', 'Theta']);
        const apiVega = getOptionalNumericField(call as unknown as Record<string, unknown>, ['vega', 'Vega']);
        // Use normalized IV (handles both 0.25 and 25 formats)
        const iv = normalizeIV(call.implied_volatility, 0.25);
        
        // Use estimateGreeks as fallback when API doesn't provide Greeks
        let delta = apiDelta, gamma = apiGamma, theta = apiTheta, vega = apiVega;
        if (apiDelta === undefined || apiGamma === undefined || apiTheta === undefined || apiVega === undefined) {
          const estimated = estimateGreeks(currentPrice, strike, daysToExpiry, 0.05, iv, true);
          delta = apiDelta ?? estimated.delta;
          gamma = apiGamma ?? estimated.gamma;
          theta = apiTheta ?? estimated.theta;
          vega = apiVega ?? estimated.vega;
        }
        
        contractsWithGreeks.push({
          strike,
          openInterest: oi,
          type: 'call',
          delta,
          gamma,
          theta,
          vega,
          iv,
        });
      }
    }
  }
  
  for (const put of puts) {
    // Use helper for field variations (open_interest vs openInterest)
    const oi = getIntField(put as unknown as Record<string, unknown>, ['open_interest', 'openInterest'], 0);
    const strike = getNumericField(put as unknown as Record<string, unknown>, ['strike'], 0);
    
    if (strike > 0) allRawStrikes.push(strike);
    
    // Filter to reasonable strike range around current price
    if (strike > 0 && strike >= minStrike && strike <= maxStrike) {
      totalPutOI += oi;
      if (!strikeOI.has(strike)) strikeOI.set(strike, { callOI: 0, putOI: 0 });
      strikeOI.get(strike)!.putOI += oi;
      
      // Capture contract with Greeks - include all ATM/near-ATM contracts even with 0 OI
      const isNearATM = Math.abs(strike - currentPrice) / currentPrice <= 0.10;  // Within 10% of price
      if (oi > 0 || isNearATM) {
        // Parse API Greeks if available
        const apiDelta = getOptionalNumericField(put as unknown as Record<string, unknown>, ['delta', 'Delta']);
        const apiGamma = getOptionalNumericField(put as unknown as Record<string, unknown>, ['gamma', 'Gamma']);
        const apiTheta = getOptionalNumericField(put as unknown as Record<string, unknown>, ['theta', 'Theta']);
        const apiVega = getOptionalNumericField(put as unknown as Record<string, unknown>, ['vega', 'Vega']);
        // Use normalized IV (handles both 0.25 and 25 formats)
        const iv = normalizeIV(put.implied_volatility, 0.25);
        
        // Use estimateGreeks as fallback when API doesn't provide Greeks
        let delta = apiDelta, gamma = apiGamma, theta = apiTheta, vega = apiVega;
        if (apiDelta === undefined || apiGamma === undefined || apiTheta === undefined || apiVega === undefined) {
          const estimated = estimateGreeks(currentPrice, strike, daysToExpiry, 0.05, iv, false);  // false = put
          delta = apiDelta ?? estimated.delta;
          gamma = apiGamma ?? estimated.gamma;
          theta = apiTheta ?? estimated.theta;
          vega = apiVega ?? estimated.vega;
        }
        
        contractsWithGreeks.push({
          strike,
          openInterest: oi,
          type: 'put',
          delta,
          gamma,
          theta,
          vega,
          iv,
        });
      }
    }
  }
  
  // Debug: Show strike range info
  const uniqueRawStrikes = [...new Set(allRawStrikes)].sort((a, b) => a - b);
  const filteredStrikes = [...strikeOI.keys()].sort((a, b) => a - b);
  console.log(`📊 Raw strikes from API: min=$${uniqueRawStrikes[0]?.toFixed(2) || 'N/A'}, max=$${uniqueRawStrikes[uniqueRawStrikes.length - 1]?.toFixed(2) || 'N/A'}, total=${uniqueRawStrikes.length}`);
  console.log(`📊 Filtered strikes in range: ${filteredStrikes.length} strikes: ${filteredStrikes.slice(0, 10).map(s => '$' + s).join(', ')}${filteredStrikes.length > 10 ? '...' : ''}`);
  
  // Put/Call ratio
  const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
  
  // Sentiment based on P/C ratio
  // < 0.7 = bullish (more calls), > 1.0 = bearish (more puts), between = neutral
  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let sentimentReason = 'P/C ratio in neutral range';
  
  if (pcRatio < 0.7) {
    sentiment = 'bullish';
    sentimentReason = `P/C ${pcRatio.toFixed(2)} = heavy call buying`;
  } else if (pcRatio > 1.0) {
    sentiment = 'bearish';
    sentimentReason = `P/C ${pcRatio.toFixed(2)} = heavy put buying`;
  }
  
  // Find max pain strike (where most options expire worthless)
  // Max Pain = strike where total $ value of ITM options is MINIMIZED
  // For each potential settlement price (strike), calculate total ITM value:
  //   - Calls are ITM if their strike < settlement price → value = (settlement - callStrike) * callOI
  //   - Puts are ITM if their strike > settlement price → value = (putStrike - settlement) * putOI
  let maxPainStrike: number | null = null;
  let minPain = Infinity;
  
  const sortedByProximity = [...strikeOI.keys()]
    .sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
  const settlementCandidates = sortedByProximity.slice(0, 40);
  const painSummationUniverse = sortedByProximity.slice(0, 120);

  for (const potentialSettlement of settlementCandidates) {
    let totalPain = 0;
    
    for (const contractStrike of painSummationUniverse) {
      const data = strikeOI.get(contractStrike);
      if (!data) continue;
      // Calls are ITM when strike < settlement price
      if (contractStrike < potentialSettlement) {
        totalPain += (potentialSettlement - contractStrike) * data.callOI * 100; // *100 for contract size
      }
      // Puts are ITM when strike > settlement price
      if (contractStrike > potentialSettlement) {
        totalPain += (contractStrike - potentialSettlement) * data.putOI * 100; // *100 for contract size
      }
    }
    
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = potentialSettlement;
    }
  }
  
  const strikesWithNonZeroOI = painSummationUniverse.filter(strike => {
    const data = strikeOI.get(strike);
    return !!data && (data.callOI > 0 || data.putOI > 0);
  }).length;
  const nonZeroCoverage = painSummationUniverse.length > 0 ? strikesWithNonZeroOI / painSummationUniverse.length : 0;
  const totalOI = totalCallOI + totalPutOI;
  const reliabilityScore = Math.round(
    Math.min(100,
      (Math.min(painSummationUniverse.length, 20) / 20) * 40 +
      nonZeroCoverage * 35 +
      (Math.min(totalOI, 10000) / 10000) * 25
    )
  );
  const isReliableMaxPain = painSummationUniverse.length >= 6 && nonZeroCoverage >= 0.5 && totalOI >= 500;

  // Final validation: max pain must be within reasonable range of current price
  if (maxPainStrike !== null) {
    const maxPainDistance = Math.abs(maxPainStrike - currentPrice) / currentPrice;
    if (maxPainDistance > 0.35) {
      console.warn(`⚠️ Max pain $${maxPainStrike} is ${(maxPainDistance * 100).toFixed(1)}% away from price $${currentPrice} - likely bad data, nullifying`);
      maxPainStrike = null;
    }
  }

  if (!isReliableMaxPain) {
    maxPainStrike = null;
  }
  
  // Sort contracts: prioritize by OI, but if OI is 0 for all, sort by proximity to ATM
  const hasAnyOI = contractsWithGreeks.some(c => c.openInterest > 0);
  
  if (hasAnyOI) {
    // Normal sort by OI
    contractsWithGreeks.sort((a, b) => b.openInterest - a.openInterest);
  } else {
    // No OI data - sort by proximity to current price (ATM first)
    contractsWithGreeks.sort((a, b) => {
      const distA = Math.abs(a.strike - currentPrice);
      const distB = Math.abs(b.strike - currentPrice);
      return distA - distB;
    });
  }
  
  // Filter to strikes within 15% of current price for display (more relevant to traders)
  // This prevents showing far OTM lottery tickets that distort the view
  const relevantStrikes = contractsWithGreeks.filter(c => {
    const distance = Math.abs(c.strike - currentPrice) / currentPrice;
    return distance <= 0.15;  // Within 15% of current price
  });
  
  // If filtering removes too many, fall back to proximity-based selection
  const topStrikes = relevantStrikes.length >= 6 
    ? relevantStrikes.slice(0, 10)
    : contractsWithGreeks
        .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
        .slice(0, 10);
  
  console.log(`📊 O/I Summary (${expirationDate}): Calls=${totalCallOI.toLocaleString()}, Puts=${totalPutOI.toLocaleString()}, P/C=${pcRatio.toFixed(2)}, MaxPain=$${maxPainStrike}, Top strikes within 15%: ${topStrikes.length}`);
  
  return {
    totalCallOI,
    totalPutOI,
    pcRatio,
    sentiment,
    sentimentReason,
    maxPainStrike,
    maxPainReliability: {
      score: reliabilityScore,
      strikesUsed: painSummationUniverse.length,
      nonZeroCoverage,
      totalOI,
      reliable: isReliableMaxPain,
    },
    highOIStrikes: topStrikes,
    expirationDate,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER: IV RANK / PERCENTILE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

function analyzeIV(
  calls: AVOptionContract[],
  puts: AVOptionContract[],
  currentPrice: number
): IVAnalysis {
  // Find ATM options (within 2% of current price) for accurate IV reading
  const atmRange = currentPrice * 0.02;
  const atmOptions = [...calls, ...puts].filter(opt => {
    const strike = parseFloat(opt.strike || '0');
    return Math.abs(strike - currentPrice) <= atmRange;
  });
  
  // Calculate average IV from ATM options using normalized IV
  let totalIV = 0;
  let ivCount = 0;
  for (const opt of atmOptions) {
    // Use normalized IV (handles both 0.25 and 25 formats)
    const iv = normalizeIV(opt.implied_volatility, 0);
    if (iv > 0 && iv < 5) {  // Sanity check: IV between 0 and 500% (in decimal)
      totalIV += iv;
      ivCount++;
    }
  }
  
  const currentIV = ivCount > 0 ? totalIV / ivCount : 0.25;  // Default 25% if no data
  
  // IV Rank approximation based on typical stock IV ranges
  // Without historical data, we estimate based on absolute levels
  // < 15% = very low, 15-25% = low, 25-40% = normal, 40-60% = elevated, > 60% = high
  let ivRankHeuristic: number;
  let ivPercentile: number;
  
  if (currentIV < 0.15) {
    ivRankHeuristic = 10;
    ivPercentile = 15;
  } else if (currentIV < 0.25) {
    ivRankHeuristic = 25;
    ivPercentile = 30;
  } else if (currentIV < 0.35) {
    ivRankHeuristic = 45;
    ivPercentile = 50;
  } else if (currentIV < 0.50) {
    ivRankHeuristic = 65;
    ivPercentile = 70;
  } else if (currentIV < 0.70) {
    ivRankHeuristic = 80;
    ivPercentile = 85;
  } else {
    ivRankHeuristic = 95;
    ivPercentile = 95;
  }
  
  // Determine signal
  let ivSignal: 'sell_premium' | 'buy_premium' | 'neutral';
  let ivReason: string;
  
  if (ivRankHeuristic >= 70) {
    ivSignal = 'sell_premium';
    ivReason = `IV Rank (heuristic) ${ivRankHeuristic}% is elevated. Consider credit spreads, iron condors, or selling premium.`;
  } else if (ivRankHeuristic <= 30) {
    ivSignal = 'buy_premium';
    ivReason = `IV Rank (heuristic) ${ivRankHeuristic}% is low. Buying options is relatively cheap. Consider long calls/puts or debit spreads.`;
  } else {
    ivSignal = 'neutral';
    ivReason = `IV Rank (heuristic) ${ivRankHeuristic}% is in normal range. Both buying and selling strategies viable.`;
  }
  
  console.log(`📊 IV Analysis: Current IV=${(currentIV * 100).toFixed(1)}%, Rank(heuristic)=${ivRankHeuristic}%, Signal=${ivSignal}`);
  
  return {
    currentIV,
    ivRank: ivRankHeuristic,
    ivRankHeuristic,
    ivPercentile,
    ivSignal,
    ivReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER: UNUSUAL OPTIONS ACTIVITY DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function detectUnusualActivity(
  calls: AVOptionContract[],
  puts: AVOptionContract[],
  currentPrice: number
): UnusualActivity {
  const unusualStrikes: UnusualActivity['unusualStrikes'] = [];
  const VOLUME_OI_THRESHOLD = 2.0;  // Volume > 2x Open Interest = unusual
  const MIN_VOLUME = 500;           // Minimum volume to consider
  const MIN_OI = 200;               // Avoid false positives on tiny OI
  const CORE_DISTANCE_PCT = 0.15;   // Primary unusual activity zone
  const EXTENDED_DISTANCE_PCT = 0.35;
  const EXTENDED_PREMIUM_THRESHOLD = 250000;
  
  // Build map of mark prices for premium calculation
  const markPriceMap = new Map<string, number>();
  
  // Check all options for unusual activity
  const allOptions = [...calls.map(c => ({ ...c, type: 'call' as const })), 
                      ...puts.map(p => ({ ...p, type: 'put' as const }))];
  
  for (const opt of allOptions) {
    const strike = parseFloat(opt.strike || '0');
    const volume = getNumericField(opt as unknown as Record<string, unknown>, ['volume', 'trade_volume'], 0);
    const openInterest = getIntField(opt as unknown as Record<string, unknown>, ['open_interest', 'openInterest'], 0);
    const bid = getNumericField(opt as unknown as Record<string, unknown>, ['bid'], 0);
    const ask = getNumericField(opt as unknown as Record<string, unknown>, ['ask'], 0);
    
    // Prefer midpoint when spread is sane; fallback to mark/last
    const spreadIsSane = bid > 0 && ask > 0 && ask / bid <= 1.25;
    const midPrice = spreadIsSane ? (bid + ask) / 2 : 0;
    const markPrice = midPrice > 0
      ? midPrice
      : getNumericField(opt as unknown as Record<string, unknown>, ['mark', 'mid', 'last'], 0);
    const key = `${strike}-${opt.type}`;
    if (markPrice > 0) markPriceMap.set(key, markPrice);
    
    const distancePercent = Math.abs((strike - currentPrice) / currentPrice);
    if (distancePercent > EXTENDED_DISTANCE_PCT) continue;

    const estimatedPremiumForGate = markPrice > 0 ? markPrice * volume * 100 : 0;
    const inCoreZone = distancePercent <= CORE_DISTANCE_PCT;
    const inExtendedZone = distancePercent > CORE_DISTANCE_PCT && distancePercent <= EXTENDED_DISTANCE_PCT;
    const passesExtendedGate = inExtendedZone && estimatedPremiumForGate >= EXTENDED_PREMIUM_THRESHOLD;
    if (!inCoreZone && !passesExtendedGate) continue;
    
    // Check for unusual volume
    if (volume >= MIN_VOLUME && openInterest >= MIN_OI) {
      if (bid <= 0 || ask <= 0 || ask / bid > 1.25) continue;
      const volumeOIRatio = volume / openInterest;
      
      if (volumeOIRatio >= VOLUME_OI_THRESHOLD) {
        const signal = opt.type === 'call' ? 'bullish' : 'bearish';
        const reasonPrefix = inExtendedZone ? '🧭 Extended OTM flow: ' : '';
        const reason = volumeOIRatio >= 5 
          ? `${reasonPrefix}🚨 EXTREME: ${volume.toLocaleString()} vol vs ${openInterest.toLocaleString()} OI (${volumeOIRatio.toFixed(1)}x)`
          : `${reasonPrefix}⚡ High activity: ${volume.toLocaleString()} vol vs ${openInterest.toLocaleString()} OI (${volumeOIRatio.toFixed(1)}x)`;
        
        unusualStrikes.push({
          strike,
          type: opt.type,
          volume,
          openInterest,
          volumeOIRatio,
          signal,
          reason,
        });
      }
    }
  }
  
  // Sort by volume/OI ratio (most unusual first)
  unusualStrikes.sort((a, b) => b.volumeOIRatio - a.volumeOIRatio);
  
  // Determine smart money direction and estimate premium flow
  let bullishWeight = 0;
  let bearishWeight = 0;
  let callPremiumTotal = 0;
  let putPremiumTotal = 0;
  
  for (const strike of unusualStrikes) {
    const weight = strike.volumeOIRatio * (strike.volume / 1000);  // Weight by ratio and size
    
    // Calculate premium from mark price when available, fallback to rough estimate
    const key = `${strike.strike}-${strike.type}`;
    const markPrice = markPriceMap.get(key);
    let estimatedPremium: number;
    
    if (markPrice && markPrice > 0) {
      // Use mark price: premium = mark * volume * 100 (contract multiplier)
      estimatedPremium = markPrice * strike.volume * 100;
    } else {
      // Fallback: rough estimate (less reliable)
      const distanceFromPrice = Math.abs(strike.strike - currentPrice);
      const roughPremium = Math.max(0.50, currentPrice * 0.02 - distanceFromPrice * 0.1);
      estimatedPremium = roughPremium * strike.volume * 100;
    }
    
    if (strike.type === 'call') {
      bullishWeight += weight;
      callPremiumTotal += estimatedPremium;
    } else {
      bearishWeight += weight;
      putPremiumTotal += estimatedPremium;
    }
  }
  
  let smartMoneyDirection: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  if (bullishWeight > bearishWeight * 1.5) {
    smartMoneyDirection = 'bullish';
  } else if (bearishWeight > bullishWeight * 1.5) {
    smartMoneyDirection = 'bearish';
  } else if (bullishWeight > 0 && bearishWeight > 0) {
    smartMoneyDirection = 'mixed';
  } else {
    smartMoneyDirection = 'neutral';
  }
  
  // Alert level
  let alertLevel: 'high' | 'moderate' | 'low' | 'none';
  const maxRatio = unusualStrikes.length > 0 ? unusualStrikes[0].volumeOIRatio : 0;
  
  if (maxRatio >= 5) {
    alertLevel = 'high';
  } else if (maxRatio >= 3) {
    alertLevel = 'moderate';
  } else if (maxRatio >= 2) {
    alertLevel = 'low';
  } else {
    alertLevel = 'none';
  }
  
  console.log(`📊 Unusual Activity: ${unusualStrikes.length} strikes flagged, Alert=${alertLevel}, Smart Money=${smartMoneyDirection}`);
  
  return {
    hasUnusualActivity: unusualStrikes.length > 0,
    unusualStrikes: unusualStrikes.slice(0, 5),  // Top 5 most unusual
    smartMoneyDirection,
    alertLevel,
    callPremiumTotal: Math.round(callPremiumTotal),
    putPremiumTotal: Math.round(putPremiumTotal),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER: EXPECTED MOVE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateExpectedMove(
  currentPrice: number,
  avgIV: number,
  selectedExpiryDTE: number
): ExpectedMove {
  // Expected Move Formula: Stock Price × IV × √(DTE/365)
  // This is based on 1 standard deviation move (68% probability)
  
  const weeklyDTE = 7;
  const monthlyDTE = 30;
  
  const weeklyMove = currentPrice * avgIV * Math.sqrt(weeklyDTE / 365);
  const weeklyPercent = (weeklyMove / currentPrice) * 100;
  
  const monthlyMove = currentPrice * avgIV * Math.sqrt(monthlyDTE / 365);
  const monthlyPercent = (monthlyMove / currentPrice) * 100;
  
  const selectedMove = currentPrice * avgIV * Math.sqrt(selectedExpiryDTE / 365);
  const selectedPercent = (selectedMove / currentPrice) * 100;
  
  console.log(`📊 Expected Move: Weekly ±$${weeklyMove.toFixed(2)} (${weeklyPercent.toFixed(1)}%), Monthly ±$${monthlyMove.toFixed(2)} (${monthlyPercent.toFixed(1)}%)`);
  
  return {
    weekly: weeklyMove,
    weeklyPercent,
    monthly: monthlyMove,
    monthlyPercent,
    selectedExpiry: selectedMove,
    selectedExpiryPercent: selectedPercent,
    calculation: `Price × IV × √(DTE/365) = $${currentPrice.toFixed(2)} × ${(avgIV * 100).toFixed(0)}% × √(${selectedExpiryDTE}/365)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER: SPECIFIC ENTRY/EXIT LEVELS
// ═══════════════════════════════════════════════════════════════════════════

function calculateTradeLevels(
  confluenceResult: HierarchicalScanResult,
  direction: 'bullish' | 'bearish' | 'neutral',
  maxPainStrike: number | null
): TradeLevels | null {
  if (direction === 'neutral') return null;
  
  const { currentPrice, mid50Levels, clusters, decompression } = confluenceResult;
  const isLong = direction === 'bullish';
  
  // Entry Zone: Current price with small buffer based on volatility
  const entryBuffer = currentPrice * 0.005;  // 0.5% buffer
  const entryZone = {
    low: isLong ? currentPrice - entryBuffer : currentPrice,
    high: isLong ? currentPrice : currentPrice + entryBuffer,
  };
  
  // Stop Loss: Below/above nearest support/resistance or 50% level
  const opposingLevels = mid50Levels
    .filter(l => isLong ? l.level < currentPrice : l.level > currentPrice)
    .sort((a, b) => isLong 
      ? b.level - a.level  // Closest below for longs
      : a.level - b.level  // Closest above for shorts
    );
  
  // Find a 50% level as stop reference
  const stopReference = opposingLevels.length > 0 
    ? opposingLevels[0].level 
    : currentPrice * (isLong ? 0.98 : 1.02);
  
  // Add buffer beyond the level
  const stopBuffer = currentPrice * 0.003;  // 0.3% beyond level
  const stopLoss = isLong 
    ? stopReference - stopBuffer 
    : stopReference + stopBuffer;
  const stopLossPercent = Math.abs((stopLoss - currentPrice) / currentPrice) * 100;
  
  // Targets: Based on 50% levels and clusters in direction of trade
  const targetLevels = mid50Levels
    .filter(l => isLong ? l.level > currentPrice : l.level < currentPrice)
    .sort((a, b) => isLong 
      ? a.level - b.level  // Closest first for longs
      : b.level - a.level  // Closest first for shorts
    );
  
  // Target 1: Nearest 50% level or cluster
  const t1Level = targetLevels.length > 0 ? targetLevels[0] : null;
  const t1Price = t1Level?.level || currentPrice * (isLong ? 1.02 : 0.98);
  const target1 = {
    price: t1Price,
    reason: t1Level ? `${t1Level.tf} 50% level` : 'Default 2% target',
    takeProfit: 50,  // Take 50% off at first target
  };
  
  // Target 2: Next 50% level or max pain
  let t2Price = targetLevels.length > 1 ? targetLevels[1].level : null;
  let t2Reason = targetLevels.length > 1 ? `${targetLevels[1].tf} 50% level` : '';
  
  // If max pain is in our direction and beyond T1, use it
  if (maxPainStrike && ((isLong && maxPainStrike > t1Price) || (!isLong && maxPainStrike < t1Price))) {
    if (!t2Price || (isLong && maxPainStrike < t2Price) || (!isLong && maxPainStrike > t2Price)) {
      t2Price = maxPainStrike;
      t2Reason = 'Max Pain level';
    }
  }
  
  // If T2 doesn't exist or is too close to T1, create a scaled target
  // T2 should be at least 1.5x further than T1 from entry
  const t1Distance = Math.abs(t1Price - currentPrice);
  const t2MinDistance = t1Distance * 1.8;  // T2 at least 80% further than T1
  
  if (!t2Price || Math.abs(t2Price - t1Price) < t1Distance * 0.3) {
    // Create T2 at 1.8x the distance of T1
    t2Price = isLong 
      ? currentPrice + t2MinDistance 
      : currentPrice - t2MinDistance;
    t2Reason = 'Extended target (1.8× T1 distance)';
  }
  
  const target2 = t2Price ? {
    price: t2Price,
    reason: t2Reason,
    takeProfit: 30,  // Take 30% at second target
  } : null;
  
  // Target 3: Extended target from clusters
  const clusterTarget = clusters.find(c => 
    isLong ? c.avgLevel > (t2Price || t1Price) : c.avgLevel < (t2Price || t1Price)
  );
  
  const target3 = clusterTarget ? {
    price: clusterTarget.avgLevel,
    reason: `${clusterTarget.tfs.join('/')} cluster convergence`,
    takeProfit: 20,  // Let remaining 20% run to cluster
  } : null;
  
  // Risk/Reward Ratio
  const risk = Math.abs(currentPrice - stopLoss);
  const reward = Math.abs(target1.price - currentPrice);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;
  
  // Build reasoning
  const reasoning = `Entry ${isLong ? 'above' : 'below'} $${entryZone.low.toFixed(2)}-$${entryZone.high.toFixed(2)}. ` +
    `Stop at $${stopLoss.toFixed(2)} (${stopLossPercent.toFixed(1)}% risk). ` +
    `Target 1: $${target1.price.toFixed(2)} (take 50%). ` +
    (target2 ? `Target 2: $${target2.price.toFixed(2)} (take 30%). ` : '') +
    `R:R = ${riskRewardRatio.toFixed(1)}:1`;
  
  console.log(`📊 Trade Levels: Entry $${currentPrice.toFixed(2)}, Stop $${stopLoss.toFixed(2)}, T1 $${target1.price.toFixed(2)}, R:R ${riskRewardRatio.toFixed(1)}:1`);
  
  return {
    entryZone,
    stopLoss,
    stopLossPercent,
    target1,
    target2,
    target3,
    riskRewardRatio,
    reasoning,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE SCORING SYSTEM - WEIGHTED MULTI-SIGNAL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * REFACTORED SCORING SYSTEM v2.0
 * 
 * Split into two independent tracks:
 * 
 * TRACK A - DIRECTION SCORE (determines Bull/Bear/Neutral)
 * Structure-first weighting model (trader execution order):
 * - Structure Score: 40% (HTF/LTF directional structure + cluster quality)
 * - Pattern State: 25% (compression/expansion momentum state)
 * - Flow Confirmation: 20% (unusual flow + OI sentiment)
 * - Time Alignment: 15% (candle-close confluence timing accelerator)
 * Max Pain remains a dynamic micro-structure modifier on short DTE.
 * 
 * TRACK B - SETUP QUALITY SCORE (determines A+/A/B/C grade)
 * Includes factors that affect trade quality, not direction:
 * - IV Environment: 35% (strategy suitability)
 * - Risk:Reward: 35% (trade quality)
 * - Signal Agreement: 30% (how aligned are directional signals)
 * 
 * Confidence = weighted agreement of directional signals with final direction
 */
function calculateCompositeScore(
  confluenceResult: HierarchicalScanResult,
  oiAnalysis: OISummary | null,
  unusualActivity: UnusualActivity | null,
  ivAnalysis: IVAnalysis | null,
  tradeLevels: TradeLevels | null,
  maxPainData?: { maxPain: number; currentPrice: number },
  dte?: number,  // Days to expiration for dynamic weighting
  qualityContext?: { hasMeaningfulOI?: boolean }
): CompositeScore {
  const components: SignalComponent[] = [];
  const conflicts: string[] = [];

  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
  
  // ═══════════════════════════════════════════════════════════════════════
  // TRACK A: DIRECTION SCORE (only directional signals)
  // ═══════════════════════════════════════════════════════════════════════
  
  let directionWeightedScore = 0;
  let directionTotalWeight = 0;

  // 0. STRUCTURE SCORE (40% of direction) - primary directional layer
  const structureWeight = 0.40;
  let structureScore = 0;
  let structureDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  const directionScore = confluenceResult?.scoreBreakdown?.directionScore ?? 0;
  const clusterScore = confluenceResult?.scoreBreakdown?.clusterScore ?? 50;
  const activeTFs = confluenceResult?.scoreBreakdown?.activeTFs ?? 0;
  const hasHigherTF = confluenceResult?.scoreBreakdown?.hasHigherTF ?? false;
  const dominantClusterRatio = confluenceResult?.scoreBreakdown?.dominantClusterRatio ?? 0;

  const structureQualityMultiplier = clamp(
    (0.6 + (clusterScore / 100) * 0.25 + (hasHigherTF ? 0.15 : 0.05)),
    0.65,
    1.0
  );

  const derivedStructureScore = clamp(directionScore * structureQualityMultiplier, -100, 100);
  const upstreamStructureScore = confluenceResult?.structure?.structureScore;
  const blendedStructureAbs = typeof upstreamStructureScore === 'number'
    ? clamp((Math.abs(derivedStructureScore) * 0.65) + (upstreamStructureScore * 0.35), 0, 100)
    : Math.abs(derivedStructureScore);

  if (derivedStructureScore > 12) {
    structureDirection = 'bullish';
    structureScore = blendedStructureAbs;
  } else if (derivedStructureScore < -12) {
    structureDirection = 'bearish';
    structureScore = -blendedStructureAbs;
  } else {
    const patternVotes = confluenceResult?.structure?.patterns ?? [];
    const bullishVotes = patternVotes.filter(p => p.bias === 'bullish').length;
    const bearishVotes = patternVotes.filter(p => p.bias === 'bearish').length;
    if (bullishVotes > bearishVotes && bullishVotes > 0) {
      structureDirection = 'bullish';
      structureScore = blendedStructureAbs * 0.5;
    } else if (bearishVotes > bullishVotes && bearishVotes > 0) {
      structureDirection = 'bearish';
      structureScore = -blendedStructureAbs * 0.5;
    } else {
      structureDirection = 'neutral';
      structureScore = 0;
    }
  }

  structureScore = clamp(structureScore, -100, 100);

  components.push({
    name: 'Structure Score',
    direction: structureDirection,
    weight: structureWeight,
    score: structureScore,
    reason: `Dir ${directionScore.toFixed(0)}, cluster ${clusterScore.toFixed(0)}, structure ${typeof upstreamStructureScore === 'number' ? upstreamStructureScore.toFixed(0) : 'n/a'}, active TFs ${activeTFs}, dominant ${(dominantClusterRatio * 100).toFixed(0)}%`
  });

  directionWeightedScore += structureScore * structureWeight;
  directionTotalWeight += structureWeight;

  // 0b. PATTERN STATE (25% of direction) - compression/expansion momentum layer
  const patternWeight = 0.25;
  let patternScore = 0;
  let patternDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  const decompScore = confluenceResult?.scoreBreakdown?.decompressionScore ?? 0;
  const predictionDirection = confluenceResult?.prediction?.direction ?? 'neutral';

  if (predictionDirection === 'bullish') {
    patternDirection = 'bullish';
    patternScore = decompScore;
  } else if (predictionDirection === 'bearish') {
    patternDirection = 'bearish';
    patternScore = -decompScore;
  }

  const signalStrength = confluenceResult?.signalStrength ?? 'weak';
  if (signalStrength === 'weak' || signalStrength === 'no_signal') {
    patternScore *= 0.7;
  } else if (signalStrength === 'strong') {
    patternScore *= 1.05;
  }

  patternScore = clamp(patternScore, -100, 100);

  components.push({
    name: 'Pattern State',
    direction: patternDirection,
    weight: patternWeight,
    score: patternScore,
    reason: `${signalStrength.toUpperCase()} state, decompression ${decompScore.toFixed(0)}`
  });

  directionWeightedScore += patternScore * patternWeight;
  directionTotalWeight += patternWeight;
  
  // Helper: Smooth score mapping with clamping
  // 1. UNUSUAL ACTIVITY (12% of direction) - Flow confirmation, not primary trigger
  const unusualWeight = 0.12;
  let unusualScore = 0;
  let unusualDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (unusualActivity && unusualActivity.hasUnusualActivity) {
    const callPremium = unusualActivity.callPremiumTotal || 0;
    const putPremium = unusualActivity.putPremiumTotal || 0;
    const totalPremium = callPremium + putPremium;
    
    // Guardrail: Require minimum premium to trust the signal
    const MIN_PREMIUM_THRESHOLD = 50000; // $50k minimum to avoid noise
    
    if (totalPremium >= MIN_PREMIUM_THRESHOLD) {
      // Calculate net flow ratio: (calls - puts) / total
      // Range: -1 (all puts) to +1 (all calls)
      const netFlowRatio = totalPremium > 0 ? (callPremium - putPremium) / totalPremium : 0;
      
      // Winsorize: Cap extreme ratios to prevent single whale from dominating
      const cappedRatio = Math.max(-0.8, Math.min(0.8, netFlowRatio));
      
      // Map to score: -80 to +80 (capped, not full ±100)
      unusualScore = cappedRatio * 100;
      
      // Calculate raw premium ratio for dead zone check
      const premiumRatio = putPremium > 0 ? callPremium / putPremium : (callPremium > 0 ? 10 : 1);
      const isInDeadZone = (premiumRatio >= 0.9 && premiumRatio <= 1.1) || Math.abs(unusualScore) < 15;
      
      if (isInDeadZone) {
        // PRECISE DEAD ZONE: balanced flow or tiny imbalance = neutral
        unusualDirection = 'neutral';
        unusualScore = 0;
      } else if (cappedRatio > 0.15) {
        unusualDirection = 'bullish';
      } else if (cappedRatio < -0.15) {
        unusualDirection = 'bearish';
      } else {
        // Fallback for edge cases
        unusualDirection = 'neutral';
        unusualScore = 0;
      }
      
      components.push({
        name: 'Unusual Activity',
        direction: unusualDirection,
        weight: unusualWeight,
        score: unusualScore,
        reason: `Net flow: $${((callPremium - putPremium) / 1000).toFixed(0)}k (${(netFlowRatio * 100).toFixed(0)}% call bias)`
      });
      
      directionWeightedScore += unusualScore * unusualWeight;
      directionTotalWeight += unusualWeight;
    } else {
      components.push({
        name: 'Unusual Activity',
        direction: 'neutral',
        weight: unusualWeight,
        score: 0,
        reason: `Insufficient volume ($${(totalPremium / 1000).toFixed(0)}k < $50k threshold)`
      });
    }
  } else {
    components.push({
      name: 'Unusual Activity',
      direction: 'neutral',
      weight: unusualWeight,
      score: 0,
      reason: 'No unusual activity detected'
    });
  }

  const meaningfulOI = qualityContext?.hasMeaningfulOI ?? true;

  // 2. O/I SENTIMENT - Put/Call Ratio (8% of direction, near-zero when OI quality is weak)
  const oiWeight = meaningfulOI ? 0.08 : 0.02;
  let oiScore = 0;
  let oiDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (oiAnalysis && Number.isFinite(oiAnalysis.pcRatio)) {
    const pcRatio = oiAnalysis.pcRatio;
    
    // Use z-score-like mapping:
    // P/C 0.5 or less = strongly bullish (+80)
    // P/C 0.7 = moderately bullish (+40)
    // P/C 0.85 = neutral (0)
    // P/C 1.0 = moderately bearish (-40)
    // P/C 1.3+ = strongly bearish (-80)
    
    const neutralPC = 0.85; // Typical baseline
    const deviation = pcRatio - neutralPC;
    
    // Smooth mapping: each 0.1 deviation = ~25 points
    oiScore = -deviation * 250; // Negative because high P/C = bearish
    oiScore = Math.max(-80, Math.min(80, oiScore)); // Cap at ±80
    
    if (oiScore > 20) {
      oiDirection = 'bullish';
    } else if (oiScore < -20) {
      oiDirection = 'bearish';
    } else {
      oiDirection = 'neutral';
    }
    
    components.push({
      name: 'O/I Sentiment',
      direction: oiDirection,
      weight: oiWeight,
      score: oiScore,
      reason: `P/C: ${pcRatio.toFixed(2)} (${oiDirection === 'bullish' ? 'call-heavy' : oiDirection === 'bearish' ? 'put-heavy' : 'balanced'})`
    });
    
    directionWeightedScore += oiScore * oiWeight;
    directionTotalWeight += oiWeight;
  }

  // 3. TIME CONFLUENCE (non-directional) - timing accelerator only
  const confluenceWeight = 0.15;
  let confluenceScore = 0;
  let confluenceDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  const candleConfluenceScore = confluenceResult?.candleCloseConfluence?.confluenceScore ?? 0;
  const clusteredCount = confluenceResult?.decompression?.clusteredCount ?? 0;
  const timingActivation = clamp(candleConfluenceScore * 0.8 + Math.min(20, clusteredCount * 5), 0, 100);

  components.push({
    name: 'Time Confluence',
    direction: confluenceDirection,
    weight: confluenceWeight,
    score: 0,
    reason: `Timing activation ${timingActivation.toFixed(0)} (candle close ${candleConfluenceScore.toFixed(0)}, clustered TFs ${clusteredCount})`
  });

  // 4. MAX PAIN POSITION (dynamic micro-structure modifier by DTE)
  // Pinning effects are strongest 0-7 DTE, weak beyond 14 DTE
  const effectiveDte = dte ?? 14; // Default to 14 if not provided
  let maxPainWeight = meaningfulOI ? 0.10 : 0;
  
  // Dynamic weight: full weight at DTE 0-3, half at 7, near-zero at 14+
  if (effectiveDte <= 3) {
    maxPainWeight = 0.10;
  } else if (effectiveDte <= 7) {
    maxPainWeight = 0.10 * (1 - (effectiveDte - 3) / 8); // Linear decay
  } else if (effectiveDte <= 14) {
    maxPainWeight = 0.03 * (1 - (effectiveDte - 7) / 14);
  } else {
    maxPainWeight = 0; // Ignore max pain for longer-dated
  }
  
  let maxPainScore = 0;
  let maxPainDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (maxPainData && maxPainData.maxPain > 0 && maxPainWeight > 0) {
    const priceDiffPercent = ((maxPainData.currentPrice - maxPainData.maxPain) / maxPainData.maxPain) * 100;
    
    // Price below max pain = pull upward (bullish)
    // Price above max pain = pull downward (bearish)
    // Smooth mapping: ±10% from max pain = ±100 score
    maxPainScore = -priceDiffPercent * 10; // Negative because above max pain = bearish pull
    maxPainScore = Math.max(-100, Math.min(100, maxPainScore));
    
    // Dead zone: if within 1.5% of max pain, consider neutral
    if (Math.abs(priceDiffPercent) < 1.5) {
      maxPainScore = 0;
      maxPainDirection = 'neutral';
    } else if (maxPainScore > 0) {
      maxPainDirection = 'bullish';
    } else {
      maxPainDirection = 'bearish';
    }
    
    components.push({
      name: 'Max Pain Position',
      direction: maxPainDirection,
      weight: maxPainWeight,
      score: maxPainScore,
      reason: `${priceDiffPercent > 0 ? 'Above' : 'Below'} max pain ($${maxPainData.maxPain.toFixed(2)}) by ${Math.abs(priceDiffPercent).toFixed(1)}% [DTE: ${effectiveDte}]`
    });
    
    if (maxPainWeight > 0) {
      directionWeightedScore += maxPainScore * maxPainWeight;
      directionTotalWeight += maxPainWeight;
    }
  }

  // Calculate normalized direction score
  const normalizedDirectionScore = directionTotalWeight > 0 
    ? directionWeightedScore / directionTotalWeight 
    : 0;

  const directionalEvidenceStrength = components
    .filter(c => ['Structure Score', 'Pattern State', 'Unusual Activity', 'O/I Sentiment', 'Max Pain Position'].includes(c.name) && c.direction !== 'neutral')
    .reduce((sum, c) => sum + c.weight * (Math.abs(c.score) / 100), 0);
  
  // Determine final direction based on direction score only
  let finalDirection: 'bullish' | 'bearish' | 'neutral';
  if (directionalEvidenceStrength < 0.25) {
    finalDirection = 'neutral';
  } else if (normalizedDirectionScore > 15) {
    finalDirection = 'bullish';
  } else if (normalizedDirectionScore < -15) {
    finalDirection = 'bearish';
  } else {
    finalDirection = 'neutral';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRACK B: SETUP QUALITY SCORE (non-directional factors)
  // ═══════════════════════════════════════════════════════════════════════
  
  let qualityScore = 0;
  let qualityMaxScore = 0;
  
  // 5. IV ENVIRONMENT (35% of quality) - Strategy suitability, NOT direction
  const ivQualityWeight = 0.35;
  let ivScore = 0;
  
  if (ivAnalysis) {
    const ivRankValue = ivAnalysis.ivRankHeuristic ?? ivAnalysis.ivRank ?? 50;
    
    // Quality scoring for IV:
    // Low IV (<30) = great for buying premium = high quality
    // High IV (>70) = great for selling premium = high quality  
    // Mid IV (30-70) = either works, moderate quality
    
    if (ivRankValue <= 30) {
      ivScore = 80 + (30 - ivRankValue); // 80-110 → capped at 100
    } else if (ivRankValue >= 70) {
      ivScore = 80 + (ivRankValue - 70); // 80-110 → capped at 100
    } else {
      // Mid IV: moderate quality
      ivScore = 50;
    }
    ivScore = Math.min(100, ivScore);
    
    const ivStrategy = ivRankValue > 70 ? 'SELL premium (spreads)' : ivRankValue < 30 ? 'BUY premium (directional)' : 'Either approach';
    
    components.push({
      name: 'IV Environment',
      direction: 'neutral', // IV is never directional
      weight: ivQualityWeight,
      score: ivScore,
      reason: `IV Rank: ${ivRankValue.toFixed(0)}% → ${ivStrategy}`
    });
    
    qualityScore += ivScore * ivQualityWeight;
    qualityMaxScore += 100 * ivQualityWeight;
  }

  // 6. RISK:REWARD (35% of quality) - Smooth continuous mapping
  const rrQualityWeight = 0.35;
  let rrScore = 0;
  
  if (tradeLevels && tradeLevels.riskRewardRatio) {
    const rr = tradeLevels.riskRewardRatio;
    
    // Smooth continuous mapping (no discontinuities):
    // R:R 0.0 → -50 (terrible)
    // R:R 0.5 → -25
    // R:R 1.0 → +25 (break-even is okay, not great)
    // R:R 1.5 → +50
    // R:R 2.0 → +70
    // R:R 3.0 → +85
    // R:R 4.0+ → +95 (capped)
    
    if (rr <= 0) {
      rrScore = -50;
    } else if (rr <= 1) {
      // 0 to 1: maps -50 to +25
      rrScore = -50 + (rr * 75);
    } else if (rr <= 2) {
      // 1 to 2: maps +25 to +70
      rrScore = 25 + ((rr - 1) * 45);
    } else if (rr <= 4) {
      // 2 to 4: maps +70 to +95
      rrScore = 70 + ((rr - 2) * 12.5);
    } else {
      rrScore = 95; // Cap at 4:1+
    }
    
    const rrGrade = rr >= 2.5 ? 'Excellent' : rr >= 1.5 ? 'Good' : rr >= 1 ? 'Acceptable' : 'POOR';
    
    components.push({
      name: 'Risk:Reward',
      direction: 'neutral', // R:R is quality, not direction
      weight: rrQualityWeight,
      score: rrScore,
      reason: `R:R ${rr.toFixed(1)}:1 - ${rrGrade}`
    });
    
    // Normalize R:R score from [-50..95] to [0..100]
    const normalizedRRScore = Math.max(0, Math.min(100, (rrScore + 50) * (100 / 145)));
    qualityScore += normalizedRRScore * rrQualityWeight;
    qualityMaxScore += 100 * rrQualityWeight;
  }

  // 7. SIGNAL AGREEMENT (30% of quality)
  // Formula: sum(weight_i × |strength_i| for aligned signals) / sum(weight_i × |strength_i| for all signals)
  const agreementWeight = 0.30;
  
  // Get directional components only (exclude neutral signals)
  const directionalComponents = components.filter(c => 
    ['Structure Score', 'Pattern State', 'Unusual Activity', 'O/I Sentiment', 'Time Confluence', 'Max Pain Position'].includes(c.name)
    && c.direction !== 'neutral'
  );
  
  // Calculate weighted agreement with final direction using strength-weighted formula
  let alignedWeightedStrength = 0;
  let totalWeightedStrength = 0;
  
  for (const comp of directionalComponents) {
    const strength = Math.abs(comp.score) / 100; // 0 to 1
    const weightedStrength = comp.weight * strength;
    
    // Add to total for ALL available signals
    totalWeightedStrength += weightedStrength;
    
    // Add to aligned only if agrees with final direction
    if (comp.direction === finalDirection) {
      alignedWeightedStrength += weightedStrength;
    }
  }
  
  // Agreement = aligned / total (handles missing data gracefully)
  let normalizedAgreement = totalWeightedStrength > 0 
    ? (alignedWeightedStrength / totalWeightedStrength) * 100 
    : 50; // Default to 50% if no directional signals

  if (directionalComponents.length < 3) {
    normalizedAgreement = Math.max(0, normalizedAgreement - (3 - directionalComponents.length) * 10);
  }
  
  qualityScore += normalizedAgreement * agreementWeight;
  qualityMaxScore += 100 * agreementWeight;

  // ═══════════════════════════════════════════════════════════════════════
  // CONFIDENCE CALCULATION (weighted agreement, not simple count)
  // ═══════════════════════════════════════════════════════════════════════
  
  // Confidence = how much weight agrees with the final direction, scaled by signal strength
  let confidenceNumerator = 0;
  let confidenceDenominator = 0;
  
  for (const comp of directionalComponents) {
    const signalStrength = Math.abs(comp.score) / 100; // 0 to 1
    const weightedStrength = comp.weight * signalStrength;
    
    confidenceDenominator += weightedStrength;
    
    if (comp.direction === finalDirection) {
      confidenceNumerator += weightedStrength;
    } else if (comp.direction !== 'neutral') {
      // Opposing signal reduces confidence
      confidenceNumerator -= weightedStrength * 0.5;
    }
  }
  
  let confidence = confidenceDenominator > 0 
    ? Math.max(0, Math.min(100, (confidenceNumerator / confidenceDenominator) * 100))
    : 50;

  const structureEdge = typeof upstreamStructureScore === 'number'
    ? clamp(upstreamStructureScore, 0, 100)
    : clamp(Math.abs(structureScore), 0, 100);
  const timeEdge = clamp(timingActivation, 0, 100);
  const flowEdge = clamp((Math.abs(unusualScore) + Math.abs(oiScore)) / 2, 0, 100);
  const edgeBlendConfidence = (timeEdge * 0.40) + (structureEdge * 0.35) + (flowEdge * 0.25);
  confidence = clamp(confidence * 0.60 + edgeBlendConfidence * 0.40, 0, 100);
  
  // If neutral direction, confidence is low by definition
  if (finalDirection === 'neutral') {
    confidence = Math.min(confidence, 40);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONFLICT DETECTION
  // ═══════════════════════════════════════════════════════════════════════
  
  const bullishSignals = directionalComponents.filter(c => c.direction === 'bullish');
  const bearishSignals = directionalComponents.filter(c => c.direction === 'bearish');
  
  if (bullishSignals.length > 0 && bearishSignals.length > 0) {
    const bullNames = bullishSignals.map(c => c.name).join(', ');
    const bearNames = bearishSignals.map(c => c.name).join(', ');
    conflicts.push(`⚠️ CONFLICT: ${bullNames} → BULLISH but ${bearNames} → BEARISH`);
  }
  
  // IV warning
  const ivRankValue = ivAnalysis?.ivRankHeuristic ?? ivAnalysis?.ivRank ?? 50;
  if (ivAnalysis && ivRankValue > 70 && finalDirection !== 'neutral') {
    conflicts.push(`⚠️ HIGH IV (${ivRankValue.toFixed(0)}%): Consider spreads instead of naked ${finalDirection === 'bullish' ? 'calls' : 'puts'}`);
  }
  
  // Poor R:R warning
  if (tradeLevels && tradeLevels.riskRewardRatio < 1) {
    conflicts.push(`⚠️ POOR R:R (${tradeLevels.riskRewardRatio.toFixed(1)}:1): Risk exceeds potential reward`);
  }

  // Calculate final quality percentage
  const finalQualityScore = qualityMaxScore > 0 ? (qualityScore / qualityMaxScore) * 100 : 50;
  const directionalNames = new Set(['Structure Score', 'Pattern State', 'Unusual Activity', 'O/I Sentiment', 'Time Confluence', 'Max Pain Position']);
  const directionalTotal = components.filter(c => directionalNames.has(c.name) && c.weight > 0).length;
  const alignedSignalsCount = directionalComponents.filter(c => c.weight > 0 && c.direction === finalDirection).length;
  const alignedWeight = directionalComponents
    .filter(c => c.direction === finalDirection)
    .reduce((sum, c) => sum + c.weight * (Math.abs(c.score) / 100), 0);
  const totalWeightStrength = directionalComponents
    .reduce((sum, c) => sum + c.weight * (Math.abs(c.score) / 100), 0);
  const alignedWeightPct = totalWeightStrength > 0 ? (alignedWeight / totalWeightStrength) * 100 : 50;

  console.log(`🎯 Direction: ${normalizedDirectionScore.toFixed(1)} → ${finalDirection.toUpperCase()} | Quality: ${finalQualityScore.toFixed(0)}% | Confidence: ${confidence.toFixed(0)}%`);

  return {
    finalDirection,
    directionScore: normalizedDirectionScore,
    confidence,
    qualityScore: finalQualityScore,  // Now exposed for optionsGrade calculation
    components,
    conflicts,
    alignedCount: alignedSignalsCount,
    alignedWeightPct,
    totalSignals: directionalTotal
  };
}

function createFallbackCompositeScore(reason: string): CompositeScore {
  return {
    finalDirection: 'neutral',
    directionScore: 0,
    confidence: 40,
    qualityScore: 50,
    components: [],
    conflicts: [reason],
    alignedCount: 0,
    alignedWeightPct: 50,
    totalSignals: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTITUTIONAL AI MARKET STATE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateAIMarketState(
  compositeScore: CompositeScore,
  ivAnalysis: IVAnalysis | null,
  strategy: StrategyRecommendation | null,
  tradeLevels: TradeLevels | null,
  confluenceResult: HierarchicalScanResult
): AIMarketState {
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 1: DETERMINE MARKET REGIME
  // ═══════════════════════════════════════════════════════════════════════
  
  let regime: MarketRegimeType = 'RANGE';
  let regimeConfidence = 50;
  let regimeReason = '';
  const regimeCharacteristics: string[] = [];
  
  const dirStrength = Math.abs(compositeScore.directionScore);
  const ivRank = ivAnalysis?.ivRankHeuristic ?? ivAnalysis?.ivRank ?? 50;
  const signalAlignment = compositeScore.confidence;
  
  // TREND: Strong directional signals + aligned
  if (dirStrength > 40 && signalAlignment > 60) {
    regime = 'TREND';
    regimeConfidence = Math.min(95, 50 + dirStrength * 0.5 + signalAlignment * 0.3);
    regimeReason = 'Strong directional alignment across multiple factors';
    regimeCharacteristics.push('Directional momentum detected');
    regimeCharacteristics.push(`${compositeScore.alignedCount}/${compositeScore.totalSignals} signals aligned`);
    if (compositeScore.finalDirection === 'bullish') {
      regimeCharacteristics.push('Bullish trend structure');
    } else {
      regimeCharacteristics.push('Bearish trend structure');
    }
  }
  // EXPANSION: High IV + mixed signals = volatility breakout
  else if (ivRank > 70 && signalAlignment < 50) {
    regime = 'EXPANSION';
    regimeConfidence = Math.min(90, 40 + ivRank * 0.4);
    regimeReason = 'High volatility with uncertain direction = potential breakout';
    regimeCharacteristics.push('Elevated implied volatility');
    regimeCharacteristics.push('Conflicting directional signals');
    regimeCharacteristics.push('Volatility expansion likely');
  }
  // REVERSAL: Strong opposite signals from flow vs structure
  else if (compositeScore.conflicts.length >= 2 && dirStrength > 25) {
    regime = 'REVERSAL';
    regimeConfidence = Math.min(80, 30 + compositeScore.conflicts.length * 15);
    regimeReason = 'Conflicting signals suggest potential trend change';
    regimeCharacteristics.push('Price/flow divergence');
    regimeCharacteristics.push('Multiple signal conflicts');
  }
  // RANGE: Default - low directional edge, moderate IV
  else {
    regime = 'RANGE';
    regimeConfidence = Math.min(85, 60 + (100 - dirStrength) * 0.3);
    regimeReason = 'No strong directional edge detected';
    regimeCharacteristics.push('Low directional momentum');
    regimeCharacteristics.push('Price likely range-bound');
    if (ivRank > 50) {
      regimeCharacteristics.push('Elevated IV favors premium selling');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 2: CALCULATE EDGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════
  
  // Direction Edge
  const dirEdgeScore = Math.min(100, Math.abs(compositeScore.directionScore));
  const dirEdgeStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' = 
    dirEdgeScore >= 60 ? 'STRONG' :
    dirEdgeScore >= 35 ? 'MODERATE' :
    dirEdgeScore >= 15 ? 'WEAK' : 'NONE';
  
  const dirEdgeFactors: string[] = [];
  for (const comp of compositeScore.components) {
    if (comp.direction !== 'neutral' && Math.abs(comp.score) > 20) {
      dirEdgeFactors.push(`${comp.name}: ${comp.direction} (${comp.score > 0 ? '+' : ''}${comp.score.toFixed(0)})`);
    }
  }
  
  // Volatility Edge
  let volEdgeScore = 0;
  let volEdgeSignal: 'SELL_VOL' | 'BUY_VOL' | 'NEUTRAL' = 'NEUTRAL';
  const volEdgeFactors: string[] = [];
  
  if (ivAnalysis) {
    // High IV rank = strong sell vol edge
    // Low IV rank = strong buy vol edge
    if (ivRank >= 70) {
      volEdgeScore = Math.min(100, 50 + (ivRank - 70) * 1.5);
      volEdgeSignal = 'SELL_VOL';
      volEdgeFactors.push(`IV Rank: ${ivRank}% (elevated)`);
      volEdgeFactors.push('Premium overpriced vs realized');
    } else if (ivRank <= 30) {
      volEdgeScore = Math.min(100, 50 + (30 - ivRank) * 1.5);
      volEdgeSignal = 'BUY_VOL';
      volEdgeFactors.push(`IV Rank: ${ivRank}% (depressed)`);
      volEdgeFactors.push('Options cheap relative to history');
    } else {
      volEdgeScore = 30;
      volEdgeSignal = 'NEUTRAL';
      volEdgeFactors.push(`IV Rank: ${ivRank}% (neutral zone)`);
    }
  }
  
  const volEdgeStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' = 
    volEdgeScore >= 70 ? 'STRONG' :
    volEdgeScore >= 50 ? 'MODERATE' :
    volEdgeScore >= 30 ? 'WEAK' : 'NONE';
  
  // Time Edge (from confluence)
  const timeEdgeScore = Math.min(100, compositeScore.confidence * 0.8 + 
    (confluenceResult.candleCloseConfluence?.confluenceScore || 0) * 0.2);
  const timeEdgeStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' = 
    timeEdgeScore >= 65 ? 'STRONG' :
    timeEdgeScore >= 45 ? 'MODERATE' :
    timeEdgeScore >= 25 ? 'WEAK' : 'NONE';
  
  const timeEdgeFactors: string[] = [];
  if (confluenceResult.candleCloseConfluence) {
    const cc = confluenceResult.candleCloseConfluence;
    timeEdgeFactors.push(`${cc.closingNow.count} TFs closing now`);
    if (cc.closingSoon.count > 0) {
      timeEdgeFactors.push(`${cc.closingSoon.count} TFs closing soon`);
    }
    timeEdgeFactors.push(`Confluence rating: ${cc.confluenceRating}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 3: GENERATE TRADE THESIS
  // ═══════════════════════════════════════════════════════════════════════
  
  let primaryEdge = '';
  let thesis = '';
  let notEdge = '';
  const keyFactors: string[] = [];
  
  // Determine primary edge based on strongest signal
  if (volEdgeScore > dirEdgeScore && volEdgeScore > timeEdgeScore) {
    primaryEdge = volEdgeSignal === 'SELL_VOL' ? 'Volatility Decay (Theta)' : 'Volatility Expansion (Vega)';
    thesis = volEdgeSignal === 'SELL_VOL'
      ? 'IV is elevated relative to historical levels. The primary edge comes from selling overpriced premium and collecting theta decay.'
      : 'IV is depressed relative to historical levels. Options are cheap and positioned for volatility expansion.';
    notEdge = 'This setup is NOT primarily about directional movement. Direction is secondary to volatility.';
    keyFactors.push(`IV Rank at ${ivRank}%`);
    keyFactors.push(volEdgeSignal === 'SELL_VOL' ? 'Premium elevated vs realized vol' : 'Premium cheap vs realized vol');
  } else if (dirEdgeScore > volEdgeScore && dirEdgeScore > timeEdgeScore) {
    primaryEdge = compositeScore.finalDirection === 'bullish' ? 'Bullish Momentum' : 'Bearish Momentum';
    thesis = `Multiple factors align for ${compositeScore.finalDirection} direction. The primary edge comes from directional movement probability.`;
    notEdge = 'This setup is NOT primarily about volatility. Focus on directional targets.';
    keyFactors.push(`Direction score: ${compositeScore.directionScore > 0 ? '+' : ''}${compositeScore.directionScore.toFixed(0)}`);
    keyFactors.push(`${compositeScore.alignedCount}/${compositeScore.totalSignals} signals aligned`);
  } else {
    primaryEdge = 'Time Confluence';
    thesis = 'Multiple timeframes are aligning for a potential move. The edge comes from temporal confluence rather than a single dominant factor.';
    notEdge = 'This setup relies on timing alignment. No single signal dominates.';
    keyFactors.push(`Time edge score: ${timeEdgeScore.toFixed(0)}%`);
  }
  
  // Add strategy-specific factors
  if (strategy) {
    keyFactors.push(`Strategy: ${strategy.strategy}`);
    keyFactors.push(`Risk profile: ${strategy.riskProfile}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 4: BUILD SCENARIO MAP
  // ═══════════════════════════════════════════════════════════════════════
  
  const scenarios: ScenarioMap = {
    baseCase: {
      description: regime === 'RANGE' 
        ? 'Price stays within expected range'
        : regime === 'TREND'
        ? `${compositeScore.finalDirection.toUpperCase()} trend continues`
        : 'Volatility plays out as expected',
      outcome: regime === 'RANGE'
        ? 'Theta decay benefits premium sellers'
        : regime === 'TREND'
        ? 'Directional move reaches target'
        : 'Position profits from vol expansion/contraction',
      probability: Math.min(75, regimeConfidence)
    },
    bullCase: {
      trigger: tradeLevels 
        ? `Price breaks above $${tradeLevels.target1?.price.toFixed(2) || 'resistance'}`
        : 'Price breaks above resistance',
      outcome: compositeScore.finalDirection === 'bullish'
        ? 'Accelerated profit on long calls/bull spreads'
        : 'Adjustment needed on short calls',
      adjustment: compositeScore.finalDirection === 'bullish'
        ? 'Consider rolling up strikes'
        : 'Close or roll short calls higher'
    },
    bearCase: {
      trigger: tradeLevels
        ? `Price breaks below $${tradeLevels.stopLoss.toFixed(2)}`
        : 'Price breaks below support',
      outcome: compositeScore.finalDirection === 'bearish'
        ? 'Accelerated profit on long puts/bear spreads'
        : 'Adjustment needed on short puts',
      adjustment: compositeScore.finalDirection === 'bearish'
        ? 'Consider rolling down strikes'
        : 'Close or roll short puts lower'
    }
  };
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 5: CALCULATE STRATEGY MATCH SCORE
  // ═══════════════════════════════════════════════════════════════════════
  
  let strategyMatchScore = 50;
  
  if (strategy) {
    // Score how well the recommended strategy fits the regime
    if (regime === 'RANGE' && strategy.strategyType === 'sell_premium') {
      strategyMatchScore = 85 + (volEdgeScore * 0.15);
    } else if (regime === 'TREND' && strategy.strategyType === 'buy_premium') {
      strategyMatchScore = 80 + (dirEdgeScore * 0.2);
    } else if (regime === 'EXPANSION' && (strategy.strategy.includes('Straddle') || strategy.strategy.includes('Strangle'))) {
      strategyMatchScore = 90;
    } else if (regime === 'REVERSAL') {
      strategyMatchScore = 40; // Reversals are risky
    } else {
      strategyMatchScore = 60;
    }
  }
  
  strategyMatchScore = Math.min(99, Math.max(10, strategyMatchScore));
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 6: DETERMINE TRADE QUALITY GATE
  // ═══════════════════════════════════════════════════════════════════════
  
  let tradeQualityGate: 'HIGH' | 'MODERATE' | 'LOW' | 'WAIT' = 'MODERATE';
  
  const bestEdge = Math.max(dirEdgeScore, volEdgeScore, timeEdgeScore);
  
  if (bestEdge >= 70 && strategyMatchScore >= 80 && compositeScore.conflicts.length === 0) {
    tradeQualityGate = 'HIGH';
  } else if (bestEdge >= 50 && strategyMatchScore >= 60) {
    tradeQualityGate = 'MODERATE';
  } else if (bestEdge >= 30 || strategyMatchScore >= 50) {
    tradeQualityGate = 'LOW';
  } else {
    tradeQualityGate = 'WAIT';
  }
  
  // Force WAIT if too many conflicts
  if (compositeScore.conflicts.length >= 3) {
    tradeQualityGate = 'WAIT';
  }
  
  return {
    regime: {
      regime,
      confidence: regimeConfidence,
      reason: regimeReason,
      characteristics: regimeCharacteristics
    },
    edges: {
      directionEdge: {
        strength: dirEdgeStrength,
        score: dirEdgeScore,
        bias: compositeScore.finalDirection,
        factors: dirEdgeFactors
      },
      volatilityEdge: {
        strength: volEdgeStrength,
        score: volEdgeScore,
        signal: volEdgeSignal,
        factors: volEdgeFactors
      },
      timeEdge: {
        strength: timeEdgeStrength,
        score: timeEdgeScore,
        factors: timeEdgeFactors
      }
    },
    thesis: {
      primaryEdge,
      thesis,
      keyFactors,
      notEdge
    },
    scenarios,
    strategyMatchScore,
    tradeQualityGate
  };
}

function buildProfessionalTradeStack(
  compositeScore: CompositeScore,
  confluenceResult: HierarchicalScanResult,
  candleCloseConfluence: CandleCloseConfluence | null,
  openInterestAnalysis: OpenInterestData | null,
  ivAnalysis: IVAnalysis | null,
  unusualActivity: UnusualActivity | null,
  tradeLevels: TradeLevels | null,
  strategyRecommendation: StrategyRecommendation | null,
  currentPrice: number
): ProfessionalTradeStack {
  const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
  const toStatus = (score: number): 'ready' | 'caution' | 'waiting' =>
    score >= 70 ? 'ready' : score >= 45 ? 'caution' : 'waiting';

  const structureComponent = compositeScore.components.find(c => c.name === 'Structure Score');
  const patternComponent = compositeScore.components.find(c => c.name === 'Pattern State');

  const structureScore = clamp(
    (Math.abs(structureComponent?.score ?? compositeScore.directionScore) * 0.7) +
    (Math.abs(patternComponent?.score ?? 0) * 0.3)
  );

  let structureState = 'Compression / Balance';
  if (confluenceResult.signalStrength === 'strong' && compositeScore.finalDirection !== 'neutral') {
    structureState = compositeScore.finalDirection === 'bullish' ? 'Trend Expansion (Bullish)' : 'Trend Expansion (Bearish)';
  } else if (confluenceResult.signalStrength === 'moderate' && compositeScore.finalDirection !== 'neutral') {
    structureState = compositeScore.finalDirection === 'bullish' ? 'Pullback in Trend (Bullish)' : 'Pullback in Trend (Bearish)';
  } else if (compositeScore.conflicts.length >= 2) {
    structureState = 'Reversal Attempt';
  }

  const targetLevel = confluenceResult?.prediction?.targetLevel ?? currentPrice;
  const distanceToTargetPct = targetLevel > 0 ? Math.abs((currentPrice - targetLevel) / targetLevel) * 100 : 0;
  const maxPainDistPct = openInterestAnalysis?.maxPainStrike
    ? Math.abs((currentPrice - openInterestAnalysis.maxPainStrike) / openInterestAnalysis.maxPainStrike) * 100
    : 6;
  const liquidityScore = clamp(100 - (distanceToTargetPct * 8 + maxPainDistPct * 4));
  const liquidityState = liquidityScore >= 70
    ? 'Near reflection / reaction zone'
    : liquidityScore >= 45
      ? 'Between zones'
      : 'Far from key reaction zones';

  const timeBase = candleCloseConfluence?.confluenceScore ?? 0;
  const clusteredBonus = Math.min(20, (confluenceResult.decompression.clusteredCount ?? 0) * 5);
  const timeScore = clamp(timeBase * 0.8 + clusteredBonus);
  const timeState = timeScore >= 75
    ? 'TIME EDGE ACTIVATED'
    : timeScore >= 45
      ? 'Timing building'
      : 'No timing activation';

  const unusualComponent = compositeScore.components.find(c => c.name === 'Unusual Activity');
  const oiComponent = compositeScore.components.find(c => c.name === 'O/I Sentiment');
  const ivRank = ivAnalysis?.ivRankHeuristic ?? ivAnalysis?.ivRank ?? 50;
  const ivSuitability = ivRank >= 70 || ivRank <= 30 ? 80 : 55;
  const optionsScore = clamp(
    (Math.abs(unusualComponent?.score ?? 0) * 0.4) +
    (Math.abs(oiComponent?.score ?? 0) * 0.3) +
    (ivSuitability * 0.3)
  );
  const optionsState = unusualActivity?.hasUnusualActivity
    ? `Flow ${unusualActivity.smartMoneyDirection.toUpperCase()} + IV ${ivRank.toFixed(0)}`
    : `OI ${openInterestAnalysis?.sentiment ?? 'neutral'} + IV ${ivRank.toFixed(0)}`;

  const rr = tradeLevels?.riskRewardRatio ?? 0;
  const rrScore = rr <= 0 ? 0 : rr <= 1 ? 35 : rr <= 2 ? 60 : rr <= 3 ? 80 : 92;
  const strategyReady = !!strategyRecommendation && strategyRecommendation.strategy !== 'WAIT';
  const executionScore = clamp((rrScore * 0.6) + (strategyReady ? 25 : 0) + (compositeScore.finalDirection !== 'neutral' ? 15 : 0));
  const executionState = strategyReady
    ? `Ready: ${strategyRecommendation?.strategy || 'defined plan'}`
    : 'Wait for cleaner trigger / invalidation';

  const overallEdgeScore = Math.round(clamp(
    structureScore * 0.35 +
    liquidityScore * 0.20 +
    timeScore * 0.20 +
    optionsScore * 0.20 +
    executionScore * 0.05
  ));

  const overallState: 'A+' | 'A' | 'B' | 'C' | 'WAIT' =
    strategyRecommendation?.strategy === 'WAIT' || compositeScore.finalDirection === 'neutral'
      ? 'WAIT'
      : overallEdgeScore >= 85
        ? 'A+'
        : overallEdgeScore >= 70
          ? 'A'
          : overallEdgeScore >= 55
            ? 'B'
            : 'C';

  return {
    structureState: {
      label: 'Structure',
      state: structureState,
      score: Math.round(structureScore),
      status: toStatus(structureScore),
      reason: structureComponent?.reason || 'Structure derived from direction + pattern components',
    },
    liquidityContext: {
      label: 'Liquidity',
      state: liquidityState,
      score: Math.round(liquidityScore),
      status: toStatus(liquidityScore),
      reason: `Dist to target zone ${distanceToTargetPct.toFixed(2)}%, max pain dist ${maxPainDistPct.toFixed(2)}%`,
    },
    timeEdge: {
      label: 'Time Edge',
      state: timeState,
      score: Math.round(timeScore),
      status: toStatus(timeScore),
      reason: `Confluence ${timeBase.toFixed(0)} + clustered TF bonus ${clusteredBonus.toFixed(0)}`,
    },
    optionsEdge: {
      label: 'Options Flow',
      state: optionsState,
      score: Math.round(optionsScore),
      status: toStatus(optionsScore),
      reason: 'Flow/OI + IV suitability composite',
    },
    executionPlan: {
      label: 'Execution',
      state: executionState,
      score: Math.round(executionScore),
      status: toStatus(executionScore),
      reason: `R:R ${rr.toFixed(1)} with strategy readiness ${strategyReady ? 'yes' : 'no'}`,
    },
    overallEdgeScore,
    overallState,
  };
}

async function buildLocationContext(
  confluence: HierarchicalScanResult,
  symbol: string,
  assetType: AssetType
): Promise<LocationContext> {
  const { currentPrice, mid50Levels, clusters, prediction } = confluence;

  const nearest50 = [...mid50Levels]
    .sort((a, b) => Math.abs(a.level - currentPrice) - Math.abs(b.level - currentPrice))[0];

  const keyZones: LocationContext['keyZones'] = [
    ...(nearest50 ? [{
      type: nearest50.level < currentPrice ? 'support' as const : 'resistance' as const,
      level: nearest50.level,
      strength: nearest50.isDecompressing ? 'strong' as const : 'moderate' as const,
      reason: `${nearest50.tf} 50% reflection level${nearest50.isDecompressing ? ' (decompressing)' : ''}`,
    }] : []),
    ...clusters.slice(0, 2).map((cluster) => ({
      type: cluster.avgLevel < currentPrice ? 'demand' as const : 'supply' as const,
      level: cluster.avgLevel,
      strength: cluster.tfs.length >= 3 ? 'strong' as const : 'moderate' as const,
      reason: `Cluster magnet (${cluster.tfs.join('/')})`,
    })),
  ];

  let candles1H: PatternCandle[] = [...(confluence.candlesByTf?.['1H'] ?? [])];
  let candles4H: PatternCandle[] = [...(confluence.candlesByTf?.['4H'] ?? [])];
  let candles1D: PatternCandle[] = [...(confluence.candlesByTf?.['1D'] ?? [])];

  if (candles1H.length < 50 || candles4H.length < 50 || candles1D.length < 50) {
    const fallback = await fetchPatternCandlesFallback(symbol, assetType);
    if (candles1H.length < 50) candles1H = fallback['1H'];
    if (candles4H.length < 50) candles4H = fallback['4H'];
    if (candles1D.length < 50) candles1D = fallback['1D'];
  }

  const patternResults = [
    candles1H.length ? scanPatterns({ candles: candles1H, timeframeLabel: '1H' }) : null,
    candles4H.length ? scanPatterns({ candles: candles4H, timeframeLabel: '4H' }) : null,
    candles1D.length ? scanPatterns({ candles: candles1D, timeframeLabel: '1D' }) : null,
  ].filter(Boolean) as ReturnType<typeof scanPatterns>[];

  const patterns = patternResults
    .flatMap(result => result.patterns)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6)
    .map(pattern => ({
      name: pattern.name,
      bias: pattern.bias,
      confidence: pattern.confidence,
      reason: pattern.reason,
    }));

  const topSummary = patternResults[0]?.summary ?? {
    bias: prediction?.direction ?? 'neutral',
    confidence: prediction?.confidence ?? 30,
    reason: 'No pattern summary'
  };

  let regime: LocationContext['regime'] = 'UNKNOWN';
  if (topSummary.bias === 'neutral') {
    regime = prediction?.confidence && prediction.confidence >= 45 ? 'RANGE' : 'UNKNOWN';
  } else {
    regime = 'TREND';
  }

  return {
    regime,
    keyZones,
    patterns,
    reflection: {
      nearest: nearest50?.level ?? null,
      reason: nearest50 ? `${nearest50.tf} 50%` : 'No reflection level found',
    },
  };
}

function buildTradeSnapshot(args: {
  symbol: string;
  confluence: HierarchicalScanResult;
  finalDirection: 'bullish' | 'bearish' | 'neutral';
  tradeQuality: 'A+' | 'A' | 'B' | 'C' | 'F';
  optionsGrade: 'A+' | 'A' | 'B' | 'C' | 'F';
  composite: CompositeScore;
  entryTiming: EntryTimingAdvice;
  tradeLevels: TradeLevels | null;
  location: LocationContext | null;
}): TradeSnapshot {
  const {
    confluence,
    finalDirection,
    tradeQuality,
    optionsGrade,
    composite,
    entryTiming,
    tradeLevels,
    location,
  } = args;

  const verdict: EdgeVerdict =
    finalDirection === 'neutral' ? 'WAIT' : finalDirection === 'bullish' ? 'BULLISH_EDGE' : 'BEARISH_EDGE';

  const gradeRank: Record<'A+' | 'A' | 'B' | 'C' | 'F', number> = { 'A+': 5, A: 4, B: 3, C: 2, F: 1 };
  const setupGrade: TradeSnapshot['setupGrade'] = gradeRank[tradeQuality] <= gradeRank[optionsGrade] ? tradeQuality : optionsGrade;

  const why: string[] = [];

  const nearestZone = location?.keyZones?.[0];
  if (nearestZone) {
    why.push(`${nearestZone.type.toUpperCase()} @ ${nearestZone.level.toFixed(2)} — ${nearestZone.reason}`);
  }

  const topPattern = location?.patterns?.sort((a, b) => b.confidence - a.confidence)[0];
  if (topPattern && topPattern.confidence >= 65) {
    why.push(`PATTERN: ${topPattern.name} (${topPattern.bias}, ${topPattern.confidence}%) — ${topPattern.reason}`);
  }

  const decompCount = confluence.decompression.clusteredCount ?? confluence.decompression.activeCount;
  if (decompCount >= 2) {
    why.push(`TIME EDGE: ${decompCount} TFs clustered (timing advantage)`);
  } else {
    why.push(`TIME: weak clustering (${decompCount} TF)`);
  }

  const flowComp = composite.components.find(component => component.name === 'Unusual Activity' && component.direction !== 'neutral');
  if (flowComp) why.push(`FLOW: ${flowComp.reason}`);

  const oiComp = composite.components.find(component => component.name === 'O/I Sentiment' && component.direction !== 'neutral');
  if (oiComp) why.push(`POSITIONING: ${oiComp.reason}`);

  const whyTrimmed = why.slice(0, 4);

  const invalidationLevel = tradeLevels?.stopLoss ?? null;
  const invalidationReason =
    invalidationLevel !== null
      ? `Invalid if price breaches stop structure (${invalidationLevel.toFixed(2)})`
      : 'Invalidation unavailable (no reliable levels)';

  const entryTrigger =
    verdict === 'WAIT'
      ? 'Wait for alignment / confirmation'
      : tradeLevels
        ? (finalDirection === 'bullish'
            ? `Entry on reclaim/hold above ${tradeLevels.entryZone.high.toFixed(2)}`
            : `Entry on breakdown/hold below ${tradeLevels.entryZone.low.toFixed(2)}`)
        : 'Entry trigger unavailable';

  const targets = tradeLevels
    ? [
        { price: tradeLevels.target1.price, reason: tradeLevels.target1.reason },
        ...(tradeLevels.target2 ? [{ price: tradeLevels.target2.price, reason: tradeLevels.target2.reason }] : []),
        ...(tradeLevels.target3 ? [{ price: tradeLevels.target3.price, reason: tradeLevels.target3.reason }] : []),
      ]
    : [];

  const clusterMins = confluence.decompression.temporalCluster?.clusterCenter;
  const catalyst =
    typeof clusterMins === 'number' && clusterMins > 0
      ? `Time edge active: ~${Math.round(clusterMins)}m to clustered closes`
      : `Timing: ${entryTiming.reason}`;

  const oneLine =
    verdict === 'WAIT'
      ? 'No clean edge — signals conflicted'
      : `${finalDirection.toUpperCase()} edge near ${nearestZone ? `${nearestZone.type} zone` : 'key level'} with time activation`;

  return {
    verdict,
    setupGrade,
    oneLine,
    why: whyTrimmed,
    risk: { invalidationLevel, invalidationReason },
    action: {
      entryTrigger,
      entryZone: tradeLevels?.entryZone,
      targets,
    },
    timing: {
      urgency: entryTiming.urgency,
      catalyst,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY RECOMMENDATION BASED ON IV ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

function recommendStrategy(
  compositeScore: CompositeScore,
  ivAnalysis: IVAnalysis | null,
  currentPrice: number,
  atmStrike?: number,
  availableStrikes: number[] = []
): StrategyRecommendation {
  const direction = compositeScore.finalDirection;
  const ivPercentile = ivAnalysis?.ivRankHeuristic ?? ivAnalysis?.ivRank ?? 50;
  const confidence = compositeScore.confidence;
  
  const strike = atmStrike || Math.round(currentPrice);
  const downLeg = getSpreadLeg(strike, 'down', availableStrikes);
  const upLeg = getSpreadLeg(strike, 'up', availableStrikes);
  const downWidth = Math.max(0.01, Math.abs(strike - downLeg));
  const upWidth = Math.max(0.01, Math.abs(upLeg - strike));

  // High IV environment (>70%) - SELL premium
  if (ivPercentile > 70) {
    if (direction === 'bullish') {
      return {
        strategy: 'Bull Put Spread',
        strategyType: 'sell_premium',
        reason: `High IV (${ivPercentile.toFixed(0)}%) + Bullish bias → Sell put spreads to collect premium`,
        strikes: { short: strike, long: downLeg },
        riskProfile: 'defined',
        maxRisk: `$${(downWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected (typically 30-40% of width)`
      };
    } else if (direction === 'bearish') {
      return {
        strategy: 'Bear Call Spread',
        strategyType: 'sell_premium',
        reason: `High IV (${ivPercentile.toFixed(0)}%) + Bearish bias → Sell call spreads to collect premium`,
        strikes: { short: strike, long: upLeg },
        riskProfile: 'defined',
        maxRisk: `$${(upWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected (typically 30-40% of width)`
      };
    } else {
      return {
        strategy: 'Iron Condor',
        strategyType: 'sell_premium',
        reason: `High IV (${ivPercentile.toFixed(0)}%) + Neutral bias → Sell both sides`,
        strikes: { short: strike, long: undefined },
        riskProfile: 'defined',
        maxRisk: `Spread width minus premium collected`,
        maxReward: `Total premium collected from both spreads`
      };
    }
  }
  
  // Low IV environment (<30%) - BUY premium
  if (ivPercentile < 30) {
    if (direction === 'bullish') {
      if (confidence > 70) {
        return {
          strategy: 'Long Call',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Strong Bullish (${confidence.toFixed(0)}% conf) → Buy calls for max upside`,
          strikes: { long: strike },
          riskProfile: 'defined',
          maxRisk: `Premium paid (100% of investment)`,
          maxReward: `Unlimited upside`
        };
      } else {
        return {
          strategy: 'Call Debit Spread',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Moderate Bullish → Reduced cost spread`,
          strikes: { long: strike, short: upLeg },
          riskProfile: 'defined',
          maxRisk: `Net debit paid`,
          maxReward: `$${(upWidth * 100).toFixed(0)} per contract minus debit`
        };
      }
    } else if (direction === 'bearish') {
      if (confidence > 70) {
        return {
          strategy: 'Long Put',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Strong Bearish (${confidence.toFixed(0)}% conf) → Buy puts for max downside capture`,
          strikes: { long: strike },
          riskProfile: 'defined',
          maxRisk: `Premium paid (100% of investment)`,
          maxReward: `Strike price minus premium (stock to zero)`
        };
      } else {
        return {
          strategy: 'Put Debit Spread',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Moderate Bearish → Reduced cost spread`,
          strikes: { long: strike, short: downLeg },
          riskProfile: 'defined',
          maxRisk: `Net debit paid`,
          maxReward: `$${(downWidth * 100).toFixed(0)} per contract minus debit`
        };
      }
    } else {
      return {
        strategy: 'Long Straddle',
        strategyType: 'buy_premium',
        reason: `Low IV (${ivPercentile.toFixed(0)}%) + Neutral → Bet on volatility expansion`,
        strikes: { long: strike },
        riskProfile: 'defined',
        maxRisk: `Total premium paid for call + put`,
        maxReward: `Unlimited in either direction`
      };
    }
  }
  
  // Medium IV environment (30-70%) - Either approach based on direction strength
  if (direction === 'bullish') {
    if (confidence > 60) {
      return {
        strategy: 'Call Debit Spread',
        strategyType: 'buy_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Bullish → Balanced risk/reward with spread`,
        strikes: { long: strike, short: upLeg },
        riskProfile: 'defined',
        maxRisk: `Net debit paid`,
        maxReward: `$${(upWidth * 100).toFixed(0)} per contract minus debit`
      };
    } else {
      return {
        strategy: 'Bull Put Spread',
        strategyType: 'sell_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Weak Bullish → Collect some premium while bullish`,
        strikes: { short: strike, long: downLeg },
        riskProfile: 'defined',
        maxRisk: `$${(downWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected`
      };
    }
  } else if (direction === 'bearish') {
    if (confidence > 60) {
      return {
        strategy: 'Put Debit Spread',
        strategyType: 'buy_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Bearish → Balanced risk/reward with spread`,
        strikes: { long: strike, short: downLeg },
        riskProfile: 'defined',
        maxRisk: `Net debit paid`,
        maxReward: `$${(downWidth * 100).toFixed(0)} per contract minus debit`
      };
    } else {
      return {
        strategy: 'Bear Call Spread',
        strategyType: 'sell_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Weak Bearish → Collect some premium while bearish`,
        strikes: { short: strike, long: upLeg },
        riskProfile: 'defined',
        maxRisk: `$${(upWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected`
      };
    }
  }
  
  // Default neutral
  return {
    strategy: 'Iron Condor',
    strategyType: 'neutral',
    reason: `Neutral bias with medium IV → Sell both sides for premium`,
    strikes: { short: strike },
    riskProfile: 'defined',
    maxRisk: `Spread width minus premium collected`,
    maxReward: `Total premium collected`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIKE SELECTION BASED ON 50% LEVELS
// ═══════════════════════════════════════════════════════════════════════════

function selectStrikesFromConfluence(
  confluenceResult: HierarchicalScanResult,
  isCallDirection: boolean,
  availableStrikes: number[] = [],
  impliedVolatility: number = 0.25
): StrikeRecommendation[] {
  const { currentPrice, mid50Levels, clusters, decompression, prediction } = confluenceResult;
  const recommendations: StrikeRecommendation[] = [];
  
  // Get sorted 50% levels in direction of trade
  const relevantLevels = mid50Levels
    .filter(l => isCallDirection ? l.level > currentPrice : l.level < currentPrice)
    .sort((a, b) => isCallDirection 
      ? a.level - b.level  // Closest above for calls
      : b.level - a.level  // Closest below for puts
    );
  
  // Primary recommendation: ATM or 1 strike OTM for best delta exposure
  // Use actual chain strikes when available
  const atmStrike = findNearestChainStrike(currentPrice, availableStrikes);
  const atmGreeks = estimateGreeks(currentPrice, atmStrike, 7, 0.05, impliedVolatility, isCallDirection);
  
  // Calculate target level with sanity check - must be within 20% of current price
  let targetLevel = relevantLevels[0]?.level || (isCallDirection ? currentPrice * 1.02 : currentPrice * 0.98);
  const maxReasonableTarget = currentPrice * 1.20;
  const minReasonableTarget = currentPrice * 0.80;
  if (targetLevel > maxReasonableTarget || targetLevel < minReasonableTarget) {
    console.warn(`⚠️ Target level $${targetLevel} out of range, defaulting to 2% move`);
    targetLevel = isCallDirection ? currentPrice * 1.02 : currentPrice * 0.98;
  }
  const minTargetDistancePct = 0.008;
  const currentTargetDistancePct = Math.abs((targetLevel - currentPrice) / currentPrice);
  if (currentTargetDistancePct < minTargetDistancePct) {
    targetLevel = isCallDirection ? currentPrice * (1 + minTargetDistancePct) : currentPrice * (1 - minTargetDistancePct);
  }

  recommendations.push({
    strike: atmStrike,
    type: isCallDirection ? 'call' : 'put',
    reason: 'Nearest-to-price strike (best liquidity, balanced delta/gamma)',
    distanceFromPrice: ((atmStrike - currentPrice) / currentPrice) * 100,
    moneyness: 'ATM',
    estimatedDelta: atmGreeks.delta,
    confidenceScore: prediction.confidence,
    targetLevel,
  });
  
  // Secondary: Strike at nearest 50% cluster
  if (clusters.length > 0) {
    const clusterLevel = clusters[0].avgLevel;
    // Find strike near cluster - use actual chain strikes
    const clusterStrike = findNearestChainStrike(clusterLevel, availableStrikes);
    if (clusterStrike !== atmStrike) {
      const clusterGreeks = estimateGreeks(currentPrice, clusterStrike, 7, 0.05, impliedVolatility, isCallDirection);
      const distPct = ((clusterStrike - currentPrice) / currentPrice) * 100;
      
      recommendations.push({
        strike: clusterStrike,
        type: isCallDirection ? 'call' : 'put',
        reason: `Strike at 50% cluster (${clusters[0].tfs.join('/')} converging)`,
        distanceFromPrice: distPct,
        moneyness: getMoneyness(clusterStrike, currentPrice, isCallDirection ? 'call' : 'put'),
        estimatedDelta: clusterGreeks.delta,
        confidenceScore: Math.min(100, prediction.confidence + clusters[0].tfs.length * 5),
        targetLevel: clusterLevel,
      });
    }
  }
  
  // Tertiary: Nearest decompressing 50% level as target
  const decompLevels = mid50Levels.filter(l => l.isDecompressing);
  if (decompLevels.length > 0) {
    const primaryDecomp = decompLevels[0];
    const decompStrike = findNearestChainStrike(primaryDecomp.level, availableStrikes);
    if (decompStrike !== atmStrike && !recommendations.find(r => r.strike === decompStrike)) {
      const decompGreeks = estimateGreeks(currentPrice, decompStrike, 7, 0.05, impliedVolatility, isCallDirection);
      const distPct = ((decompStrike - currentPrice) / currentPrice) * 100;
      
      recommendations.push({
        strike: decompStrike,
        type: isCallDirection ? 'call' : 'put',
        reason: `Target: ${primaryDecomp.tf} 50% level (actively decompressing)`,
        distanceFromPrice: distPct,
        moneyness: getMoneyness(decompStrike, currentPrice, isCallDirection ? 'call' : 'put'),
        estimatedDelta: decompGreeks.delta,
        confidenceScore: prediction.confidence,
        targetLevel: primaryDecomp.level,
      });
    }
  }
  
  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRATION SELECTION BASED ON CONFLUENCE TIMING
// ═══════════════════════════════════════════════════════════════════════════

function selectExpirationFromConfluence(
  confluenceResult: HierarchicalScanResult,
  scanMode: ScanMode,
  assetType: AssetType
): ExpirationRecommendation[] {
  const expirationConfig = EXPIRATION_MAP[scanMode] || EXPIRATION_MAP.intraday_1h;
  const recommendations: ExpirationRecommendation[] = [];
  const today = new Date();
  
  // Use clusteredCount (TFs closing together) for urgency, not just active count
  const decompCount = confluenceResult.decompression.clusteredCount ?? confluenceResult.decompression.activeCount;
  const hasHighConfluence = decompCount >= 3;
  
  for (const dte of expirationConfig.dte) {
    const expDate = new Date(today);
    expDate.setDate(expDate.getDate() + dte);
    // Skip weekends for equity options
    while (expDate.getDay() === 0 || expDate.getDay() === 6) {
      expDate.setDate(expDate.getDate() + 1);
    }
    
    const dateStr = formatNYDate(expDate);
    const calendarDTE = Math.max(0, dateDiffDaysYMD(formatNYDate(today), dateStr));
    const marketDTE = calculateMarketDTE(today, expDate, assetType);

    let thetaRisk: 'low' | 'moderate' | 'high' = 'low';
    if (marketDTE <= 2) thetaRisk = 'high';
    else if (marketDTE <= 7) thetaRisk = 'moderate';
    
    let timeframe: 'scalping' | 'intraday' | 'swing' | 'position' = 'intraday';
    if (marketDTE <= 2) timeframe = 'scalping';
    else if (marketDTE <= 7) timeframe = 'intraday';
    else if (marketDTE <= 30) timeframe = 'swing';
    else timeframe = 'position';
    
    // Adjust confidence based on decompression timing
    let confidence = confluenceResult.prediction.confidence;
    if (hasHighConfluence && dte <= 5) {
      confidence = Math.min(100, confidence + 10);
    }
    
    const reason = dte === expirationConfig.dte[0]
      ? `Primary: ${expirationConfig.reason}`
      : `Alternative: More time for move to develop`;
    
    recommendations.push({
      dte: marketDTE,
      calendarDte: calendarDTE,
      expirationDate: dateStr,
      reason,
      thetaRisk,
      timeframe,
      confidenceScore: confidence,
    });
  }
  
  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADE QUALITY GRADING (with O/I integration)
// ═══════════════════════════════════════════════════════════════════════════

function gradeTradeQuality(
  confluenceResult: HierarchicalScanResult,
  oiData: OpenInterestData | null = null
): { grade: 'A+' | 'A' | 'B' | 'C' | 'F'; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  
  // Use clusteredCount (TFs closing together) for real confluence score
  // Fall back to activeCount for backwards compatibility
  const decompCount = confluenceResult.decompression.clusteredCount ?? confluenceResult.decompression.activeCount;
  const clusterRatio = confluenceResult.decompression.clusteringRatio ?? 100;
  
  // Confluence stack (0-25 points) - based on CLUSTERED count now
  if (decompCount >= 5) {
    score += 25;
    reasons.push(`✅ Mega confluence: ${decompCount} TFs closing together`);
  } else if (decompCount >= 3) {
    score += 18;
    reasons.push(`✅ Strong confluence: ${decompCount} TFs closing together`);
  } else if (decompCount >= 2) {
    score += 10;
    reasons.push(`⚡ Moderate confluence: ${decompCount} TFs aligned`);
  } else if (decompCount === 1) {
    score += 3;
    reasons.push(`⚠️ Low confluence: 1 TF active (no clustering)`);
  } else {
    reasons.push(`❌ No active confluence - wait for TF alignment`);
  }
  
  // Direction clarity (0-25 points)
  const pullBias = Math.abs(confluenceResult.decompression.pullBias);
  if (pullBias >= 80) {
    score += 25;
    reasons.push(`✅ Very clear direction: ${pullBias.toFixed(0)}% bias`);
  } else if (pullBias >= 60) {
    score += 18;
    reasons.push(`✅ Clear direction: ${pullBias.toFixed(0)}% bias`);
  } else if (pullBias >= 40) {
    score += 10;
    reasons.push(`⚡ Moderate bias: ${pullBias.toFixed(0)}%`);
  } else {
    reasons.push(`⚠️ Weak/conflicting bias: ${pullBias.toFixed(0)}%`);
  }
  
  // Cluster magnets (0-15 points)
  if (confluenceResult.clusters.length >= 2) {
    score += 15;
    reasons.push(`✅ Multiple price clusters (${confluenceResult.clusters.length})`);
  } else if (confluenceResult.clusters.length === 1) {
    score += 10;
    reasons.push(`✅ Price cluster detected`);
  } else {
    reasons.push(`📍 No strong price clusters`);
  }
  
  // Prediction confidence (0-20 points)
  const confidence = confluenceResult.prediction.confidence;
  if (confidence >= 85) {
    score += 20;
    reasons.push(`✅ High confidence prediction: ${confidence}%`);
  } else if (confidence >= 70) {
    score += 15;
    reasons.push(`✅ Good confidence: ${confidence}%`);
  } else if (confidence >= 50) {
    score += 8;
    reasons.push(`⚡ Moderate confidence: ${confidence}%`);
  } else {
    reasons.push(`⚠️ Low confidence: ${confidence}%`);
  }
  
  // O/I Sentiment Alignment (0-15 points) - NEW
  if (oiData) {
    const direction = confluenceResult.decompression.netPullDirection;
    const oiAligned = (direction === 'bullish' && oiData.sentiment === 'bullish') ||
                      (direction === 'bearish' && oiData.sentiment === 'bearish');
    const oiConflict = (direction === 'bullish' && oiData.sentiment === 'bearish') ||
                       (direction === 'bearish' && oiData.sentiment === 'bullish');
    
    if (oiAligned) {
      score += 15;
      reasons.push(`✅ O/I confirms direction: P/C ratio ${oiData.pcRatio.toFixed(2)}`);
    } else if (oiConflict) {
      score -= 5;  // Penalty for conflict
      reasons.push(`⚠️ O/I conflicts: P/C ratio ${oiData.pcRatio.toFixed(2)} suggests ${oiData.sentiment}`);
    } else {
      score += 5;
      reasons.push(`📊 O/I neutral: P/C ratio ${oiData.pcRatio.toFixed(2)}`);
    }
    
    // Max pain proximity bonus (0-5 points)
    if (oiData.maxPainStrike) {
      const maxPainDist = Math.abs((oiData.maxPainStrike - confluenceResult.currentPrice) / confluenceResult.currentPrice) * 100;
      if (maxPainDist <= 2) {
        score += 5;
        reasons.push(`✅ Near max pain: $${oiData.maxPainStrike.toFixed(0)}`);
      }
    }
  } else {
    reasons.push(`📊 O/I data unavailable`);
  }
  
  // Grade assignment
  let grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  if (score >= 90) grade = 'A+';
  else if (score >= 75) grade = 'A';
  else if (score >= 55) grade = 'B';
  else if (score >= 35) grade = 'C';
  else grade = 'F';
  
  return { grade, reasons };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY TIMING BASED ON CONFLUENCE WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

function calculateEntryTiming(
  confluenceResult: HierarchicalScanResult,
  candleCloseConfluence?: CandleCloseConfluence | null
): EntryTimingAdvice {
  const now = new Date();
  const nyTime = getNYTimeParts(now);
  const estTimeDecimal = nyTime.hour + nyTime.minute / 60;
  
  // Use clusteredCount (TFs closing together) for real confluence
  const decompCount = confluenceResult.decompression.clusteredCount ?? confluenceResult.decompression.activeCount;
  const activeDecomps = confluenceResult.decompression.decompressions.filter(d => d.isDecompressing);
  
  // Get cluster info for display
  const clusterTimeframes = confluenceResult.decompression.temporalCluster?.timeframes || [];
  const clusterMinsToClose = confluenceResult.decompression.temporalCluster?.clusterCenter || 0;
  
  // Find nearest decompression close from clustered TFs
  const nearestClose = clusterMinsToClose > 0 ? clusterMinsToClose : activeDecomps
    .map(d => d.minsToClose)
    .filter(m => m > 0)
    .sort((a, b) => a - b)[0];
  
  const avoidWindows: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════
  // EXTENDED HOURS DETECTION (EST)
  // Pre-market:  4:00 AM - 9:30 AM EST
  // Regular:     9:30 AM - 4:00 PM EST
  // After-hours: 4:00 PM - 8:00 PM EST
  // Closed:      8:00 PM - 4:00 AM EST
  // ═══════════════════════════════════════════════════════════════════════
  
  type MarketSession = 'premarket' | 'regular' | 'afterhours' | 'closed';
  let marketSession: MarketSession = 'closed';
  let sessionWarning: string | null = null;
  
  if (estTimeDecimal >= 4 && estTimeDecimal < 9.5) {
    marketSession = 'premarket';
    sessionWarning = '🌅 PRE-MARKET SESSION (4am-9:30am EST) - Options execution is limited/unavailable; spreads can be misleading. Use underlying-only context until regular hours.';
  } else if (estTimeDecimal >= 9.5 && estTimeDecimal < 16) {
    marketSession = 'regular';
    // No warning for regular hours
  } else if (estTimeDecimal >= 16 && estTimeDecimal < 20) {
    marketSession = 'afterhours';
    sessionWarning = '🌙 AFTER-HOURS SESSION (4pm-8pm EST) - Options execution is limited/unavailable; displayed spreads can be misleading. Use underlying-only context.';
  } else {
    marketSession = 'closed';
    sessionWarning = '🔒 MARKET CLOSED - Current prices may gap at next open. Options execution is unavailable outside regular session.';
  }
  
  if (sessionWarning) {
    avoidWindows.push(sessionWarning);
  }
  
  // First 30 mins (9:30-10:00am EST) - high volatility
  if (estTimeDecimal >= 9.5 && estTimeDecimal < 10) {
    avoidWindows.push('🚀 Opening volatility (9:30-10am EST) - Wait for direction to establish');
  }
  
  // Last 30 mins (3:30-4:00pm EST) - position squaring
  if (estTimeDecimal >= 15.5 && estTimeDecimal < 16) {
    avoidWindows.push('⏰ Power hour (3:30-4pm EST) - Increased volatility from position squaring');
  }
  
  // Lunch lull (12pm-2pm EST)
  if (estTimeDecimal >= 12 && estTimeDecimal < 14) {
    avoidWindows.push('😴 Lunch lull (12-2pm EST) - Lower volume, choppy price action');
  }
  
  // Get candle close confluence score (0-100)
  const candleScore = candleCloseConfluence?.confluenceScore || 0;
  const hasStrongCandleConfluence = candleScore >= 25;
  const hasWeakCandleConfluence = candleScore < 15;
  
  // Determine urgency - now factors in candle close confluence AND market session
  let urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade' = 'wait';
  let reason = '';
  let idealWindow = '';
  
  // ═══════════════════════════════════════════════════════════════════════
  // EXTENDED HOURS OVERRIDE - downgrade urgency outside regular hours
  // ═══════════════════════════════════════════════════════════════════════
  const isExtendedHours = marketSession !== 'regular';
  const isMarketClosed = marketSession === 'closed';
  
  if (isMarketClosed) {
    // Market fully closed - no trading
    urgency = 'wait';
    reason = 'Market closed - prepare order for next session';
    idealWindow = 'Next regular market open (9:30am EST)';
  } else if (confluenceResult.signalStrength === 'no_signal' || 
      confluenceResult.decompression.netPullDirection === 'neutral') {
    urgency = 'no_trade';
    reason = 'No clear directional signal - wait for confluence';
    idealWindow = 'Wait for TFs to align';
  } else if (hasWeakCandleConfluence && decompCount < 3) {
    // LOW CANDLE CONFLUENCE - suppress urgency even if other signals good
    urgency = 'wait';
    reason = `Low candle confluence (${candleScore}%) - wait for multiple TF closes to align`;
    // Format the best entry window from the object
    const bestWindow = candleCloseConfluence?.bestEntryWindow;
    idealWindow = bestWindow ? `In ${bestWindow.startMins}-${bestWindow.endMins} mins` : 'Wait for TF alignment';
    avoidWindows.push(`⚠️ Candle Close Score only ${candleScore}% - higher probability when TFs close together`);
  } else if (decompCount >= 3 && Math.abs(confluenceResult.decompression.pullBias) >= 60 && hasStrongCandleConfluence) {
    // Prime conditions - but check extended hours
    if (isExtendedHours) {
      urgency = 'wait';
      reason = `Strong confluence but in ${marketSession === 'premarket' ? 'pre-market' : 'after-hours'} - wait for regular hours for options liquidity`;
      idealWindow = marketSession === 'premarket' ? 'At market open (9:30am EST)' : 'Tomorrow at open';
    } else {
      urgency = 'immediate';
      reason = `${decompCount} TFs closing together + ${candleScore}% candle confluence - prime entry window`;
      idealWindow = nearestClose ? `Before ${nearestClose}m TF close` : 'Now';
    }
  } else if (decompCount >= 3 && Math.abs(confluenceResult.decompression.pullBias) >= 60) {
    // Good decompression but weak candle confluence - downgrade to within_hour
    if (isExtendedHours) {
      urgency = 'wait';
      reason = `Good confluence but in ${marketSession === 'premarket' ? 'pre-market' : 'after-hours'} - options lack liquidity`;
      idealWindow = marketSession === 'premarket' ? 'At market open (9:30am EST)' : 'Tomorrow at open';
    } else {
      urgency = 'within_hour';
      reason = `${decompCount} TFs closing together but candle confluence only ${candleScore}% - wait for better alignment`;
      const bestWindow = candleCloseConfluence?.bestEntryWindow;
      idealWindow = bestWindow ? `In ${bestWindow.startMins}-${bestWindow.endMins} mins` : 'Within 30 minutes';
    }
  } else if (decompCount >= 2) {
    if (isExtendedHours) {
      urgency = 'wait';
      reason = `Confluence building but ${marketSession === 'premarket' ? 'pre-market' : 'after-hours'} session - prepare for regular hours`;
      idealWindow = marketSession === 'premarket' ? 'At or after 9:30am EST' : 'Tomorrow';
    } else {
      urgency = 'within_hour';
      reason = 'Good confluence building - enter on slight pullback';
      idealWindow = nearestClose ? `Within ${Math.min(nearestClose, 30)} minutes` : 'Within 30 minutes';
    }
  } else if (nearestClose && nearestClose <= 15) {
    urgency = 'within_hour';
    reason = `TF close in ${nearestClose}m - wait for post-close confirmation`;
    idealWindow = `${nearestClose + 2}-${nearestClose + 10}m from now`;
  } else {
    urgency = 'wait';
    reason = 'Low confluence - wait for more TFs to decompress';
    idealWindow = 'Monitor for confluence buildup';
  }
  
  return {
    idealEntryWindow: idealWindow,
    urgency,
    reason,
    avoidWindows,
    marketSession, // Include session info in response
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEKS ADVICE
// ═══════════════════════════════════════════════════════════════════════════

function generateGreeksAdvice(
  scanMode: ScanMode,
  expirationDte: number,
  signalStrength: string
): GreeksAdvice {
  const deltaConfig = DELTA_TARGETS[
    scanMode.startsWith('scalping') ? 'scalping' :
    scanMode.startsWith('intraday') ? 'intraday' :
    scanMode.startsWith('swing') ? 'swing' : 'position'
  ] || DELTA_TARGETS.intraday;
  
  let thetaWarning: string | null = null;
  if (expirationDte <= 2) {
    thetaWarning = '⚠️ HIGH THETA DECAY: 0-2 DTE options lose value rapidly. Theta shown as $/day per contract equivalent.';
  } else if (expirationDte <= 5) {
    thetaWarning = '⚡ Moderate theta: Consider closing before last 2 DTE if target not hit. Theta units are $/day equivalent.';
  }
  
  let vegaConsideration: string | null = null;
  if (signalStrength === 'strong') {
    vegaConsideration = 'IV crush risk if playing earnings or events. Vega shown as sensitivity per 1% IV move.';
  }
  
  let gammaAdvice: string | null = null;
  if (expirationDte <= 3) {
    gammaAdvice = 'High gamma = fast P/L swings. Be ready to exit quickly on target or stop.';
  }
  
  const overallAdvice = signalStrength === 'strong'
    ? `Target delta ${deltaConfig.label}. Strong confluence supports aggressive positioning.`
    : signalStrength === 'moderate'
    ? `Target delta ${deltaConfig.label}. Consider smaller position due to moderate signal.`
    : `Wait for better signal quality or use defined-risk spreads.`;
  
  return {
    deltaTarget: deltaConfig.label,
    thetaWarning,
    vegaConsideration,
    gammaAdvice,
    overallAdvice,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class OptionsConfluenceAnalyzer {
  private confluenceAgent: ConfluenceLearningAgent;
  
  constructor() {
    this.confluenceAgent = new ConfluenceLearningAgent();
  }
  
  /**
   * Analyze a symbol for options trading using Time Confluence
   * @param expirationDate Optional specific expiration date (YYYY-MM-DD) to use instead of auto-selecting
   * @param assetType Explicit asset type (don't infer from symbol string)
   */
  async analyzeForOptions(
    symbol: string,
    scanMode: ScanMode,
    expirationDate?: string,
    assetType: AssetType = 'equity'  // Default to equity, but pass explicitly when known
  ): Promise<OptionsSetup> {
    // Get confluence analysis
    const confluenceResult = await this.confluenceAgent.scanHierarchical(symbol, scanMode);
    
    const { currentPrice, decompression, prediction, signalStrength, clusters, mid50Levels, candleCloseConfluence } = confluenceResult;
    
    // Initialize data quality tracking
    const dataQuality: DataQuality = {
      optionsChainSource: 'none',
      freshness: 'STALE',
      hasGreeksFromAPI: false,
      greeksModel: 'black_scholes_european',
      hasMeaningfulOI: false,
      contractsCount: { calls: 0, puts: 0 },
      availableStrikes: [],
      chainExpiryUsed: null,
      underlyingAsOf: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    
    // Initialize production tracking arrays - declared early for use throughout function
    const executionNotes: string[] = [];
    const dataConfidenceCaps: string[] = [];
    const disclaimerFlags: string[] = [];
    
    // Fetch options chain for O/I analysis (non-crypto only - use explicit assetType)
    let openInterestAnalysis: OpenInterestData | null = null;
    let ivAnalysis: IVAnalysis | null = null;
    let unusualActivity: UnusualActivity | null = null;
    let expectedMove: ExpectedMove | null = null;
    
    // Only fetch options for equity/etf/index (not crypto/forex)
    if (assetType === 'equity' || assetType === 'etf' || assetType === 'index') {
      try {
        const optionsChain = await fetchOptionsChain(symbol, expirationDate);
        if (optionsChain) {
          // Update data quality
          dataQuality.optionsChainSource = 'alpha_vantage';
          dataQuality.freshness = 'EOD';  // Alpha Vantage historical is EOD
          dataQuality.contractsCount = { 
            calls: optionsChain.calls.length, 
            puts: optionsChain.puts.length 
          };
          dataQuality.availableStrikes = [...new Set([
            ...optionsChain.calls.map(c => parseFloat(c.strike || '0')),
            ...optionsChain.puts.map(p => parseFloat(p.strike || '0'))
          ])].filter(s => s > 0).sort((a, b) => a - b);
          dataQuality.chainExpiryUsed = optionsChain.selectedExpiry;
          dataQuality.lastUpdated = optionsChain.dataDate || 'UNKNOWN_EOD';
          
          // Check if API provided Greeks (numeric validation, not truthy string check)
          const samplePool = [...optionsChain.calls, ...optionsChain.puts].slice(0, 50);
          dataQuality.hasGreeksFromAPI = samplePool.some(contract => {
            const delta = getOptionalNumericField(contract as unknown as Record<string, unknown>, ['delta', 'Delta']);
            return delta !== undefined;
          });
          dataQuality.greeksModel = dataQuality.hasGreeksFromAPI ? 'api' : 'black_scholes_european';
          
          openInterestAnalysis = analyzeOpenInterest(optionsChain.calls, optionsChain.puts, currentPrice, optionsChain.selectedExpiry);
          dataQuality.hasMeaningfulOI = openInterestAnalysis.totalCallOI > 100 || openInterestAnalysis.totalPutOI > 100;
          
          console.log(`📊 O/I Analysis (${optionsChain.selectedExpiry}): P/C=${openInterestAnalysis.pcRatio.toFixed(2)}, Sentiment=${openInterestAnalysis.sentiment}, Max Pain=$${openInterestAnalysis.maxPainStrike || 'N/A'}`);
          
          // PRO TRADER: IV Analysis
          ivAnalysis = analyzeIV(optionsChain.calls, optionsChain.puts, currentPrice);
          
          // PRO TRADER: Unusual Activity Detection
          unusualActivity = detectUnusualActivity(optionsChain.calls, optionsChain.puts, currentPrice);
          
          // PRO TRADER: Expected Move Calculation
          const avgIV = ivAnalysis.currentIV;
          const todayNy = formatNYDate(new Date());
          const selectedCalendarDTE = expirationDate
            ? Math.max(0, dateDiffDaysYMD(todayNy, expirationDate))
            : 7;
          const selectedDTE = expirationDate
            ? calculateMarketDTE(new Date(), new Date(expirationDate), assetType)
            : 7;
          expectedMove = calculateExpectedMove(currentPrice, avgIV, selectedCalendarDTE);
          
          // Add EOD data confidence cap
          dataConfidenceCaps.push('EOD options data - confidence capped (not realtime)');
          executionNotes.push('DTE uses weekend-adjusted market days for listed assets');
          if (!openInterestAnalysis.maxPainReliability.reliable) {
            executionNotes.push(`Max pain reliability low (${openInterestAnalysis.maxPainReliability.score}/100) - max pain excluded`);
            dataConfidenceCaps.push('Max pain unreliable due to weak OI/strike coverage');
          }
          
          // Add execution notes based on data quality
          if (!dataQuality.hasMeaningfulOI) {
            executionNotes.push('⚠️ Low OI detected - liquidity may be poor');
          }
          if (!dataQuality.hasGreeksFromAPI) {
            executionNotes.push('Greeks estimated via Black-Scholes (not from API)');
          }
        }
      } catch (err) {
        console.warn('O/I analysis failed:', err);
        dataConfidenceCaps.push('Options chain fetch failed - no OI/IV data');
      }
    } else {
      dataConfidenceCaps.push(`Asset type ${assetType} - no options analysis available`);
    }
    
    // Determine baseline confluence direction
    const direction = decompression.netPullDirection;
    
    // Grade trade quality (now includes O/I sentiment alignment)
    const { grade, reasons: qualityReasons } = gradeTradeQuality(confluenceResult, openInterestAnalysis);
    
    // Select expirations based on confluence timing
    let allExpirations = selectExpirationFromConfluence(confluenceResult, scanMode, assetType);
    let primaryExpiration = allExpirations.length > 0 ? allExpirations[0] : null;
    let alternativeExpirations = allExpirations.slice(1);

    if (dataQuality.optionsChainSource === 'none') {
      allExpirations = allExpirations.map(exp => ({
        ...exp,
        reason: `Theoretical (no live options chain): ${exp.reason}`,
      }));
      primaryExpiration = allExpirations.length > 0 ? allExpirations[0] : null;
      alternativeExpirations = allExpirations.slice(1);
    }
    
    // Entry timing - now factors in candle close confluence score
    const entryTiming = calculateEntryTiming(confluenceResult, candleCloseConfluence);
    
    // Greeks advice
    const greeksAdvice = generateGreeksAdvice(
      scanMode, 
      primaryExpiration?.dte || 7, 
      signalStrength
    );
    
    // Risk management (factor in O/I alignment)
    let maxRiskPercent = 2;
    const oiAligned = openInterestAnalysis && (
      (direction === 'bullish' && openInterestAnalysis.sentiment === 'bullish') ||
      (direction === 'bearish' && openInterestAnalysis.sentiment === 'bearish')
    );
    
    if (grade === 'A+') maxRiskPercent = oiAligned ? 3.5 : 3;
    else if (grade === 'A') maxRiskPercent = oiAligned ? 3 : 2.5;
    else if (grade === 'B') maxRiskPercent = 2;
    else if (grade === 'C') maxRiskPercent = 1;
    else maxRiskPercent = 0.5;
    
    const stopLossStrategy = signalStrength === 'strong'
      ? 'Exit if option loses 50% of premium or price crosses against 50% level'
      : 'Tight stop: Exit if option loses 35% of premium';
    
    const profitTargetStrategy = signalStrength === 'strong'
      ? 'Target 100-150% of premium at nearest 50% level cluster'
      : 'Target 50-80% of premium, take profits early';
    
    // PRO TRADER: Calculate specific entry/exit levels
    const tradeLevels = calculateTradeLevels(
      confluenceResult,
      direction,
      openInterestAnalysis?.maxPainStrike || null
    );
    
    // PRO TRADER: Calculate composite score from all signals
    let compositeScoreRaw: CompositeScore | null = null;
    try {
      const includeMaxPain = !!openInterestAnalysis && dataQuality.hasMeaningfulOI && openInterestAnalysis.maxPainReliability.reliable;
      compositeScoreRaw = calculateCompositeScore(
        confluenceResult,
        openInterestAnalysis ? {
          pcRatio: openInterestAnalysis.pcRatio,
          sentiment: openInterestAnalysis.sentiment
        } : null,
        unusualActivity,
        ivAnalysis,
        tradeLevels,
        includeMaxPain && openInterestAnalysis ? {
          maxPain: openInterestAnalysis.maxPainStrike || 0,
          currentPrice
        } : undefined,
        primaryExpiration?.dte || 14,  // Pass DTE for dynamic max pain weighting
        { hasMeaningfulOI: dataQuality.hasMeaningfulOI }
      );
    } catch (error) {
      console.warn('Composite score calculation failed:', error);
    }

    const compositeScore = compositeScoreRaw ?? createFallbackCompositeScore('Composite score unavailable');

    let confidenceCap = 95;
    if ((assetType === 'equity' || assetType === 'etf' || assetType === 'index') && dataQuality.freshness !== 'REALTIME') {
      confidenceCap = 70;
      dataConfidenceCaps.push('Options chain is non-realtime; confidence capped at 70');
    }
    if (!dataQuality.hasMeaningfulOI) {
      confidenceCap = Math.min(confidenceCap, 60);
      dataConfidenceCaps.push('Meaningful OI unavailable; confidence capped at 60 and OI/max-pain influence reduced');
    }
    const totalContracts = (dataQuality.contractsCount.calls || 0) + (dataQuality.contractsCount.puts || 0);
    if (totalContracts > 0 && totalContracts < 60) {
      confidenceCap = Math.min(confidenceCap, 65);
      dataConfidenceCaps.push(`Sparse chain depth (${totalContracts} contracts) - confidence capped at 65`);
    }
    compositeScore.confidence = Math.min(compositeScore.confidence, confidenceCap);

    const domains = [
      true,
      !!openInterestAnalysis,
      !!unusualActivity,
      !!ivAnalysis,
      !!tradeLevels,
    ];
    const completeness = domains.filter(Boolean).length / domains.length;
    const completenessCap = 40 + completeness * 60;
    compositeScore.confidence = Math.min(compositeScore.confidence, completenessCap);

    if (!dataQuality.hasGreeksFromAPI && (primaryExpiration?.dte ?? 99) <= 3) {
      dataConfidenceCaps.push('Greeks are Black-Scholes estimates; short-DTE accuracy reduced');
      compositeScore.confidence = Math.min(compositeScore.confidence, 65);
    }
    
    // Use composite direction - if composite says neutral, respect it (don't force a direction)
    // Only fall back to confluence direction if composite has very low confidence
    let finalDirection: 'bullish' | 'bearish' | 'neutral';
    if (Math.abs(compositeScore.directionScore) < 15 || compositeScore.conflicts.length >= 2) {
      finalDirection = 'neutral';
    } else if (compositeScore.confidence >= 50) {
      finalDirection = compositeScore.finalDirection;
    } else {
      finalDirection = compositeScore.finalDirection || direction;
    }

    const isCallDirection = finalDirection === 'bullish';

    // Select strikes after final direction is resolved
    const allStrikes = finalDirection !== 'neutral'
      ? selectStrikesFromConfluence(
          confluenceResult,
          isCallDirection,
          dataQuality.availableStrikes,
          ivAnalysis?.currentIV ?? 0.25
        )
      : [];
    let primaryStrike = allStrikes.length > 0 ? allStrikes[0] : null;
    let alternativeStrikes = allStrikes.slice(1);

    const effectiveCompositeScore: CompositeScore = { ...compositeScore, finalDirection };

    // PRO TRADER: Get strategy recommendation after final direction resolution
    let strategyRecommendation = recommendStrategy(
      effectiveCompositeScore,
      ivAnalysis,
      currentPrice,
      primaryStrike?.strike,
      dataQuality.availableStrikes
    );
    
    // Use clusteredCount (TFs closing together) instead of activeCount (all decompressing)
    // This reflects REAL temporal confluence, not just "how many TFs exist"
    const realConfluenceCount = decompression.clusteredCount ?? decompression.activeCount;
    
    // Only show TFs that are part of the main temporal cluster
    const clusteredTFSet = new Set(decompression.temporalCluster?.timeframes || []);
    const clusteredDecompressingTFs = decompression.decompressions
      .filter(d => d.isDecompressing && clusteredTFSet.has(d.tf))
      .map(d => d.tf);
    
    // INSTITUTIONAL AI MARKET STATE - Hedge Fund Decision Model
    const aiMarketState = calculateAIMarketState(
      effectiveCompositeScore,
      ivAnalysis,
      strategyRecommendation,
      tradeLevels,
      confluenceResult
    );

    if (aiMarketState.tradeQualityGate === 'WAIT') {
      strategyRecommendation = {
        strategy: 'WAIT',
        strategyType: 'neutral',
        reason: 'Conflicts/high-risk market conditions. Wait for alignment.',
        riskProfile: 'defined',
        maxRisk: '0',
        maxReward: '0',
      };
    }
    
    // PRODUCTION FIX: Calculate options quality score and grade
    const optionsQualityScore = compositeScore.qualityScore ?? 50;
    let optionsGrade: 'A+' | 'A' | 'B' | 'C' | 'F' = 
      optionsQualityScore >= 85 ? 'A+' :
      optionsQualityScore >= 70 ? 'A' :
      optionsQualityScore >= 55 ? 'B' :
      optionsQualityScore >= 40 ? 'C' : 'F';

    const gradeRank: Record<'A+' | 'A' | 'B' | 'C' | 'F', number> = { 'A+': 5, A: 4, B: 3, C: 2, F: 1 };
    const capGrade = (maxGrade: 'A+' | 'A' | 'B' | 'C' | 'F', reason: string) => {
      if (gradeRank[optionsGrade] > gradeRank[maxGrade]) {
        optionsGrade = maxGrade;
        dataConfidenceCaps.push(reason);
      }
    };

    if ((assetType === 'equity' || assetType === 'etf' || assetType === 'index') && dataQuality.freshness !== 'REALTIME') {
      capGrade('B', 'Non-realtime options chain: options grade capped at B');
    }
    if (!dataQuality.hasMeaningfulOI) {
      capGrade('C', 'Weak OI quality: options grade capped at C');
    }

    const shouldGateWait =
      finalDirection === 'neutral' ||
      aiMarketState.tradeQualityGate === 'WAIT' ||
      grade === 'C' || grade === 'F' ||
      optionsGrade === 'C' || optionsGrade === 'F';

    if (shouldGateWait) {
      primaryStrike = null;
      alternativeStrikes = [];
      primaryExpiration = null;
      alternativeExpirations = [];
      strategyRecommendation = {
        strategy: 'WAIT',
        strategyType: 'neutral',
        reason: 'Trade quality/directional gate not met. Wait for stronger alignment.',
        riskProfile: 'defined',
        maxRisk: '0',
        maxReward: '0',
      };
    }
    
    // PRODUCTION FIX: Add confidence caps based on data freshness
    if (dataQuality.freshness === 'EOD') {
      dataConfidenceCaps.push('EOD data - intraday moves not reflected');
    }
    if (dataQuality.freshness === 'STALE') {
      dataConfidenceCaps.push('Stale data - refresh recommended');
    }
    if ((assetType === 'equity' || assetType === 'etf' || assetType === 'index') && dataQuality.optionsChainSource !== 'none') {
      dataConfidenceCaps.push('DTE excludes market holidays (approx.)');
    }
    
    // PRODUCTION FIX: Disclaimer flags for risk events
    // Run earnings check only when relevant (equity/ETF and near-term options focus)
    if ((assetType === 'equity' || assetType === 'etf') && (primaryExpiration?.dte || 999) <= 30) {
      try {
        const earningsCheck = await checkUpcomingEarnings(symbol, 14);
        if (earningsCheck?.hasEarnings) {
          const daysText = earningsCheck.daysUntil === 0 ? 'TODAY' : 
                          earningsCheck.daysUntil === 1 ? 'TOMORROW' :
                          `in ${earningsCheck.daysUntil} days (${earningsCheck.earningsDate})`;
          disclaimerFlags.push(`⚠️ EARNINGS ${daysText} - IV crush risk!`);
          if (earningsCheck.daysUntil && earningsCheck.daysUntil <= 3) {
            executionNotes.push('🔴 CRITICAL: Earnings imminent - undefined IV risk');
          }
        }
      } catch (e) {
        console.warn('Earnings check skipped:', e);
      }
    }
    
    // TODO: Hook into FOMC/CPI calendar
    // if (hasMacroEvent(7)) disclaimerFlags.push('⚠️ FOMC/CPI within 7 days');
    
    // Add execution notes based on market conditions
    const ivRankHeuristic = ivAnalysis?.ivRankHeuristic ?? ivAnalysis?.ivRank ?? 50;
    if (ivAnalysis && ivRankHeuristic > 70) {
      executionNotes.push('High IV - consider credit strategies or wait for pullback');
    }
    if (ivAnalysis && ivRankHeuristic < 30) {
      executionNotes.push('Low IV - debit strategies favorable, consider longer DTE');
    }
    if (openInterestAnalysis && openInterestAnalysis.pcRatio > 1.5) {
      executionNotes.push('Heavy put positioning - contrarian bullish or hedge activity');
    }
    if (openInterestAnalysis && openInterestAnalysis.pcRatio < 0.5) {
      executionNotes.push('Heavy call positioning - contrarian bearish or FOMO activity');
    }
    if (dataQuality.freshness === 'EOD') {
      executionNotes.push('Using EOD data - verify levels at market open');
    }
    if (finalDirection === 'neutral') {
      entryTiming.urgency = 'wait';
      entryTiming.reason = 'Directional edge is weak or conflicted - wait for stronger alignment';
    }

    const professionalTradeStack = buildProfessionalTradeStack(
      effectiveCompositeScore,
      confluenceResult,
      candleCloseConfluence,
      openInterestAnalysis,
      ivAnalysis,
      unusualActivity,
      tradeLevels,
      strategyRecommendation,
      currentPrice
    );

    const locationContext = await buildLocationContext(confluenceResult, symbol, assetType);

    const topPattern = locationContext?.patterns?.[0];
    if (topPattern && finalDirection !== 'neutral') {
      const patternConflicts =
        (finalDirection === 'bullish' && topPattern.bias === 'bearish') ||
        (finalDirection === 'bearish' && topPattern.bias === 'bullish');
      if (patternConflicts) {
        effectiveCompositeScore.conflicts.push(`⚠️ Pattern conflicts direction: ${topPattern.name} (${topPattern.bias})`);
        effectiveCompositeScore.confidence = Math.min(effectiveCompositeScore.confidence, 65);
      }
    }

    const tradeSnapshot = buildTradeSnapshot({
      symbol,
      confluence: confluenceResult,
      finalDirection,
      tradeQuality: grade,
      optionsGrade,
      composite: effectiveCompositeScore,
      entryTiming,
      tradeLevels,
      location: locationContext,
    });
    
    return {
      symbol,
      currentPrice,
      tradeSnapshot,
      locationContext,
      direction: finalDirection,
      confluenceStack: realConfluenceCount,
      decompressingTFs: clusteredDecompressingTFs.length > 0 
        ? clusteredDecompressingTFs 
        : decompression.decompressions.filter(d => d.isDecompressing).map(d => d.tf),
      pullBias: decompression.pullBias,
      signalStrength,
      tradeQuality: grade,
      qualityReasons,
      primaryStrike,
      alternativeStrikes,
      primaryExpiration,
      alternativeExpirations,
      openInterestAnalysis,
      greeksAdvice,
      maxRiskPercent,
      stopLossStrategy,
      profitTargetStrategy,
      entryTiming,
      // PRO TRADER FEATURES
      ivAnalysis,
      unusualActivity,
      expectedMove,
      tradeLevels,
      compositeScore: effectiveCompositeScore,
      strategyRecommendation,
      candleCloseConfluence,
      // INSTITUTIONAL AI MARKET STATE
      aiMarketState,
      professionalTradeStack,
      // PRODUCTION ADDITIONS - Data Quality & Compliance
      assetType,
      optionsQualityScore,
      optionsGrade,
      dataQuality,
      executionNotes,
      dataConfidenceCaps,
      disclaimerFlags,
    };
  }
  
  /**
   * Calculate theoretical P/L for an options setup
   */
  calculateTheoreticalPL(
    setup: OptionsSetup,
    strikeRec: StrikeRecommendation,
    expRec: ExpirationRecommendation,
    estimatedPremium: number,
    targetPrice: number
  ): {
    maxProfit: number;
    maxLoss: number;
    breakeven: number;
    targetReturn: number;
    targetReturnPercent: number;
  } {
    const { currentPrice } = setup;
    const isCall = strikeRec.type === 'call';
    const strike = strikeRec.strike;
    
    // At target price, what's the intrinsic value?
    const intrinsicAtTarget = isCall
      ? Math.max(0, targetPrice - strike)
      : Math.max(0, strike - targetPrice);
    
    // Rough extrinsic decay estimate
    const thetaDecayFactor = Math.max(0.5, 1 - (expRec.dte <= 3 ? 0.3 : 0.15));
    const estimatedValueAtTarget = intrinsicAtTarget + (estimatedPremium * thetaDecayFactor * 0.5);
    
    const maxLoss = estimatedPremium * 100; // Per contract
    const breakeven = isCall ? strike + estimatedPremium : strike - estimatedPremium;
    const targetReturn = (estimatedValueAtTarget - estimatedPremium) * 100;
    const targetReturnPercent = ((estimatedValueAtTarget - estimatedPremium) / estimatedPremium) * 100;
    
    // Theoretical max profit (unlimited for calls, strike - premium for puts)
    const maxProfit = isCall ? Infinity : (strike - estimatedPremium) * 100;
    
    return {
      maxProfit,
      maxLoss,
      breakeven,
      targetReturn,
      targetReturnPercent,
    };
  }
}

// Export singleton instance
export const optionsAnalyzer = new OptionsConfluenceAnalyzer();
