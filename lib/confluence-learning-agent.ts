/**
 * Confluence Learning Agent v2
 * 
 * Key Improvements:
 * 1. Scans FULL history for confluence events
 * 2. Tracks DECOMPRESSION timing - how long after TF close does price move?
 * 3. Learns per-symbol patterns and stores in database
 * 4. Predicts UPCOMING confluence windows, not just current state
 * 5. Analyzes 50% level interactions (bounce/break/wick)
 */

import OpenAI from 'openai';
import { q } from '@/lib/db';
import { getOHLC, getPriceBySymbol, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { avTakeToken } from '@/lib/avRateGovernor';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TimeframeConfig {
  tf: string;
  label: string;
  minutes: number;
  postCloseWindow: number;  // Minutes after close to watch
  preCloseStart?: number;   // Minutes before close (anticipatory)
  preCloseEnd?: number;
  decompStart?: number;     // Minutes before close when decompression starts (candles gravitate to 50%)
}

interface DecompressionEvent {
  tf: string;
  closeTime: number;
  closePrice: number;
  mid50Level: number;
  distanceToMid50: number;        // % distance at close
  
  // Decompression metrics
  decompressionStartBar: number;  // How many bars after close
  decompressionStartMins: number; // How many minutes after close
  decompressionDirection: 'up' | 'down' | 'sideways';
  decompressionMagnitude: number; // % move from close price
  
  // 50% level interaction
  touchedMid50: boolean;
  mid50Action: 'bounce' | 'break' | 'wick' | 'none';
  
  // Final outcome
  outcome8Bars: { direction: 'up' | 'down' | 'sideways'; magnitude: number };
  outcome24Bars: { direction: 'up' | 'down' | 'sideways'; magnitude: number };
}

interface ConfluenceEvent {
  timestamp: number;
  price: number;
  stack: number;
  activeTFs: string[];
  isHotZone: boolean;
  clusters: number;
  
  // What happened after
  decompressions: DecompressionEvent[];
  overallOutcome: {
    direction: 'up' | 'down' | 'sideways';
    magnitude: number;
    barsToSignificantMove: number;
  };
}

interface SymbolLearning {
  symbol: string;
  lastUpdated: number;
  totalEvents: number;
  
  // Per-TF decompression stats
  tfDecompressionStats: Map<string, {
    avgDecompBars: number;
    avgDecompMins: number;
    upPct: number;
    downPct: number;
    avgMagnitude: number;
    mid50BounceRate: number;
    mid50BreakRate: number;
  }>;
  
  // Stack-based outcomes
  stackOutcomes: Map<number, {
    count: number;
    upPct: number;
    downPct: number;
    avgMagnitude: number;
    avgBarsToMove: number;
  }>;
  
  // Hot zone specific
  hotZoneStats: {
    count: number;
    upPct: number;
    downPct: number;
    avgMagnitude: number;
    avgDecompMins: number;
  };
  
  // Cluster stats
  clusterStats: {
    withCluster: { upPct: number; avgMag: number; count: number };
    withoutCluster: { upPct: number; avgMag: number; count: number };
  };
}

interface Prediction {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  expectedDecompMins: number;     // When price should start moving
  targetPrice: number;
  stopLoss: number;
  timeHorizon: string;
  reasoning: string;
}

interface FullForecast {
  symbol: string;
  timestamp: number;
  currentPrice: number;
  
  // Current state
  currentState: {
    stack: number;
    activeTFs: string[];
    isHotZone: boolean;
    hotZoneTFs: string[];
    clusters: number;
    mid50Levels: { tf: string; level: number; distance: number }[];
    nearestMid50: { tf: string; level: number; distance: number } | null;
    // Decompression pull analysis
    decompression?: {
      activeCount: number;
      netPullDirection: 'bullish' | 'bearish' | 'neutral';
      pullBias: number;
      activeTFs: { tf: string; minsToClose: number; mid50Level: number; pullDirection: 'up' | 'down' | 'none' }[];
    };
  };
  
  // Upcoming events
  upcoming: {
    nextConfluenceIn: number;        // Minutes until next high-stack window
    upcomingTFCloses: { tf: string; minsAway: number }[];
    nextHotZoneIn: number | null;    // Minutes until next hot zone
  };
  
  // Learning-based prediction
  prediction: Prediction;
  
  // Historical context
  historical: {
    similarEvents: number;
    winRate: number;
    avgMoveAfterSimilar: number;
    avgDecompMins: number;
    typicalMid50Reaction: string;
  };
  
  // AI narrative
  aiAnalysis: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Matches Pine Script exactly
// ═══════════════════════════════════════════════════════════════════════════

const TIMEFRAMES: TimeframeConfig[] = [
  // Micro/Scalping
  { tf: '5',   label: '5m',  minutes: 5,   postCloseWindow: 3,  decompStart: 1 },
  { tf: '10',  label: '10m', minutes: 10,  postCloseWindow: 5,  decompStart: 1.5 },
  { tf: '15',  label: '15m', minutes: 15,  postCloseWindow: 7,  decompStart: 2 },
  // Intraday
  { tf: '30',  label: '30m', minutes: 30,  postCloseWindow: 10, decompStart: 4 },
  { tf: '60',  label: '1h',  minutes: 60,  postCloseWindow: 15, decompStart: 9 },
  { tf: '120', label: '2h',  minutes: 120, postCloseWindow: 20, decompStart: 12 },
  { tf: '180', label: '3h',  minutes: 180, postCloseWindow: 25, preCloseStart: 25, preCloseEnd: 20, decompStart: 15 },
  { tf: '240', label: '4h',  minutes: 240, postCloseWindow: 25, preCloseStart: 25, preCloseEnd: 20, decompStart: 12 },
  { tf: '360', label: '6h',  minutes: 360, postCloseWindow: 30, preCloseStart: 30, preCloseEnd: 25, decompStart: 20 },
  { tf: '480', label: '8h',  minutes: 480, postCloseWindow: 35, preCloseStart: 35, preCloseEnd: 30, decompStart: 20 },
  // Daily - ALL day cycles (1D through 7D)
  { tf: 'D',   label: '1D',  minutes: 1440,  postCloseWindow: 60,  decompStart: 60 },
  { tf: '2D',  label: '2D',  minutes: 2880,  postCloseWindow: 90,  decompStart: 120 },
  { tf: '3D',  label: '3D',  minutes: 4320,  postCloseWindow: 120, decompStart: 180 },
  { tf: '4D',  label: '4D',  minutes: 5760,  postCloseWindow: 150, decompStart: 240 },
  { tf: '5D',  label: '5D',  minutes: 7200,  postCloseWindow: 180, decompStart: 300 },
  { tf: '6D',  label: '6D',  minutes: 8640,  postCloseWindow: 210, decompStart: 360 },
  { tf: '7D',  label: '7D',  minutes: 10080, postCloseWindow: 240, decompStart: 390 },
  // Weekly - ALL week cycles (1W through 4W)
  { tf: 'W',   label: '1W',  minutes: 10080, postCloseWindow: 240, decompStart: 390 },
  { tf: '2W',  label: '2W',  minutes: 20160, postCloseWindow: 480, decompStart: 780 },
  { tf: '3W',  label: '3W',  minutes: 30240, postCloseWindow: 600, decompStart: 1170 },
  { tf: '4W',  label: '4W',  minutes: 40320, postCloseWindow: 720, decompStart: 1560 },
  // Monthly - ALL month cycles (1M through 12M)
  { tf: 'M',   label: '1M',  minutes: 43200,  postCloseWindow: 720,  decompStart: 1560 },
  { tf: '2M',  label: '2M',  minutes: 86400,  postCloseWindow: 1080, decompStart: 3120 },
  { tf: '3M',  label: '3M',  minutes: 129600, postCloseWindow: 1440, decompStart: 4680 },
  { tf: '4M',  label: '4M',  minutes: 172800, postCloseWindow: 1800, decompStart: 6240 },
  { tf: '5M',  label: '5M',  minutes: 216000, postCloseWindow: 1980, decompStart: 7800 },
  { tf: '6M',  label: '6M',  minutes: 259200, postCloseWindow: 2160, decompStart: 9360 },
  { tf: '7M',  label: '7M',  minutes: 302400, postCloseWindow: 2340, decompStart: 10920 },
  { tf: '8M',  label: '8M',  minutes: 345600, postCloseWindow: 2520, decompStart: 12480 },
  { tf: '9M',  label: '9M',  minutes: 388800, postCloseWindow: 2700, decompStart: 14040 },
  { tf: '10M', label: '10M', minutes: 432000, postCloseWindow: 2880, decompStart: 15600 },
  { tf: '11M', label: '11M', minutes: 475200, postCloseWindow: 3060, decompStart: 17160 },
  { tf: '12M', label: '1Y',  minutes: 525600, postCloseWindow: 2880, decompStart: 18720 },
];

// ═══════════════════════════════════════════════════════════════════════════
// SCAN MODES - Hierarchical scanning with all TFs below
// ═══════════════════════════════════════════════════════════════════════════

export type ScanMode = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';

interface ScanModeConfig {
  mode: ScanMode;
  label: string;
  description: string;
  primaryTF: string;           // The main timeframe for this scan
  maxTFMinutes: number;        // Include all TFs up to this size
  minConfluence: number;       // Minimum TFs for signal
}

const SCAN_MODES: ScanModeConfig[] = [
  // Scalping - 5m, 10m, 15m scans (include all micro TFs)
  { mode: 'scalping', label: '⚡ Scalping (5-15m)', description: 'Micro TF decompression for quick trades', primaryTF: '15m', maxTFMinutes: 15, minConfluence: 2 },
  
  // Intraday - 30m, 1H, 4H scans (include scalping + intraday)
  { mode: 'intraday_30m', label: '📊 30min Scan', description: '30m + all micro TFs', primaryTF: '30m', maxTFMinutes: 30, minConfluence: 3 },
  { mode: 'intraday_1h', label: '📊 1 Hour Scan', description: '1H + all TFs below', primaryTF: '1h', maxTFMinutes: 60, minConfluence: 3 },
  { mode: 'intraday_4h', label: '📊 4 Hour Scan', description: '4H + all TFs below', primaryTF: '4h', maxTFMinutes: 240, minConfluence: 4 },
  
  // Swing - 1D, 3D, 1W scans (include intraday + daily)
  { mode: 'swing_1d', label: '📅 Daily Scan', description: '1D + all intraday TFs', primaryTF: '1D', maxTFMinutes: 1440, minConfluence: 5 },
  { mode: 'swing_3d', label: '📅 3-Day Scan', description: '3D + daily + intraday', primaryTF: '3D', maxTFMinutes: 4320, minConfluence: 5 },
  { mode: 'swing_1w', label: '📅 Weekly Scan', description: '1W + all daily TFs', primaryTF: '1W', maxTFMinutes: 10080, minConfluence: 6 },
  
  // Macro - Monthly, Quarterly, Yearly
  { mode: 'macro_monthly', label: '🏛️ Monthly Macro', description: 'Monthly + weekly + daily', primaryTF: '1M', maxTFMinutes: 43200, minConfluence: 6 },
  { mode: 'macro_yearly', label: '🏛️ Yearly Macro', description: 'Yearly + quarterly + monthly', primaryTF: '1Y', maxTFMinutes: 525600, minConfluence: 7 },
];

export function getScanModes(): ScanModeConfig[] {
  return SCAN_MODES;
}

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function normalizeCryptoBase(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.includes('/')) return upper.split('/')[0];
  return upper.replace(/USDT$/, '').replace(/USD$/, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// DECOMPRESSION PULL ANALYSIS
// When candles decompress toward their 50% level, they "pull" price
// ═══════════════════════════════════════════════════════════════════════════

interface DecompressionPull {
  tf: string;
  isDecompressing: boolean;
  minsToClose: number;
  mid50Level: number;
  pullDirection: 'up' | 'down' | 'none';  // Is 50% above or below current price?
  pullStrength: number;                    // 1-10 based on proximity to close and TF weight
  distanceToMid50: number;                 // % distance
}

// Temporal Cluster - TFs that close together within a time window
interface TemporalCluster {
  clusterCenter: number;       // Minutes to cluster center
  timeframes: string[];        // TFs in this cluster
  count: number;              // Number of TFs
  intensity: 'low' | 'moderate' | 'strong' | 'very_strong' | 'explosive';
  score: number;              // 0-100
}

interface DecompressionAnalysis {
  decompressions: DecompressionPull[];
  activeCount: number;                     // LEGACY: All TFs in decompression window
  
  // NEW: Temporal Clustering (the REAL confluence)
  temporalCluster: TemporalCluster;        // Main cluster of TFs closing together
  clusteredCount: number;                  // TFs actually closing together (within ±5 min)
  clusteringRatio: number;                 // What % of active TFs are clustered (quality metric)
  
  netPullDirection: 'bullish' | 'bearish' | 'neutral';
  netPullStrength: number;                 // Aggregate pull strength
  pullBias: number;                        // -100 to +100 (negative=bearish, positive=bullish)
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HIERARCHICAL SCAN RESULT
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// CANDLE CLOSE CONFLUENCE - Temporal alignment of multiple timeframe closes
// ═══════════════════════════════════════════════════════════════════════════

export interface CandleCloseConfluence {
  // Current close confluence window
  closingNow: {
    count: number;              // How many TFs closing within next 5 mins
    timeframes: string[];       // Which TFs
    highestTF: string | null;   // The highest TF in the window (monthly > weekly > daily)
    isRare: boolean;            // True if monthly+ closing with other TFs
  };
  
  // Near-term confluence (next 1-4 hours)
  closingSoon: {
    count: number;              // TFs closing in next 1-4 hours
    timeframes: { tf: string; minsAway: number; weight: number }[];
    peakConfluenceIn: number;   // Minutes until most TFs close together
    peakCount: number;          // How many TFs close at peak
  };
  
  // Special events
  specialEvents: {
    isMonthEnd: boolean;
    isWeekEnd: boolean;
    isQuarterEnd: boolean;
    isYearEnd: boolean;
    sessionClose: 'ny' | 'london' | 'asia' | 'none';
  };
  
  // Confluence score (0-100)
  confluenceScore: number;
  confluenceRating: 'extreme' | 'high' | 'moderate' | 'low' | 'none';
  
  // Best entry window
  bestEntryWindow: {
    startMins: number;          // Minutes from now to start watching
    endMins: number;            // Minutes from now - optimal entry window
    reason: string;
  };
}

export interface ScanCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface HierarchicalScanResult {
  mode: ScanMode;
  modeLabel: string;
  primaryTF: string;
  currentPrice: number;
  isLivePrice: boolean;  // True if fetched from real-time quote, false if from last bar
  
  // All TFs included in this scan
  includedTFs: string[];
  
  // Decompression analysis for included TFs only
  decompression: DecompressionAnalysis;
  
  // 50% levels for included TFs
  mid50Levels: { tf: string; level: number; distance: number; isDecompressing: boolean }[];
  
  // Clustered 50% levels (within ATR)
  clusters: { levels: number[]; tfs: string[]; avgLevel: number }[];
  
  // NEW: Candle Close Confluence - when multiple TFs close together
  candleCloseConfluence: CandleCloseConfluence;
  
  // Prediction
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reasoning: string;
    targetLevel: number;        // Nearest clustered 50% or strongest pull
    expectedMoveTime: string;   // When we expect the move
  };
  
  // Trade Setup (based on strategy settings: Swing stop, 2.5 R:R target)
  tradeSetup: {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    riskPercent: number;        // % risk from entry to stop
    rewardPercent: number;      // % reward from entry to target
  };
  
  // Signal quality
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Formalized Score Breakdown (makes confidence defensible)
  // ═══════════════════════════════════════════════════════════════════════════
  scoreBreakdown: {
    // A) Direction Score (-100 to +100)
    directionScore: number;           // Weighted by TF hierarchy
    
    // B) Cluster Score (0-100) - How time-aligned are the signals?
    clusterScore: number;
    dominantClusterRatio: number;     // % of active TFs in main cluster
    
    // C) Decompression Score (0-100) - Weighted avg confidence
    decompressionScore: number;
    
    // Final Confidence = 0.55*clusterScore + 0.45*decompressionScore
    // Direction comes from directionScore only
    
    // Gates for signal strength
    activeTFs: number;
    hasHigherTF: boolean;             // At least one TF >= 1h active
    
    // Banners (deterministic rules)
    banners: string[];                // e.g., "MEGA CONFLUENCE", "EXTREME BULLISH"
  };

  // Used by pattern engine and structure modules
  candlesByTf?: Record<string, ScanCandle[]>;

  // Optional structure layer for downstream scoring/UX
  structure?: {
    zones: { type: 'supply' | 'demand'; top: number; bottom: number; tf: string; strength: number }[];
    patterns: { name: string; tf: string; bias: 'bullish' | 'bearish'; confidence: number }[];
    structureScore: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN AGENT CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ConfluenceLearningAgent {
  private openai: OpenAI;
  private learningCache: Map<string, SymbolLearning> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private async getLearningStats(symbol: string): Promise<{
    total_predictions: number;
    win_rate: number;
    avg_move_pct: number;
    avg_time_to_move_mins: number;
  } | null> {
    if (!process.env.DATABASE_URL) return null;
    try {
      const rows = await q<{ total_predictions: number; win_rate: number; avg_move_pct: number; avg_time_to_move_mins: number }>(
        'SELECT total_predictions, win_rate, avg_move_pct, avg_time_to_move_mins FROM learning_stats WHERE symbol = $1',
        [symbol]
      );
      return rows[0] || null;
    } catch (err) {
      console.warn('Learning stats fetch failed:', err);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch LIVE real-time price using GLOBAL_QUOTE or Crypto Exchange Rate
   */
  async fetchLivePrice(symbol: string): Promise<number | null> {
    const isCrypto = symbol.includes('USD') && !symbol.includes('/');
    
    try {
      if (isCrypto) {
        const base = normalizeCryptoBase(symbol);
        const price = await getPriceBySymbol(base);
        if (price?.price != null && Number.isFinite(price.price)) {
          return price.price;
        }
      } else {
        // Use delayed entitlement for stock data (realtime)
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;
        await avTakeToken();
        const response = await fetch(url);
        const data = await response.json();
        
        // Handle both realtime and delayed response formats
        const globalQuote = data['Global Quote'] || data['Global Quote - DATA DELAYED BY 15 MINUTES'];
        if (globalQuote && globalQuote['05. price']) {
          return parseFloat(globalQuote['05. price']);
        }
      }
    } catch (err) {
      console.warn('Live price fetch failed:', err);
    }
    
    return null;
  }

  async fetchHistoricalData(symbol: string, interval: string = '30min'): Promise<OHLCV[]> {
    const isCrypto = symbol.includes('USD') && !symbol.includes('/');
    
    if (isCrypto) {
      const base = normalizeCryptoBase(symbol);
      const coinId = COINGECKO_ID_MAP[base] || await resolveSymbolToId(base);
      if (!coinId) {
        console.error('No CoinGecko coin id resolved for', symbol);
        return [];
      }

      const days: 1 | 7 | 14 | 30 = interval === '1min' || interval === '5min' ? 1 : 7;
      const ohlc = await getOHLC(coinId, days);
      if (!ohlc || ohlc.length === 0) return [];

      return ohlc
        .map((row) => ({
          time: Number(row[0]),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: 0,
        }))
        .filter((bar) => Number.isFinite(bar.time) && Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
        .sort((a, b) => a.time - b.time);
    }

    // Use delayed entitlement for stock data (realtime)
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&outputsize=full&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;

    await avTakeToken();
    const response = await fetch(url);
    const data = await response.json();

    // Check for AV rate-limit / premium notices
    const avNote = data?.Note || data?.Information;
    const avErr = data?.['Error Message'];
    if (avNote) {
      console.warn(`[confluence] AV rate limit for ${symbol}:`, String(avNote).substring(0, 120));
      throw new Error(`API rate limit reached. Please wait a moment and retry.`);
    }
    if (avErr) {
      console.error(`[confluence] AV error for ${symbol}:`, avErr);
      throw new Error(`Symbol "${symbol}" not recognised by data provider. Check the ticker and try again.`);
    }

    let timeSeriesKey = Object.keys(data).find(k => k.includes('Time Series'));
    let timeSeries = timeSeriesKey ? data[timeSeriesKey] : null;
    
    // Fallback to daily data if intraday is not available (common for smaller ETFs)
    if (!timeSeries && !isCrypto) {
      console.log(`⚠️ No intraday data for ${symbol}, falling back to daily data`);
      await avTakeToken();
      const dailyUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;
      const dailyResponse = await fetch(dailyUrl);
      const dailyData = await dailyResponse.json();

      // Check daily fallback for AV errors too
      const dailyNote = dailyData?.Note || dailyData?.Information;
      const dailyErr = dailyData?.['Error Message'];
      if (dailyNote) {
        console.warn(`[confluence] AV rate limit (daily fallback) for ${symbol}:`, String(dailyNote).substring(0, 120));
        throw new Error(`API rate limit reached. Please wait a moment and retry.`);
      }
      if (dailyErr) {
        console.error(`[confluence] AV error (daily fallback) for ${symbol}:`, dailyErr);
        throw new Error(`Symbol "${symbol}" not recognised by data provider. Check the ticker and try again.`);
      }
      
      timeSeriesKey = Object.keys(dailyData).find(k => k.includes('Time Series'));
      timeSeries = timeSeriesKey ? dailyData[timeSeriesKey] : null;
      
      if (!timeSeries) {
        console.error('No intraday or daily data returned for', symbol, dailyData);
        return [];
      }
    } else if (!timeSeries) {
      console.error('No data returned:', data);
      return [];
    }

    const bars: OHLCV[] = [];

    for (const [timestamp, values] of Object.entries(timeSeries)) {
      const v = values as Record<string, string>;
      bars.push({
        time: new Date(timestamp).getTime(),
        open: parseFloat(v['1. open']),
        high: parseFloat(v['2. high']),
        low: parseFloat(v['3. low']),
        close: parseFloat(v['4. close']),
        volume: parseFloat(v['5. volume'] || v['6. volume'] || '0'),
      });
    }

    return bars.sort((a, b) => a.time - b.time);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESAMPLING - Convert base bars to higher timeframes
  // ═══════════════════════════════════════════════════════════════════════════

  resampleBars(bars: OHLCV[], tfMinutes: number): OHLCV[] {
    if (bars.length === 0) return [];
    
    const tfMs = tfMinutes * 60 * 1000;
    const resampled: OHLCV[] = [];
    let currentBar: OHLCV | null = null;

    for (const bar of bars) {
      const periodStart = Math.floor(bar.time / tfMs) * tfMs;
      
      if (!currentBar || currentBar.time !== periodStart) {
        if (currentBar) resampled.push(currentBar);
        currentBar = { ...bar, time: periodStart };
      } else {
        currentBar.high = Math.max(currentBar.high, bar.high);
        currentBar.low = Math.min(currentBar.low, bar.low);
        currentBar.close = bar.close;
        currentBar.volume += bar.volume;
      }
    }
    
    if (currentBar) resampled.push(currentBar);
    return resampled;
  }

  // Get HL2 (midpoint) of a bar
  hl2(bar: OHLCV): number {
    return (bar.high + bar.low) / 2;
  }

  private normalizeBars(bars: OHLCV[]): ScanCandle[] {
    return (bars || []).map((bar) => ({
      ts: Number(bar.time),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume),
    }));
  }

  // Get previous bar's 50% level
  getPriorMid50(resampledBars: OHLCV[], atIndex: number): number | null {
    if (atIndex < 1 || atIndex >= resampledBars.length) return null;
    return this.hl2(resampledBars[atIndex - 1]);
  }

  // Calculate ATR
  calculateATR(bars: OHLCV[], period: number = 14): number {
    if (bars.length < period + 1) return 0;
    let atr = 0;
    for (let i = bars.length - period; i < bars.length; i++) {
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - (bars[i - 1]?.close || bars[i].open)),
        Math.abs(bars[i].low - (bars[i - 1]?.close || bars[i].open))
      );
      atr += tr;
    }
    return atr / period;
  }

  private getNYDateTimeParts(date: Date): {
    year: number;
    month: number;
    day: number;
    dayOfWeek: number;
    hour: number;
    minute: number;
  } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const value = (type: string): string => parts.find((p) => p.type === type)?.value || '';
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      year: Number(value('year')),
      month: Number(value('month')) - 1,
      day: Number(value('day')),
      dayOfWeek: weekdayMap[value('weekday')] ?? date.getUTCDay(),
      hour: Number(value('hour')),
      minute: Number(value('minute')),
    };
  }

  private getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const value = (type: string): string => parts.find((p) => p.type === type)?.value || '0';
    const asUtcMs = Date.UTC(
      Number(value('year')),
      Number(value('month')) - 1,
      Number(value('day')),
      Number(value('hour')),
      Number(value('minute')),
      Number(value('second'))
    );

    return Math.round((asUtcMs - date.getTime()) / 60000);
  }

  private getNYMarketCloseUtcMs(year: number, month: number, day: number): number {
    const noonUtc = new Date(Date.UTC(year, month, day, 12, 0, 0));
    const nyOffsetMins = this.getTimezoneOffsetMinutes(noonUtc, 'America/New_York');
    return Date.UTC(year, month, day, 16, 0, 0) - nyOffsetMins * 60 * 1000;
  }

  private getCanonicalTimeframeId(tfConfig: Pick<TimeframeConfig, 'tf' | 'label'>): string {
    const rawTf = (tfConfig.tf || '').toUpperCase();
    if (rawTf === 'D') return '1D';
    if (rawTf === 'W') return '1W';
    if (rawTf === 'M') return '1M';
    if (rawTf === '12M') return '1Y';
    if (rawTf) return rawTf;

    const rawLabel = (tfConfig.label || '').toUpperCase();
    if (rawLabel === 'D') return '1D';
    if (rawLabel === 'W') return '1W';
    if (rawLabel === 'M') return '1M';
    return rawLabel;
  }

  private isUsEquityMarketOpen(now: Date): boolean {
    const nyNow = this.getNYDateTimeParts(now);
    if (nyNow.dayOfWeek === 0 || nyNow.dayOfWeek === 6) return false;

    const mins = nyNow.hour * 60 + nyNow.minute;
    const openMins = 9 * 60 + 30;
    const closeMins = 16 * 60;
    return mins >= openMins && mins < closeMins;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDLE CLOSE TIME CALCULATION (Calendar-based)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate minutes until a specific timeframe candle closes.
   * KEY INSIGHT: All timeframes close at MARKET CLOSE (21:00 UTC) on their cycle end day.
   * So 1D, 3D, W, M can all close at the SAME minute if today is the end of their cycles.
   */
  getMinutesToTimeframeClose(now: Date, tfConfig: Pick<TimeframeConfig, 'tf' | 'label' | 'minutes'>): number | null {
    const currentTime = now.getTime();
    
    // For intraday TFs (5m to 8h), use minute-based periods
    if (tfConfig.minutes <= 480) { // 8 hours or less
      const tfMs = tfConfig.minutes * 60 * 1000;
      const periodEnd = Math.ceil(currentTime / tfMs) * tfMs;
      return Math.floor((periodEnd - currentTime) / 60000);
    }
    
    // For daily and above, all closes are anchored to NY market close (4:00 PM ET, DST-aware)
    const nyNow = this.getNYDateTimeParts(now);
    const year = nyNow.year;
    const month = nyNow.month;
    const date = nyNow.day;
    const dayOfWeek = nyNow.dayOfWeek;
    const tfId = this.getCanonicalTimeframeId(tfConfig);

    const closeAt = (targetYear: number, targetMonth: number, targetDate: number): Date =>
      new Date(this.getNYMarketCloseUtcMs(targetYear, targetMonth, targetDate));

    // Today's market close time
    const todayClose = closeAt(year, month, date);
    const todayCloseMs = todayClose.getTime();
    const minsToTodayClose = Math.floor((todayCloseMs - currentTime) / 60000);
    
    // Helper: calculate days since a reference epoch for multi-day cycles
    // Using Jan 1, 2020 as epoch (a Wednesday, but we'll adjust)
    const epochMs = Date.UTC(2020, 0, 1, 0, 0, 0);
    const daysSinceEpoch = Math.floor((currentTime - epochMs) / (24 * 60 * 60 * 1000));
    
    // Helper: get week number since epoch
    const weeksSinceEpoch = Math.floor(daysSinceEpoch / 7);
    
    switch (tfId) {
      case '1D': {
        // Daily ALWAYS closes today at market close (if market is open)
        // Skip weekends for traditional markets
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          // Weekend - next close is Monday
          const daysToMonday = dayOfWeek === 0 ? 1 : 2;
          const mondayClose = closeAt(year, month, date + daysToMonday);
          return Math.floor((mondayClose.getTime() - currentTime) / 60000);
        }
        if (currentTime >= todayCloseMs) {
          // Past today's close, next is tomorrow (or Monday)
          const nextDay = dayOfWeek === 5 ? 3 : 1; // Friday -> Monday, else tomorrow
          const nextClose = closeAt(year, month, date + nextDay);
          return Math.floor((nextClose.getTime() - currentTime) / 60000);
        }
        return minsToTodayClose;
      }
      
      case '2D': {
        // 2-Day candle: closes every 2nd trading day
        const cycleDay = daysSinceEpoch % 2;
        const is2DCloseDay = cycleDay === 1; // Day 2 of cycle
        if (is2DCloseDay && currentTime < todayCloseMs) {
          return minsToTodayClose; // Closes today!
        }
        const daysToNext = (2 - cycleDay) % 2 || 2;
        const nextClose = closeAt(year, month, date + daysToNext);
        return Math.floor((nextClose.getTime() - currentTime) / 60000);
      }
      
      case '3D': {
        // 3-Day candle: closes every 3rd day
        const cycleDay = daysSinceEpoch % 3;
        const is3DCloseDay = cycleDay === 2; // Day 3 of cycle (0-indexed = 2)
        if (is3DCloseDay && currentTime < todayCloseMs) {
          return minsToTodayClose; // Closes today!
        }
        const daysToNext = (3 - cycleDay) % 3 || 3;
        const nextClose = closeAt(year, month, date + daysToNext);
        return Math.floor((nextClose.getTime() - currentTime) / 60000);
      }
      
      case '4D': {
        // 4-Day candle: closes every 4th day
        const cycleDay = daysSinceEpoch % 4;
        const is4DCloseDay = cycleDay === 3; // Day 4 of cycle
        if (is4DCloseDay && currentTime < todayCloseMs) {
          return minsToTodayClose;
        }
        const daysToNext = (4 - cycleDay) % 4 || 4;
        const nextClose = closeAt(year, month, date + daysToNext);
        return Math.floor((nextClose.getTime() - currentTime) / 60000);
      }
      
      case '5D': {
        // 5-Day candle: closes every 5th day
        const cycleDay = daysSinceEpoch % 5;
        const is5DCloseDay = cycleDay === 4; // Day 5 of cycle
        if (is5DCloseDay && currentTime < todayCloseMs) {
          return minsToTodayClose;
        }
        const daysToNext = (5 - cycleDay) % 5 || 5;
        const nextClose = closeAt(year, month, date + daysToNext);
        return Math.floor((nextClose.getTime() - currentTime) / 60000);
      }
      
      case '6D': {
        // 6-Day candle: closes every 6th day
        const cycleDay = daysSinceEpoch % 6;
        const is6DCloseDay = cycleDay === 5; // Day 6 of cycle
        if (is6DCloseDay && currentTime < todayCloseMs) {
          return minsToTodayClose;
        }
        const daysToNext = (6 - cycleDay) % 6 || 6;
        const nextClose = closeAt(year, month, date + daysToNext);
        return Math.floor((nextClose.getTime() - currentTime) / 60000);
      }
      
      case '7D': {
        // 7-Day candle: closes every 7th day (calendar week, not trading week)
        const cycleDay = daysSinceEpoch % 7;
        const is7DCloseDay = cycleDay === 6; // Day 7 of cycle
        if (is7DCloseDay && currentTime < todayCloseMs) {
          return minsToTodayClose;
        }
        const daysToNext = (7 - cycleDay) % 7 || 7;
        const nextClose = closeAt(year, month, date + daysToNext);
        return Math.floor((nextClose.getTime() - currentTime) / 60000);
      }
      
      case '1W': {
        // Weekly (trading week) closes on FRIDAY at market close
        const isFriday = dayOfWeek === 5;
        if (isFriday && currentTime < todayCloseMs) {
          return minsToTodayClose; // Closes today!
        }
        // Days until next Friday
        let daysToFriday = (5 - dayOfWeek + 7) % 7;
        if (daysToFriday === 0 && currentTime >= todayCloseMs) daysToFriday = 7;
        const fridayClose = closeAt(year, month, date + daysToFriday);
        return Math.floor((fridayClose.getTime() - currentTime) / 60000);
      }
      
      case '2W': {
        // 2-Week: closes every OTHER Friday
        const isFriday = dayOfWeek === 5;
        const is2WCloseFriday = weeksSinceEpoch % 2 === 0;
        if (isFriday && is2WCloseFriday && currentTime < todayCloseMs) {
          return minsToTodayClose; // Closes today!
        }
        // Find next 2W Friday
        let daysToFriday = (5 - dayOfWeek + 7) % 7;
        if (daysToFriday === 0) daysToFriday = 7;
        let weeksToAdd = 0;
        const nextFridayWeek = Math.floor((daysSinceEpoch + daysToFriday) / 7);
        if (nextFridayWeek % 2 !== 0) weeksToAdd = 7;
        const targetClose = closeAt(year, month, date + daysToFriday + weeksToAdd);
        return Math.floor((targetClose.getTime() - currentTime) / 60000);
      }
      
      case '3W': {
        // 3-Week: closes every 3rd Friday
        const isFriday = dayOfWeek === 5;
        const is3WCloseFriday = weeksSinceEpoch % 3 === 0;
        if (isFriday && is3WCloseFriday && currentTime < todayCloseMs) {
          return minsToTodayClose;
        }
        let daysToFriday = (5 - dayOfWeek + 7) % 7;
        if (daysToFriday === 0) daysToFriday = 7;
        const weeksUntil3W = (3 - (weeksSinceEpoch % 3)) % 3;
        const targetClose = closeAt(year, month, date + daysToFriday + (weeksUntil3W * 7));
        return Math.floor((targetClose.getTime() - currentTime) / 60000);
      }
      
      case '4W': {
        // 4-Week: closes every 4th Friday
        const isFriday = dayOfWeek === 5;
        const is4WCloseFriday = weeksSinceEpoch % 4 === 0;
        if (isFriday && is4WCloseFriday && currentTime < todayCloseMs) {
          return minsToTodayClose;
        }
        let daysToFriday = (5 - dayOfWeek + 7) % 7;
        if (daysToFriday === 0) daysToFriday = 7;
        const weeksUntil4W = (4 - (weeksSinceEpoch % 4)) % 4;
        const targetClose = closeAt(year, month, date + daysToFriday + (weeksUntil4W * 7));
        return Math.floor((targetClose.getTime() - currentTime) / 60000);
      }
      
      case '1M': {
        // Monthly: closes LAST TRADING DAY of month at market close
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let lastTradingDay = daysInMonth;
        // Adjust for weekends (find last weekday)
        const lastDayOfMonth = new Date(Date.UTC(year, month, daysInMonth));
        const lastDayDOW = lastDayOfMonth.getUTCDay();
        if (lastDayDOW === 0) lastTradingDay -= 2; // Sunday -> Friday
        else if (lastDayDOW === 6) lastTradingDay -= 1; // Saturday -> Friday
        
        const isMonthEnd = date === lastTradingDay;
        if (isMonthEnd && currentTime < todayCloseMs) {
          return minsToTodayClose; // Monthly closes TODAY!
        }
        // Find next month end
        let targetMonth = month;
        let targetYear = year;
        if (date >= lastTradingDay) {
          targetMonth++;
          if (targetMonth > 11) { targetMonth = 0; targetYear++; }
        }
        const nextMonthDays = new Date(targetYear, targetMonth + 1, 0).getDate();
        let nextLastTradingDay = nextMonthDays;
        const nextLastDOW = new Date(Date.UTC(targetYear, targetMonth, nextMonthDays)).getUTCDay();
        if (nextLastDOW === 0) nextLastTradingDay -= 2;
        else if (nextLastDOW === 6) nextLastTradingDay -= 1;
        
        const monthEndClose = closeAt(targetYear, targetMonth, nextLastTradingDay);
        return Math.floor((monthEndClose.getTime() - currentTime) / 60000);
      }
      
      case '2M': {
        // Bi-monthly: closes last trading day of Feb, Apr, Jun, Aug, Oct, Dec
        const biMonthlyEnds = [1, 3, 5, 7, 9, 11]; // Feb, Apr, Jun, Aug, Oct, Dec (0-indexed)
        const isBiMonthlyMonth = biMonthlyEnds.includes(month);
        
        if (isBiMonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose; // 2M closes today!
          }
        }
        // Find next 2M close
        let targetMonth = biMonthlyEnds.find(m => m > month) ?? biMonthlyEnds[0];
        let targetYear = year;
        if (targetMonth <= month) targetYear++;
        
        const tgtDays = new Date(targetYear, targetMonth + 1, 0).getDate();
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, targetMonth, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, targetMonth, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '3M': {
        // Quarterly: closes last trading day of Mar, Jun, Sep, Dec
        const quarterEnds = [2, 5, 8, 11]; // March, June, Sept, Dec
        const isQuarterMonth = quarterEnds.includes(month);
        
        if (isQuarterMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose; // Quarter closes today!
          }
        }
        let targetMonth = quarterEnds.find(q => q > month) ?? quarterEnds[0];
        let targetYear = year;
        if (targetMonth <= month) targetYear++;
        
        const tgtDays = new Date(targetYear, targetMonth + 1, 0).getDate();
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, targetMonth, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, targetMonth, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '4M': {
        // 4-Monthly: closes last trading day of Apr, Aug, Dec
        const fourMonthEnds = [3, 7, 11]; // April, August, December
        const is4MonthlyMonth = fourMonthEnds.includes(month);
        
        if (is4MonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        let targetMonth = fourMonthEnds.find(m => m > month) ?? fourMonthEnds[0];
        let targetYear = year;
        if (targetMonth <= month) targetYear++;
        
        const tgtDays = new Date(targetYear, targetMonth + 1, 0).getDate();
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, targetMonth, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, targetMonth, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '5M': {
        // 5-Monthly: closes last trading day of May, Oct (and wraps)
        const fiveMonthEnds = [4, 9]; // May, October (every 5 months from Jan)
        const is5MonthlyMonth = fiveMonthEnds.includes(month);
        
        if (is5MonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        let targetMonth = fiveMonthEnds.find(m => m > month) ?? fiveMonthEnds[0];
        let targetYear = year;
        if (targetMonth <= month) targetYear++;
        
        const tgtDays = new Date(targetYear, targetMonth + 1, 0).getDate();
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, targetMonth, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, targetMonth, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '6M': {
        // Semi-annual: closes last trading day of Jun and Dec
        const halfYearEnds = [5, 11]; // June, December
        const isHalfYearMonth = halfYearEnds.includes(month);
        
        if (isHalfYearMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        let targetMonth = halfYearEnds.find(h => h > month) ?? halfYearEnds[0];
        let targetYear = year;
        if (targetMonth <= month) targetYear++;
        
        const tgtDays = new Date(targetYear, targetMonth + 1, 0).getDate();
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, targetMonth, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, targetMonth, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '7M': {
        // 7-Monthly: closes last trading day of Jul (7 months from Jan)
        const sevenMonthEnds = [6]; // July
        const is7MonthlyMonth = sevenMonthEnds.includes(month);
        
        if (is7MonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        // Next July
        let targetYear = month >= 6 ? year + 1 : year;
        const tgtDays = new Date(targetYear, 7, 0).getDate(); // July
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, 6, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, 6, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '8M': {
        // 8-Monthly: closes last trading day of Aug
        const eightMonthEnds = [7]; // August
        const is8MonthlyMonth = eightMonthEnds.includes(month);
        
        if (is8MonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        // Next August
        let targetYear = month >= 7 ? year + 1 : year;
        const tgtDays = new Date(targetYear, 8, 0).getDate(); // August
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, 7, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, 7, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '9M': {
        // 9-Monthly: closes last trading day of Sep
        const nineMonthEnds = [8]; // September
        const is9MonthlyMonth = nineMonthEnds.includes(month);
        
        if (is9MonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        // Next September
        let targetYear = month >= 8 ? year + 1 : year;
        const tgtDays = new Date(targetYear, 9, 0).getDate(); // September
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, 8, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, 8, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '10M': {
        // 10-Monthly: closes last trading day of Oct
        const tenMonthEnds = [9]; // October
        const is10MonthlyMonth = tenMonthEnds.includes(month);
        
        if (is10MonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        // Next October
        let targetYear = month >= 9 ? year + 1 : year;
        const tgtDays = new Date(targetYear, 10, 0).getDate(); // October
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, 9, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, 9, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '11M': {
        // 11-Monthly: closes last trading day of Nov
        const elevenMonthEnds = [10]; // November
        const is11MonthlyMonth = elevenMonthEnds.includes(month);
        
        if (is11MonthlyMonth) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let lastTradingDay = daysInMonth;
          const lastDOW = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
          if (lastDOW === 0) lastTradingDay -= 2;
          else if (lastDOW === 6) lastTradingDay -= 1;
          
          if (date === lastTradingDay && currentTime < todayCloseMs) {
            return minsToTodayClose;
          }
        }
        // Next November
        let targetYear = month >= 10 ? year + 1 : year;
        const tgtDays = new Date(targetYear, 11, 0).getDate(); // November
        let tgtLastDay = tgtDays;
        const tgtDOW = new Date(Date.UTC(targetYear, 10, tgtDays)).getUTCDay();
        if (tgtDOW === 0) tgtLastDay -= 2;
        else if (tgtDOW === 6) tgtLastDay -= 1;
        
        const closeDate = closeAt(targetYear, 10, tgtLastDay);
        return Math.floor((closeDate.getTime() - currentTime) / 60000);
      }
      
      case '1Y': {
        // Yearly: closes last trading day of December
        const daysInDec = new Date(year, 12, 0).getDate(); // Dec has 31 days
        let lastTradingDay = daysInDec;
        const lastDOW = new Date(Date.UTC(year, 11, daysInDec)).getUTCDay();
        if (lastDOW === 0) lastTradingDay -= 2;
        else if (lastDOW === 6) lastTradingDay -= 1;
        
        const isYearEnd = month === 11 && date === lastTradingDay;
        if (isYearEnd && currentTime < todayCloseMs) {
          return minsToTodayClose; // Yearly closes today!
        }
        // Next year end
        const targetYear = month === 11 && date >= lastTradingDay ? year + 1 : year;
        const nextDecDays = new Date(targetYear, 12, 0).getDate();
        let nextLastDay = nextDecDays;
        const nextDOW = new Date(Date.UTC(targetYear, 11, nextDecDays)).getUTCDay();
        if (nextDOW === 0) nextLastDay -= 2;
        else if (nextDOW === 6) nextLastDay -= 1;
        
        const yearEndClose = closeAt(targetYear, 11, nextLastDay);
        return Math.floor((yearEndClose.getTime() - currentTime) / 60000);
      }
      
      default:
        // Fallback
        const tfMs = tfConfig.minutes * 60 * 1000;
        const periodEnd = Math.ceil(currentTime / tfMs) * tfMs;
        return Math.floor((periodEnd - currentTime) / 60000);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDLE CLOSE CONFLUENCE CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate when multiple timeframe candles close together.
   * This is the key insight: more candles closing = higher probability move.
   * 
   * Example: If it's the last day of the month with 3 hours to go:
   * - Monthly candle closing
   * - Weekly candle (if Friday)
   * - Daily candle
   * - 8h, 4h, 2h, 1h candles
   * = MASSIVE confluence = high probability volatility
   */
  calculateCandleCloseConfluence(currentTime: number): CandleCloseConfluence {
    const now = new Date(currentTime);
    
    // Calculate time to close for each timeframe
    const tfCloses: { tf: string; minutes: number; minsAway: number; weight: number }[] = [];
    
    // TF weights based on significance (higher TF = more weight)
    // These weights determine how important each timeframe close is for confluence
    const tfWeights: Record<string, number> = {
      // Yearly - MASSIVE significance
      '1Y': 100,
      // Monthly cycles - scale by months (longer = more significant)
      '11M': 55, '10M': 50, '9M': 48, '8M': 46, '7M': 44,
      '6M': 42, '5M': 38, '4M': 36, '3M': 34, '2M': 32, '1M': 30,
      // Weekly cycles - scale by weeks
      '4W': 28, '3W': 26, '2W': 24, '1W': 20,
      // Daily cycles - scale by days
      '7D': 18, '6D': 17, '5D': 16, '4D': 15, '3D': 14, '2D': 12, '1D': 10,
      // Intraday - Moderate significance
      '8h': 6, '6h': 5, '4h': 4, '3h': 3, '2h': 2, '1h': 1.5,
      // Micro - Lower significance
      '30m': 1, '15m': 0.5, '10m': 0.3, '5m': 0.2
    };
    
    for (const tfConfig of TIMEFRAMES) {
      // For calendar-based timeframes, calculate actual calendar close time
      // rather than simple minute-based math
      const minsAway = this.getMinutesToTimeframeClose(now, tfConfig);
      
      if (minsAway !== null && minsAway >= 0) {
        tfCloses.push({
          tf: tfConfig.label,
          minutes: tfConfig.minutes,
          minsAway: minsAway,
          weight: tfWeights[tfConfig.label] || 1
        });
      }
    }
    
    // Sort by time to close
    tfCloses.sort((a, b) => a.minsAway - b.minsAway);
    
    // 1. CLOSING NOW (within 5 minutes)
    const closingNowTFs = tfCloses.filter(t => t.minsAway <= 5);
    const highestClosingNow = closingNowTFs.reduce((max, t) => 
      t.weight > (max?.weight || 0) ? t : max, null as typeof tfCloses[0] | null);
    const hasMonthlyPlus = closingNowTFs.some(t => ['M', '3M', 'Y'].includes(t.tf.replace(/[0-9]/g, '')));
    
    // 2. CLOSING SOON (within 4 hours = 240 minutes)
    const closingSoonTFs = tfCloses.filter(t => t.minsAway > 5 && t.minsAway <= 240);
    
    // Find peak confluence - when do most TFs close together?
    // Group closes into 15-minute windows
    const windowSize = 15;
    const windows: Map<number, typeof tfCloses> = new Map();
    
    for (const tf of tfCloses.filter(t => t.minsAway <= 240)) {
      const windowKey = Math.floor(tf.minsAway / windowSize) * windowSize;
      if (!windows.has(windowKey)) windows.set(windowKey, []);
      windows.get(windowKey)!.push(tf);
    }
    
    // Find the window with highest weighted count
    let peakWindow = 0;
    let peakScore = 0;
    let peakCount = 0;
    
    for (const [windowStart, tfs] of windows) {
      const windowScore = tfs.reduce((sum, t) => sum + t.weight, 0);
      if (windowScore > peakScore) {
        peakScore = windowScore;
        peakWindow = windowStart;
        peakCount = tfs.length;
      }
    }
    
    // 3. SPECIAL EVENTS
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 5 = Friday
    const dayOfMonth = now.getUTCDate();
    const month = now.getUTCMonth();
    const daysInMonth = new Date(now.getUTCFullYear(), month + 1, 0).getDate();
    const hour = now.getUTCHours();
    
    const isMonthEnd = dayOfMonth >= daysInMonth - 1;
    const isWeekEnd = dayOfWeek === 5; // Friday
    const isQuarterEnd = isMonthEnd && [2, 5, 8, 11].includes(month); // March, June, Sept, Dec
    const isYearEnd = isMonthEnd && month === 11; // December
    
    // Trading session close detection (UTC times)
    let sessionClose: 'ny' | 'london' | 'asia' | 'none' = 'none';
    if (hour >= 20 && hour <= 21) sessionClose = 'ny';      // NY close ~21:00 UTC
    else if (hour >= 16 && hour <= 17) sessionClose = 'london'; // London close ~16:30 UTC
    else if (hour >= 6 && hour <= 7) sessionClose = 'asia';    // Asia close ~07:00 UTC
    
    // 4. CALCULATE CONFLUENCE SCORE
    // Formula: sum of weights for closing TFs + bonuses for special events
    let score = 0;
    
    // Closing now gets full weight
    score += closingNowTFs.reduce((sum, t) => sum + t.weight * 2, 0);
    
    // Closing soon gets partial weight (decreasing by distance)
    for (const tf of closingSoonTFs) {
      const distanceFactor = 1 - (tf.minsAway / 240); // 1 at 0 mins, 0 at 240 mins
      score += tf.weight * distanceFactor;
    }
    
    // Bonuses for special events
    if (isYearEnd) score += 50;
    else if (isQuarterEnd) score += 30;
    else if (isMonthEnd) score += 20;
    if (isWeekEnd) score += 10;
    if (sessionClose !== 'none') score += 5;
    
    // Normalize to 0-100
    const maxPossibleScore = 200; // Rough estimate of max
    const normalizedScore = Math.min(100, Math.round((score / maxPossibleScore) * 100));
    
    // Rating based on score
    let rating: 'extreme' | 'high' | 'moderate' | 'low' | 'none';
    if (normalizedScore >= 80) rating = 'extreme';
    else if (normalizedScore >= 50) rating = 'high';
    else if (normalizedScore >= 25) rating = 'moderate';
    else if (normalizedScore >= 10) rating = 'low';
    else rating = 'none';
    
    // 5. BEST ENTRY WINDOW
    // Optimal entry is typically 5-15 minutes BEFORE peak confluence
    const entryStart = Math.max(0, peakWindow - 15);
    const entryEnd = peakWindow + 5;
    
    let entryReason = '';
    if (peakCount >= 5) {
      entryReason = `${peakCount} timeframes closing together - HIGH volatility expected`;
    } else if (peakCount >= 3) {
      entryReason = `${peakCount} timeframes closing - moderate confluence`;
    } else {
      entryReason = 'Standard market conditions';
    }
    
    console.log(`📊 Candle Close Confluence: ${closingNowTFs.length} closing now, ${closingSoonTFs.length} closing soon, Score: ${normalizedScore} (${rating})`);
    
    return {
      closingNow: {
        count: closingNowTFs.length,
        timeframes: closingNowTFs.map(t => t.tf),
        highestTF: highestClosingNow?.tf || null,
        isRare: hasMonthlyPlus && closingNowTFs.length >= 3
      },
      closingSoon: {
        count: closingSoonTFs.length,
        timeframes: closingSoonTFs.map(t => ({ tf: t.tf, minsAway: t.minsAway, weight: t.weight })),
        peakConfluenceIn: peakWindow,
        peakCount
      },
      specialEvents: {
        isMonthEnd,
        isWeekEnd,
        isQuarterEnd,
        isYearEnd,
        sessionClose
      },
      confluenceScore: normalizedScore,
      confluenceRating: rating,
      bestEntryWindow: {
        startMins: entryStart,
        endMins: entryEnd,
        reason: entryReason
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECOMPRESSION ANALYSIS - The key innovation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze what happens after a TF close - when does price start moving?
   */
  analyzeDecompression(
    baseBars: OHLCV[],
    tfConfig: TimeframeConfig,
    tfBars: OHLCV[],
    tfBarIndex: number,
    lookForwardBars: number = 24
  ): DecompressionEvent | null {
    
    if (tfBarIndex < 1 || tfBarIndex >= tfBars.length - 1) return null;
    
    const closeBar = tfBars[tfBarIndex];
    const closeTime = closeBar.time + tfConfig.minutes * 60 * 1000; // End of bar
    const closePrice = closeBar.close;
    const mid50Level = this.hl2(tfBars[tfBarIndex - 1]);
    const distanceToMid50 = ((closePrice - mid50Level) / mid50Level) * 100;
    
    // Find corresponding base bars after this TF close
    const baseInterval = 30; // 30-minute base bars
    const barsPerBaseInterval = 30 * 60 * 1000;
    
    const startBaseIndex = baseBars.findIndex(b => b.time >= closeTime);
    if (startBaseIndex === -1 || startBaseIndex + lookForwardBars >= baseBars.length) return null;
    
    // Track decompression
    let decompressionStartBar = 0;
    let decompressionDirection: 'up' | 'down' | 'sideways' = 'sideways';
    let decompressionMagnitude = 0;
    let touchedMid50 = false;
    let mid50Action: 'bounce' | 'break' | 'wick' | 'none' = 'none';
    
    const significantMoveThreshold = 0.15; // 0.15% to be considered "moving"
    
    for (let i = 0; i < Math.min(lookForwardBars, baseBars.length - startBaseIndex); i++) {
      const bar = baseBars[startBaseIndex + i];
      const change = ((bar.close - closePrice) / closePrice) * 100;
      
      // Check if we touched the 50% level
      if (!touchedMid50) {
        if (bar.low <= mid50Level && bar.high >= mid50Level) {
          touchedMid50 = true;
          // Determine action
          if (bar.close > mid50Level && closePrice < mid50Level) {
            mid50Action = 'break'; // Broke through from below
          } else if (bar.close < mid50Level && closePrice > mid50Level) {
            mid50Action = 'break'; // Broke through from above
          } else if ((bar.low <= mid50Level && bar.close > mid50Level) || 
                     (bar.high >= mid50Level && bar.close < mid50Level)) {
            mid50Action = 'wick'; // Wicked through
          } else {
            mid50Action = 'bounce';
          }
        }
      }
      
      // Track first significant move (decompression start)
      if (decompressionStartBar === 0 && Math.abs(change) >= significantMoveThreshold) {
        decompressionStartBar = i + 1;
        decompressionDirection = change > 0 ? 'up' : 'down';
        decompressionMagnitude = change;
      }
      
      // Track max move
      if (Math.abs(change) > Math.abs(decompressionMagnitude)) {
        decompressionMagnitude = change;
        decompressionDirection = change > 0 ? 'up' : (change < -significantMoveThreshold ? 'down' : 'sideways');
      }
    }
    
    // Calculate outcomes at 8 and 24 bars
    const outcome8Bars = this.calculateOutcome(baseBars, startBaseIndex, 8, closePrice);
    const outcome24Bars = this.calculateOutcome(baseBars, startBaseIndex, 24, closePrice);
    
    return {
      tf: tfConfig.tf,
      closeTime,
      closePrice,
      mid50Level,
      distanceToMid50,
      decompressionStartBar,
      decompressionStartMins: decompressionStartBar * baseInterval,
      decompressionDirection,
      decompressionMagnitude,
      touchedMid50,
      mid50Action,
      outcome8Bars,
      outcome24Bars,
    };
  }

  calculateOutcome(bars: OHLCV[], startIndex: number, lookForward: number, entryPrice: number): { direction: 'up' | 'down' | 'sideways'; magnitude: number } {
    if (startIndex + lookForward >= bars.length) {
      return { direction: 'sideways', magnitude: 0 };
    }
    
    const endBar = bars[startIndex + lookForward];
    const magnitude = ((endBar.close - entryPrice) / entryPrice) * 100;
    const direction: 'up' | 'down' | 'sideways' = 
      magnitude > 0.3 ? 'up' : magnitude < -0.3 ? 'down' : 'sideways';
    
    return { direction, magnitude };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECOMPRESSION PULL CALCULATION
  // Scans all TFs closing today, checks which are decompressing,
  // and calculates which direction price is being "pulled" toward 50% levels
  // ═══════════════════════════════════════════════════════════════════════════

  analyzeDecompressionPull(baseBars: OHLCV[], currentPrice: number, currentTime: number): DecompressionAnalysis {
    const decompressions: DecompressionPull[] = [];
    const now = new Date(currentTime);
    
    for (const tfConfig of TIMEFRAMES) {
      const minsToClose = this.getMinutesToTimeframeClose(now, tfConfig);
      if (minsToClose === null || minsToClose < 0) continue;
      
      // Get resampled bars for this TF
      const tfBars = this.resampleBars(baseBars, tfConfig.minutes);
      if (tfBars.length < 2) continue;
      
      // Get prior candle's 50% level
      const mid50Level = this.hl2(tfBars[tfBars.length - 2]);
      const distanceToMid50 = ((currentPrice - mid50Level) / mid50Level) * 100;
      
      // Check if this TF is in decompression window
      const decompStart = tfConfig.decompStart || 0;
      const isDecompressing = decompStart > 0 && minsToClose <= decompStart && minsToClose > 0;
      
      // Calculate pull direction (is 50% above or below current price?)
      let pullDirection: 'up' | 'down' | 'none' = 'none';
      if (isDecompressing) {
        pullDirection = mid50Level > currentPrice ? 'up' : mid50Level < currentPrice ? 'down' : 'none';
      }
      
      // Calculate pull strength (1-10)
      // Factors: proximity to close, TF weight (larger TFs have more pull), distance to 50%
      let pullStrength = 0;
      if (isDecompressing) {
        // Closer to close = stronger pull (linear ramp)
        const closenessScore = (decompStart - minsToClose) / decompStart * 5; // 0-5
        
        // Larger TFs have more weight
        const tfWeight = Math.log2(tfConfig.minutes / 5) * 0.5; // 5m=0, 1h=1.8, 4h=2.8, 1D=4
        
        // Closer 50% level = stronger pull (inverse of distance)
        const distanceScore = Math.max(0, 2 - Math.abs(distanceToMid50) * 2); // 2 if close, 0 if >1% away
        
        pullStrength = Math.min(10, closenessScore + tfWeight + distanceScore);
      }
      
      decompressions.push({
        tf: tfConfig.label,
        isDecompressing,
        minsToClose,
        mid50Level,
        pullDirection,
        pullStrength,
        distanceToMid50,
      });
    }
    
    // Calculate net pull
    const activeDecomps = decompressions.filter(d => d.isDecompressing);
    const activeCount = activeDecomps.length;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // TEMPORAL CLUSTERING - Find TFs that close together within ±5 min window
    // This is the REAL confluence metric (not just "how many TFs are active")
    // ═══════════════════════════════════════════════════════════════════════════
    const CLUSTER_WINDOW_MINS = 5;
    
    // Sort active decomps by minutes to close
    const sortedDecomps = [...activeDecomps].sort((a, b) => a.minsToClose - b.minsToClose);
    
    // Find clusters
    const clusters: TemporalCluster[] = [];
    const usedIndices = new Set<number>();
    
    for (let i = 0; i < sortedDecomps.length; i++) {
      if (usedIndices.has(i)) continue;
      
      const clusterCenter = sortedDecomps[i].minsToClose;
      const clusterTFs: string[] = [sortedDecomps[i].tf];
      usedIndices.add(i);
      
      // Find all other TFs closing within ±CLUSTER_WINDOW_MINS
      for (let j = i + 1; j < sortedDecomps.length; j++) {
        if (usedIndices.has(j)) continue;
        
        const diff = Math.abs(sortedDecomps[j].minsToClose - clusterCenter);
        if (diff <= CLUSTER_WINDOW_MINS) {
          clusterTFs.push(sortedDecomps[j].tf);
          usedIndices.add(j);
        }
      }
      
      // Score the cluster
      const count = clusterTFs.length;
      let score: number;
      let intensity: TemporalCluster['intensity'];
      
      if (count >= 6) {
        score = 95;
        intensity = 'explosive';
      } else if (count >= 5) {
        score = 80;
        intensity = 'very_strong';
      } else if (count >= 4) {
        score = 65;
        intensity = 'strong';
      } else if (count >= 3) {
        score = 40;
        intensity = 'moderate';
      } else if (count >= 2) {
        score = 25;
        intensity = 'low';
      } else {
        score = 10;
        intensity = 'low';
      }
      
      clusters.push({
        clusterCenter,
        timeframes: clusterTFs,
        count,
        intensity,
        score,
      });
    }
    
    // Sort clusters by count (descending), then by time (ascending)
    clusters.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.clusterCenter - b.clusterCenter;
    });
    
    // Main cluster is the largest
    const mainCluster: TemporalCluster = clusters[0] || {
      clusterCenter: 999,
      timeframes: [],
      count: 0,
      intensity: 'low',
      score: 0,
    };
    
    const clusteredCount = mainCluster.count;
    const clusteringRatio = activeCount > 0 ? (clusteredCount / activeCount) * 100 : 0;
    
    // Calculate pull from CLUSTERED TFs only (not all active)
    let bullishPull = 0;
    let bearishPull = 0;
    const pullReasons: string[] = [];
    
    // Only count TFs in the main cluster for pull calculation
    const clusteredTFSet = new Set(mainCluster.timeframes);
    
    for (const d of activeDecomps) {
      // Weight clustered TFs more heavily
      const isInCluster = clusteredTFSet.has(d.tf);
      const weightMultiplier = isInCluster ? 1.5 : 0.3; // Clustered = full weight, isolated = minimal
      
      if (d.pullDirection === 'up') {
        bullishPull += d.pullStrength * weightMultiplier;
        if (isInCluster) {
          pullReasons.push(`${d.tf} pulling UP to ${d.mid50Level.toFixed(2)} (${d.minsToClose}m)`);
        }
      } else if (d.pullDirection === 'down') {
        bearishPull += d.pullStrength * weightMultiplier;
        if (isInCluster) {
          pullReasons.push(`${d.tf} pulling DOWN to ${d.mid50Level.toFixed(2)} (${d.minsToClose}m)`);
        }
      }
    }
    
    const netPullStrength = bullishPull + bearishPull;
    const pullBias = netPullStrength > 0 ? ((bullishPull - bearishPull) / netPullStrength) * 100 : 0;
    
    let netPullDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (pullBias > 20) {
      netPullDirection = 'bullish';
    } else if (pullBias < -20) {
      netPullDirection = 'bearish';
    }
    
    // Build reasoning based on clustering (the real confluence)
    let reasoning: string;
    if (clusteredCount >= 3) {
      reasoning = `${clusteredCount} TFs closing together in ${mainCluster.clusterCenter}m: ${mainCluster.timeframes.join(', ')}`;
    } else if (clusteredCount >= 2) {
      reasoning = `${clusteredCount} TFs aligning (${mainCluster.timeframes.join(', ')}) in ${mainCluster.clusterCenter}m`;
    } else if (activeCount > 0) {
      reasoning = `${activeCount} TFs active but not aligned - low temporal confluence`;
    } else {
      reasoning = 'No active decompressions - wait for TF alignment';
    }
    
    return {
      decompressions,
      activeCount,
      
      // NEW: Temporal clustering data
      temporalCluster: mainCluster,
      clusteredCount,
      clusteringRatio,
      
      netPullDirection,
      netPullStrength,
      pullBias,
      reasoning,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HIERARCHICAL SCAN - Scan with all TFs below the selected mode
  // ═══════════════════════════════════════════════════════════════════════════

  async scanHierarchical(symbol: string, scanMode: ScanMode): Promise<HierarchicalScanResult> {
    const modeConfig = SCAN_MODES.find(m => m.mode === scanMode);
    if (!modeConfig) throw new Error(`Unknown scan mode: ${scanMode}`);
    
    // Get historical price data for analysis
    const baseBars = await this.fetchHistoricalData(symbol, '30min');
    if (!baseBars || baseBars.length === 0) {
      throw new Error(`No price data for ${symbol}. The symbol may not be supported or data is temporarily unavailable — please check the ticker and try again.`);
    }
    
    // Fetch LIVE real-time price (fallback to last bar close if unavailable)
    const livePrice = await this.fetchLivePrice(symbol);
    const currentPrice = livePrice ?? baseBars[baseBars.length - 1].close;
    const isLivePrice = livePrice !== null;
    const currentTime = Date.now();
    const atr = this.calculateATR(baseBars);
    
    console.log(`📊 ${symbol} Live Price: $${currentPrice.toFixed(2)} ${isLivePrice ? '(real-time)' : '(from last bar)'}`);
    
    // Filter TFs to only those <= maxTFMinutes for this scan mode
    const includedTFConfigs = TIMEFRAMES.filter(tf => tf.minutes <= modeConfig.maxTFMinutes);
    const includedTFs = includedTFConfigs.map(tf => tf.label);
    
    // Analyze decompression for included TFs only
    const allDecomps: DecompressionPull[] = [];
    const mid50Levels: { tf: string; level: number; distance: number; isDecompressing: boolean }[] = [];
    const resampledBarsByTf: Record<string, OHLCV[]> = {};
    
    // Detect if this is likely a stock (not crypto) - crypto symbols contain USD
    const isCrypto = symbol.includes('USD') && !symbol.includes('/');
    
    const now = new Date(currentTime);
    const isMarketClosed = !isCrypto && !this.isUsEquityMarketOpen(now);
    
    for (const tfConfig of includedTFConfigs) {
      const minsToClose = this.getMinutesToTimeframeClose(now, tfConfig);
      if (minsToClose === null) continue;
      
      // Resample for 50% level
      const tfId = this.getCanonicalTimeframeId(tfConfig);
      const tfBars = this.resampleBars(baseBars, tfConfig.minutes);
      resampledBarsByTf[tfId] = tfBars;
      if (tfBars.length < 2) continue;
      
      const mid50Level = this.hl2(tfBars[tfBars.length - 2]);
      const distanceToMid50 = ((currentPrice - mid50Level) / mid50Level) * 100;
      
      // For stocks on weekend/closed hours: use PROXIMITY-based analysis instead of timing
      // Price within 1% of 50% level = strong pull, within 2% = moderate
      const proximityStrength = Math.max(0, 2 - Math.abs(distanceToMid50)) * 2.5;  // 0-5 score based on proximity
      
      // Check decompression (only valid during live trading)
      const decompStart = tfConfig.decompStart || 0;
      const isTimingDecomp = !isMarketClosed && decompStart > 0 && minsToClose <= decompStart && minsToClose > 0;
      
      // For market closed: treat TFs with price near 50% as "active" (proximity-based)
      const isProximityActive = isMarketClosed && Math.abs(distanceToMid50) <= 1.5;  // Within 1.5% of 50%
      const isDecompressing = isTimingDecomp || isProximityActive;
      
      let pullDirection: 'up' | 'down' | 'none' = 'none';
      let pullStrength = 0;
      
      if (isDecompressing) {
        pullDirection = mid50Level > currentPrice ? 'up' : mid50Level < currentPrice ? 'down' : 'none';
        
        if (isMarketClosed) {
          // Market closed: use proximity-based strength + TF weight
          const tfWeight = Math.log2(tfConfig.minutes / 5) * 0.5;
          pullStrength = Math.min(10, proximityStrength + tfWeight);
        } else {
          // Live market: use timing-based strength
          const closenessScore = (decompStart - minsToClose) / decompStart * 5;
          const tfWeight = Math.log2(tfConfig.minutes / 5) * 0.5;
          const distanceScore = Math.max(0, 2 - Math.abs(distanceToMid50) * 2);
          pullStrength = Math.min(10, closenessScore + tfWeight + distanceScore);
        }
      }
      
      allDecomps.push({
        tf: tfConfig.label,
        isDecompressing,
        minsToClose: isMarketClosed ? -1 : minsToClose,  // -1 indicates market closed
        mid50Level,
        pullDirection,
        pullStrength,
        distanceToMid50,
      });
      
      mid50Levels.push({
        tf: tfConfig.label,
        level: mid50Level,
        distance: distanceToMid50,
        isDecompressing,
      });
    }
    
    // Calculate decompression analysis
    const activeDecomps = allDecomps.filter(d => d.isDecompressing);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // TEMPORAL CLUSTERING - Find TFs that close together within ±5 min window
    // This is the REAL confluence metric (not just "how many TFs are active")
    // ═══════════════════════════════════════════════════════════════════════════
    const CLUSTER_WINDOW_MINS = 5;
    
    // Sort active decomps by minutes to close (only for live market)
    const liveDecomps = activeDecomps.filter(d => d.minsToClose > 0);
    const sortedDecomps = [...liveDecomps].sort((a, b) => a.minsToClose - b.minsToClose);
    
    // Find clusters
    const temporalClusters: TemporalCluster[] = [];
    const usedIndices = new Set<number>();
    
    for (let i = 0; i < sortedDecomps.length; i++) {
      if (usedIndices.has(i)) continue;
      
      const clusterCenter = sortedDecomps[i].minsToClose;
      const clusterTFs: string[] = [sortedDecomps[i].tf];
      usedIndices.add(i);
      
      // Find all other TFs closing within ±CLUSTER_WINDOW_MINS
      for (let j = i + 1; j < sortedDecomps.length; j++) {
        if (usedIndices.has(j)) continue;
        
        const diff = Math.abs(sortedDecomps[j].minsToClose - clusterCenter);
        if (diff <= CLUSTER_WINDOW_MINS) {
          clusterTFs.push(sortedDecomps[j].tf);
          usedIndices.add(j);
        }
      }
      
      // Score the cluster
      const count = clusterTFs.length;
      let score: number;
      let intensity: TemporalCluster['intensity'];
      
      if (count >= 6) {
        score = 95;
        intensity = 'explosive';
      } else if (count >= 5) {
        score = 80;
        intensity = 'very_strong';
      } else if (count >= 4) {
        score = 65;
        intensity = 'strong';
      } else if (count >= 3) {
        score = 40;
        intensity = 'moderate';
      } else if (count >= 2) {
        score = 25;
        intensity = 'low';
      } else {
        score = 10;
        intensity = 'low';
      }
      
      temporalClusters.push({
        clusterCenter,
        timeframes: clusterTFs,
        count,
        intensity,
        score,
      });
    }
    
    // Sort clusters by count (descending), then by time (ascending)
    temporalClusters.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.clusterCenter - b.clusterCenter;
    });
    
    // Main cluster is the largest
    const mainCluster: TemporalCluster = temporalClusters[0] || {
      clusterCenter: isMarketClosed ? -1 : 999,
      timeframes: isMarketClosed ? activeDecomps.map(d => d.tf) : [],
      count: isMarketClosed ? activeDecomps.length : 0,  // For closed market, show all proximity-based
      intensity: 'low',
      score: 0,
    };
    
    const clusteredCount = mainCluster.count;
    const clusteringRatio = activeDecomps.length > 0 ? (clusteredCount / activeDecomps.length) * 100 : 0;
    
    // Calculate pull - weight clustered TFs more heavily
    let bullishPull = 0;
    let bearishPull = 0;
    const pullReasons: string[] = [];
    const clusteredTFSet = new Set(mainCluster.timeframes);
    
    for (const d of activeDecomps) {
      const isInCluster = clusteredTFSet.has(d.tf);
      const weightMultiplier = isInCluster ? 1.5 : 0.3;
      
      if (d.pullDirection === 'up') {
        bullishPull += d.pullStrength * weightMultiplier;
        if (isInCluster) pullReasons.push(`${d.tf}→${d.mid50Level.toFixed(2)}`);
      } else if (d.pullDirection === 'down') {
        bearishPull += d.pullStrength * weightMultiplier;
        if (isInCluster) pullReasons.push(`${d.tf}→${d.mid50Level.toFixed(2)}`);
      }
    }
    
    const netPullStrength = bullishPull + bearishPull;
    const pullBias = netPullStrength > 0 ? ((bullishPull - bearishPull) / netPullStrength) * 100 : 0;
    let netPullDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (pullBias > 20) netPullDirection = 'bullish';
    else if (pullBias < -20) netPullDirection = 'bearish';
    
    // Build reasoning text - now based on CLUSTERED count (the real confluence)
    let reasoningText = '';
    const nyNow = this.getNYDateTimeParts(now);
    const isWeekend = nyNow.dayOfWeek === 0 || nyNow.dayOfWeek === 6;
    const closedReason = isWeekend ? 'weekend' : 'after hours';
    if (isMarketClosed) {
      reasoningText = activeDecomps.length > 0 
        ? `${activeDecomps.length} TFs near 50% levels (${closedReason}): ${pullReasons.join(', ')}`
        : `Market closed (${closedReason}) - no TFs near 50% levels`;
    } else if (clusteredCount >= 3) {
      reasoningText = `${clusteredCount} TFs closing together in ${mainCluster.clusterCenter}m: ${mainCluster.timeframes.join(', ')}`;
    } else if (clusteredCount >= 2) {
      reasoningText = `${clusteredCount} TFs aligned (${mainCluster.timeframes.join(', ')}) in ${mainCluster.clusterCenter}m`;
    } else if (activeDecomps.length > 0) {
      reasoningText = `${activeDecomps.length} TFs active but not aligned - low temporal confluence`;
    } else {
      reasoningText = 'No active decompressions - wait for TF alignment';
    }
    
    const decompression: DecompressionAnalysis = {
      decompressions: allDecomps,
      activeCount: activeDecomps.length,
      
      // NEW: Temporal clustering data
      temporalCluster: mainCluster,
      clusteredCount,
      clusteringRatio,
      
      netPullDirection,
      netPullStrength,
      pullBias,
      reasoning: reasoningText,
    };
    
    // Find clusters (50% levels within ATR of each other)
    const clusters: { levels: number[]; tfs: string[]; avgLevel: number }[] = [];
    const usedLevels = new Set<number>();
    
    for (let i = 0; i < mid50Levels.length; i++) {
      if (usedLevels.has(mid50Levels[i].level)) continue;
      
      const cluster = { levels: [mid50Levels[i].level], tfs: [mid50Levels[i].tf], avgLevel: mid50Levels[i].level };
      usedLevels.add(mid50Levels[i].level);
      
      for (let j = i + 1; j < mid50Levels.length; j++) {
        if (Math.abs(mid50Levels[i].level - mid50Levels[j].level) <= atr) {
          cluster.levels.push(mid50Levels[j].level);
          cluster.tfs.push(mid50Levels[j].tf);
          usedLevels.add(mid50Levels[j].level);
        }
      }
      
      if (cluster.levels.length >= 2) {
        cluster.avgLevel = cluster.levels.reduce((a, b) => a + b, 0) / cluster.levels.length;
        clusters.push(cluster);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FORMALIZED SCORING MODEL (Track A/Track B approach)
    // A) Direction Score (-100 to +100) - from TF-weighted pull
    // B) Cluster Score (0-100) - temporal alignment quality
    // C) Decompression Score (0-100) - weighted average confidence
    // Final Confidence = 0.55*clusterScore + 0.45*decompressionScore
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Timeframe weights (hierarchy)
    const TF_WEIGHTS: Record<string, number> = {
      '5m': 1.0, '10m': 1.2, '15m': 1.4, '30m': 1.7,
      '1H': 2.0, '1h': 2.0, '2H': 2.3, '2h': 2.3, '3H': 2.4, '3h': 2.4, '4H': 2.6, '4h': 2.6,
      '6H': 2.8, '6h': 2.8, '8H': 2.9, '8h': 2.9,
      '1D': 3.2, 'D': 3.2, '2D': 3.4, '3D': 3.6, '4D': 3.7, '5D': 3.8, '6D': 3.9, '7D': 4.0,
      '1W': 4.0, 'W': 4.0, '2W': 4.2, '3W': 4.4, '4W': 4.5,
      '1M': 5.0, 'M': 5.0, '2M': 5.2, '3M': 5.4,
    };
    
    const getTFWeight = (tf: string): number => TF_WEIGHTS[tf] || 1.0;
    const isHigherTF = (tf: string): boolean => {
      const mins = TIMEFRAMES.find(t => t.label === tf)?.minutes || 0;
      return mins >= 60; // 1h or higher
    };
    
    // A) DIRECTION SCORE (-100 to +100)
    // Formula: 100 * Σ(w_tf * conf_tf * dir_tf) / Σ(w_tf * conf_tf)
    let dirNumerator = 0;
    let dirDenominator = 0;
    
    for (const d of activeDecomps) {
      const weight = getTFWeight(d.tf);
      const conf = Math.min(1, d.pullStrength / 10); // Normalize pullStrength to 0-1
      const dir = d.pullDirection === 'up' ? 1 : d.pullDirection === 'down' ? -1 : 0;
      
      dirNumerator += weight * conf * dir;
      dirDenominator += weight * conf;
    }
    
    const directionScore = dirDenominator > 0 
      ? Math.max(-100, Math.min(100, 100 * (dirNumerator / dirDenominator)))
      : 0;
    
    // Direction label from score (not from simple pullBias)
    let direction: 'bullish' | 'bearish' | 'neutral';
    if (directionScore > 15) direction = 'bullish';
    else if (directionScore < -15) direction = 'bearish';
    else direction = 'neutral';
    
    // B) CLUSTER SCORE (0-100) - Temporal alignment quality
    // dominantClusterRatio = max(clusterWeight) / Σ(clusterWeight)
    let totalClusterWeight = 0;
    let maxClusterWeight = 0;
    
    for (const tc of temporalClusters) {
      let clusterWeight = 0;
      for (const tf of tc.timeframes) {
        const decomp = activeDecomps.find(d => d.tf === tf);
        if (decomp) {
          const weight = getTFWeight(tf);
          const conf = Math.min(1, decomp.pullStrength / 10);
          clusterWeight += weight * conf;
        }
      }
      totalClusterWeight += clusterWeight;
      maxClusterWeight = Math.max(maxClusterWeight, clusterWeight);
    }
    
    const dominantClusterRatio = totalClusterWeight > 0 
      ? maxClusterWeight / totalClusterWeight 
      : 0;
    
    const clusterScore = Math.min(100, Math.max(0, dominantClusterRatio * 100));
    
    // C) DECOMPRESSION SCORE (0-100) - Weighted average confidence
    // Formula: 100 * Σ(w_tf * conf_tf) / Σ(w_tf)
    let decompNumerator = 0;
    let decompDenominator = 0;
    
    for (const d of activeDecomps) {
      const weight = getTFWeight(d.tf);
      const conf = Math.min(1, d.pullStrength / 10);
      decompNumerator += weight * conf;
      decompDenominator += weight;
    }
    
    const decompressionScore = decompDenominator > 0 
      ? Math.min(100, 100 * (decompNumerator / decompDenominator))
      : 0;
    
    // FINAL CONFIDENCE (0-100)
    // Cluster slightly dominates because "time confluence" is the product
    let confidence = Math.min(95, Math.max(10, 
      0.55 * clusterScore + 0.45 * decompressionScore
    ));
    
    // Check for higher TF presence
    const hasHigherTFActive = activeDecomps.some(d => isHigherTF(d.tf));
    const activeTFCount = activeDecomps.length;
    
    // SIGNAL STRENGTH with gates (not just confidence)
    let signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal' = 'no_signal';
    if (confidence >= 75 && activeTFCount >= 4 && dominantClusterRatio >= 0.70 && hasHigherTFActive) {
      signalStrength = 'strong';
    } else if (confidence >= 55 && activeTFCount >= 3 && dominantClusterRatio >= 0.60) {
      signalStrength = 'moderate';
    } else if (confidence >= 40 && activeTFCount >= 2) {
      signalStrength = 'weak';
    }
    
    // BANNERS (deterministic rules)
    const banners: string[] = [];
    
    // MEGA CONFLUENCE: 5+ TFs clustered together with high ratio
    if (activeTFCount >= 5 && dominantClusterRatio >= 0.75) {
      banners.push('MEGA CONFLUENCE');
    }
    
    // EXTREME BULLISH/BEARISH: Strong direction + high confidence
    if (Math.abs(directionScore) >= 70 && confidence >= 70) {
      banners.push(directionScore > 0 ? 'EXTREME BULLISH' : 'EXTREME BEARISH');
    }
    
    // PRICE MAGNET: Dominant cluster's target is within 1% of current price
    if (clusters.length > 0 && clusterScore >= 70) {
      const nearestCluster = clusters[0];
      const distanceToCluster = Math.abs((nearestCluster.avgLevel - currentPrice) / currentPrice) * 100;
      if (distanceToCluster <= 1.5) {
        banners.push('PRICE MAGNET');
      }
    }
    
    // HIGH CONFIDENCE
    if (confidence >= 80) {
      banners.push('HIGH CONFIDENCE');
    }
    
    // Find target: nearest cluster or strongest decompressing 50%
    let targetLevel = currentPrice;
    if (clusters.length > 0) {
      clusters.sort((a, b) => Math.abs(a.avgLevel - currentPrice) - Math.abs(b.avgLevel - currentPrice));
      targetLevel = clusters[0].avgLevel;
    } else if (activeDecomps.length > 0) {
      const strongest = activeDecomps.sort((a, b) => b.pullStrength - a.pullStrength)[0];
      targetLevel = strongest.mid50Level;
    }
    
    // Build reasoning with score breakdown
    const reasoningParts: string[] = [];
    if (activeTFCount > 0) {
      reasoningParts.push(`${activeTFCount} TFs decompressing`);
    }
    if (clusteredCount >= 2) {
      reasoningParts.push(`${clusteredCount} TFs clustered (${dominantClusterRatio.toFixed(0)}% ratio)`);
    }
    if (direction !== 'neutral') {
      reasoningParts.push(`Direction: ${direction.toUpperCase()} (${directionScore > 0 ? '+' : ''}${directionScore.toFixed(0)})`);
    }
    if (banners.length > 0) {
      reasoningParts.push(`🏆 ${banners.join(' | ')}`);
    }
    
    // Expected move time based on nearest close
    const nearestClose = allDecomps
      .filter(d => d.isDecompressing)
      .sort((a, b) => a.minsToClose - b.minsToClose)[0];
    const expectedMoveTime = nearestClose 
      ? `${nearestClose.minsToClose}m (${nearestClose.tf} close)`
      : 'Wait for decompression';
    
    // Build the score breakdown object
    const scoreBreakdown = {
      directionScore: Math.round(directionScore),
      clusterScore: Math.round(clusterScore),
      dominantClusterRatio: Math.round(dominantClusterRatio * 100) / 100,
      decompressionScore: Math.round(decompressionScore),
      activeTFs: activeTFCount,
      hasHigherTF: hasHigherTFActive,
      banners,
    };
    
    // ═══════════════════════════════════════════════════════════════════════════
    // TRADE SETUP CALCULATION (Swing Stop + 2.5 R:R)
    // Uses RESAMPLED bars for the PRIMARY timeframe to get proper swing levels
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Get primary TF minutes from mode config
    const primaryTFConfig = includedTFConfigs.find(tf => 
      tf.label.toLowerCase() === modeConfig.primaryTF.toLowerCase()
    ) || includedTFConfigs[includedTFConfigs.length - 1];  // fallback to largest TF
    
    // Resample base bars to primary TF for swing calculation
    const primaryTFBars = this.resampleBars(baseBars, primaryTFConfig.minutes);
    
    // Calculate swing high/low from recent PRIMARY TF bars (not base bars)
    const swingLookback = 5;  // 5 bars of the PRIMARY timeframe
    const recentPrimaryBars = primaryTFBars.slice(-swingLookback);
    
    // Fallback to base bars if not enough resampled bars
    const swingBars = recentPrimaryBars.length >= 3 ? recentPrimaryBars : baseBars.slice(-swingLookback);
    
    const swingLow = Math.min(...swingBars.map(b => b.low));
    const swingHigh = Math.max(...swingBars.map(b => b.high));
    
    console.log(`📊 Trade Setup: Using ${primaryTFConfig.label} bars (${swingBars.length} bars) - Swing Low: ${swingLow.toFixed(2)}, Swing High: ${swingHigh.toFixed(2)}`);
    
    // Entry is current price
    const entryPrice = currentPrice;
    
    // Stop loss based on swing (direction-dependent)
    let stopLoss: number;
    let takeProfit: number;
    const rrRatio = 2.5;  // From strategy settings
    
    if (direction === 'bullish') {
      // Long: stop below swing low
      stopLoss = swingLow;
      const risk = entryPrice - stopLoss;
      takeProfit = entryPrice + (risk * rrRatio);
    } else if (direction === 'bearish') {
      // Short: stop above swing high
      stopLoss = swingHigh;
      const risk = stopLoss - entryPrice;
      takeProfit = entryPrice - (risk * rrRatio);
    } else {
      // Neutral: use ATR-based default
      const atrStop = atr * 2;
      stopLoss = entryPrice - atrStop;
      takeProfit = entryPrice + (atrStop * rrRatio);
    }
    
    const riskPercent = Math.abs((entryPrice - stopLoss) / entryPrice) * 100;
    const rewardPercent = Math.abs((takeProfit - entryPrice) / entryPrice) * 100;
    
    const tradeSetup = {
      entryPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio: rrRatio,
      riskPercent,
      rewardPercent,
    };
    
    // Calculate Candle Close Confluence - when multiple TFs close together
    const candleCloseConfluence = this.calculateCandleCloseConfluence(currentTime);
    
    // Boost confidence if high candle close confluence
    if (candleCloseConfluence.confluenceRating === 'extreme') {
      confidence = Math.min(95, confidence + 15);
    } else if (candleCloseConfluence.confluenceRating === 'high') {
      confidence = Math.min(90, confidence + 10);
    } else if (candleCloseConfluence.confluenceRating === 'moderate') {
      confidence = Math.min(85, confidence + 5);
    }
    
    // Add candle close info to reasoning
    if (candleCloseConfluence.closingNow.count >= 2) {
      reasoningParts.push(`🕐 ${candleCloseConfluence.closingNow.count} TFs closing NOW (${candleCloseConfluence.closingNow.timeframes.join(', ')})`);
    }
    if (candleCloseConfluence.specialEvents.isMonthEnd) {
      reasoningParts.push('📅 Month-end confluence');
    }
    if (candleCloseConfluence.specialEvents.isQuarterEnd) {
      reasoningParts.push('📅 QUARTER-END - major rebalancing');
    }

    const candlesByTf: Record<string, ScanCandle[]> = {
      '30M': this.normalizeBars(baseBars),
    };

    const wantedTfKeys = new Set<string>(['30M', '1H', '4H', '1D']);
    const primaryTfKey = modeConfig.primaryTF.toUpperCase();
    wantedTfKeys.add(primaryTfKey);

    const ensureCandles = (tfKey: string) => {
      if (tfKey === '30M') {
        candlesByTf['30M'] = this.normalizeBars(baseBars);
        return;
      }

      const tfConfig = TIMEFRAMES.find((tf) => tf.label.toUpperCase() === tfKey);
      if (!tfConfig) return;

      const tfId = this.getCanonicalTimeframeId(tfConfig);
      const bars = resampledBarsByTf[tfId] ?? this.resampleBars(baseBars, tfConfig.minutes);
      candlesByTf[tfKey] = this.normalizeBars(bars);
    };

    for (const tfKey of wantedTfKeys) {
      ensureCandles(tfKey);
    }

    const structureScore = Math.round(Math.max(0, Math.min(100,
      Math.abs(directionScore) * 0.5 +
      clusterScore * 0.3 +
      decompressionScore * 0.2
    )));

    const structureZones = [
      ...clusters.slice(0, 4).map((cluster) => ({
        type: cluster.avgLevel >= currentPrice ? 'supply' as const : 'demand' as const,
        top: cluster.avgLevel + atr * 0.15,
        bottom: cluster.avgLevel - atr * 0.15,
        tf: cluster.tfs[0] || 'cluster',
        strength: Math.min(100, 45 + cluster.tfs.length * 15),
      })),
      ...mid50Levels
        .slice(0, 2)
        .map((level) => ({
          type: level.level >= currentPrice ? 'supply' as const : 'demand' as const,
          top: level.level + atr * 0.08,
          bottom: level.level - atr * 0.08,
          tf: level.tf,
          strength: level.isDecompressing ? 70 : 50,
        })),
    ].slice(0, 6);

    const primaryTfForStructure = primaryTFConfig ? this.getCanonicalTimeframeId(primaryTFConfig) : modeConfig.primaryTF.toUpperCase();
    const structurePatterns: { name: string; tf: string; bias: 'bullish' | 'bearish'; confidence: number }[] =
      direction === 'neutral'
        ? []
        : [{
            name: signalStrength === 'strong' ? 'Structure Expansion' : 'Directional Structure Bias',
            tf: primaryTfForStructure,
            bias: direction,
            confidence: Math.round(Math.max(35, Math.min(95, (Math.abs(directionScore) * 0.45) + (decompressionScore * 0.55)))),
          }];

    const structure = {
      zones: structureZones,
      patterns: structurePatterns,
      structureScore,
    };
    
    return {
      mode: scanMode,
      modeLabel: modeConfig.label,
      primaryTF: modeConfig.primaryTF,
      currentPrice,
      isLivePrice,
      includedTFs,
      decompression,
      mid50Levels,
      clusters,
      candleCloseConfluence,
      prediction: {
        direction,
        confidence: Math.round(confidence),
        reasoning: reasoningParts.join(' | ') || 'No confluence detected',
        targetLevel,
        expectedMoveTime,
      },
      tradeSetup,
      signalStrength,
      scoreBreakdown,
      candlesByTf,
      structure,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL HISTORY SCAN - Learn from every confluence event
  // ═══════════════════════════════════════════════════════════════════════════

  // Get default learning for symbols with no data
  private getDefaultLearning(symbol: string): SymbolLearning {
    return {
      symbol,
      lastUpdated: Date.now(),
      totalEvents: 0,
      tfDecompressionStats: new Map(),
      stackOutcomes: new Map(),
      hotZoneStats: {
        count: 0,
        upPct: 50,
        downPct: 50,
        avgMagnitude: 0.5,
        avgDecompMins: 30,
      },
      clusterStats: {
        withCluster: { count: 0, upPct: 50, avgMag: 0.5 },
        withoutCluster: { count: 0, upPct: 50, avgMag: 0.5 },
      },
    };
  }

  async scanFullHistory(symbol: string): Promise<{
    events: ConfluenceEvent[];
    learning: SymbolLearning;
  }> {
    console.log(`🔍 Scanning full history for ${symbol}...`);
    
    const baseBars = await this.fetchHistoricalData(symbol, '30min');
    
    // Handle empty or insufficient data gracefully
    if (!baseBars || baseBars.length === 0) {
      console.log(`⚠️ No data returned for ${symbol}`);
      return {
        events: [],
        learning: this.getDefaultLearning(symbol),
      };
    }
    
    if (baseBars.length < 200) {
      console.log(`⚠️ Insufficient data for ${symbol}: only ${baseBars.length} bars, need 200+`);
      return {
        events: [],
        learning: this.getDefaultLearning(symbol),
      };
    }
    
    console.log(`📊 Loaded ${baseBars.length} 30-min bars`);
    
    // Resample to all timeframes
    const tfData: Map<string, OHLCV[]> = new Map();
    for (const tf of TIMEFRAMES) {
      tfData.set(tf.tf, this.resampleBars(baseBars, tf.minutes));
    }
    
    const events: ConfluenceEvent[] = [];
    const atr = this.calculateATR(baseBars);
    
    // Initialize learning stats
    const tfDecompressionStats = new Map<string, {
      events: DecompressionEvent[];
    }>();
    for (const tf of TIMEFRAMES) {
      tfDecompressionStats.set(tf.tf, { events: [] });
    }
    
    // Scan through time, checking for confluence events
    const scanInterval = 30 * 60 * 1000; // Check every 30 mins
    const startTime = baseBars[100].time;
    const endTime = baseBars[baseBars.length - 50].time;
    
    for (let currentTime = startTime; currentTime < endTime; currentTime += scanInterval) {
      // Calculate stack at this point in time
      let stack = 0;
      const activeTFs: string[] = [];
      const hotZoneTFs: string[] = [];
      const mid50Levels: { tf: string; level: number; distance: number }[] = [];
      
      // Find current base bar index
      const baseIdx = baseBars.findIndex(b => b.time >= currentTime);
      if (baseIdx < 0) continue;
      const currentPrice = baseBars[baseIdx].close;
      
      for (const tfConfig of TIMEFRAMES) {
        const tfBars = tfData.get(tfConfig.tf)!;
        const tfMs = tfConfig.minutes * 60 * 1000;
        const periodStart = Math.floor(currentTime / tfMs) * tfMs;
        const periodEnd = periodStart + tfMs;
        const timeSincePeriodStart = currentTime - periodStart;
        const timeToClose = periodEnd - currentTime;
        
        // Find TF bar index
        const tfIdx = tfBars.findIndex(b => b.time === periodStart);
        
        // Check post-close window
        if (timeSincePeriodStart <= tfConfig.postCloseWindow * 60 * 1000) {
          activeTFs.push(tfConfig.tf);
          stack++;
        }
        
        // Check pre-close window (for 3h+)
        if (tfConfig.preCloseStart && tfConfig.preCloseEnd) {
          const preStartMs = tfConfig.preCloseStart * 60 * 1000;
          const preEndMs = tfConfig.preCloseEnd * 60 * 1000;
          if (timeToClose <= preStartMs && timeToClose > preEndMs) {
            if (!activeTFs.includes(tfConfig.tf)) {
              activeTFs.push(tfConfig.tf + '-pre');
              stack++;
            }
          }
        }
        
        // Check hot zone (closing within 5 mins)
        if (timeToClose <= 5 * 60 * 1000 && timeToClose > 0) {
          hotZoneTFs.push(tfConfig.tf);
        }
        
        // Get 50% level
        if (tfIdx > 0) {
          const mid50 = this.hl2(tfBars[tfIdx - 1]);
          const distance = ((currentPrice - mid50) / mid50) * 100;
          mid50Levels.push({ tf: tfConfig.tf, level: mid50, distance });
        }
      }
      
      const isHotZone = hotZoneTFs.length >= 3;
      
      // Count clusters
      let clusters = 0;
      for (let i = 0; i < mid50Levels.length; i++) {
        for (let j = i + 1; j < mid50Levels.length; j++) {
          if (Math.abs(mid50Levels[i].level - mid50Levels[j].level) <= atr) {
            clusters++;
          }
        }
      }
      
      // Record significant confluence events
      if (stack >= 5 || isHotZone || clusters >= 2) {
        // Analyze decompression for each active TF
        const decompressions: DecompressionEvent[] = [];
        
        for (const tfConfig of TIMEFRAMES) {
          const tfBars = tfData.get(tfConfig.tf)!;
          const tfMs = tfConfig.minutes * 60 * 1000;
          const periodStart = Math.floor(currentTime / tfMs) * tfMs;
          const tfIdx = tfBars.findIndex(b => b.time === periodStart);
          
          if (tfIdx > 0) {
            const decomp = this.analyzeDecompression(baseBars, tfConfig, tfBars, tfIdx);
            if (decomp) {
              decompressions.push(decomp);
              tfDecompressionStats.get(tfConfig.tf)!.events.push(decomp);
            }
          }
        }
        
        // Calculate overall outcome
        const outcome8 = this.calculateOutcome(baseBars, baseIdx, 8, currentPrice);
        const outcome24 = this.calculateOutcome(baseBars, baseIdx, 24, currentPrice);
        
        events.push({
          timestamp: currentTime,
          price: currentPrice,
          stack,
          activeTFs,
          isHotZone,
          clusters,
          decompressions,
          overallOutcome: {
            direction: outcome24.magnitude > 0.5 ? 'up' : outcome24.magnitude < -0.5 ? 'down' : 'sideways',
            magnitude: outcome24.magnitude,
            barsToSignificantMove: decompressions[0]?.decompressionStartBar || 0,
          },
        });
      }
    }
    
    console.log(`✅ Found ${events.length} confluence events`);
    
    // Build learning summary
    const learning = this.buildLearning(symbol, events, tfDecompressionStats);
    
    // Cache the learning
    this.learningCache.set(symbol, learning);
    
    return { events, learning };
  }

  private buildLearning(
    symbol: string,
    events: ConfluenceEvent[],
    tfDecompStats: Map<string, { events: DecompressionEvent[] }>
  ): SymbolLearning {
    
    // Build TF-specific stats
    const tfDecompressionStats = new Map<string, {
      avgDecompBars: number;
      avgDecompMins: number;
      upPct: number;
      downPct: number;
      avgMagnitude: number;
      mid50BounceRate: number;
      mid50BreakRate: number;
    }>();
    
    for (const [tf, data] of tfDecompStats) {
      if (data.events.length === 0) continue;
      
      const upCount = data.events.filter(e => e.decompressionDirection === 'up').length;
      const downCount = data.events.filter(e => e.decompressionDirection === 'down').length;
      const bounceCount = data.events.filter(e => e.mid50Action === 'bounce').length;
      const breakCount = data.events.filter(e => e.mid50Action === 'break').length;
      
      tfDecompressionStats.set(tf, {
        avgDecompBars: data.events.reduce((s, e) => s + e.decompressionStartBar, 0) / data.events.length,
        avgDecompMins: data.events.reduce((s, e) => s + e.decompressionStartMins, 0) / data.events.length,
        upPct: (upCount / data.events.length) * 100,
        downPct: (downCount / data.events.length) * 100,
        avgMagnitude: data.events.reduce((s, e) => s + Math.abs(e.decompressionMagnitude), 0) / data.events.length,
        mid50BounceRate: (bounceCount / data.events.length) * 100,
        mid50BreakRate: (breakCount / data.events.length) * 100,
      });
    }
    
    // Build stack-based outcomes
    const stackOutcomes = new Map<number, {
      count: number;
      upPct: number;
      downPct: number;
      avgMagnitude: number;
      avgBarsToMove: number;
    }>();
    
    for (let stack = 5; stack <= 9; stack++) {
      const stackEvents = events.filter(e => 
        stack === 9 ? e.stack >= 9 : e.stack === stack
      );
      
      if (stackEvents.length > 0) {
        const upCount = stackEvents.filter(e => e.overallOutcome.direction === 'up').length;
        const downCount = stackEvents.filter(e => e.overallOutcome.direction === 'down').length;
        
        stackOutcomes.set(stack, {
          count: stackEvents.length,
          upPct: (upCount / stackEvents.length) * 100,
          downPct: (downCount / stackEvents.length) * 100,
          avgMagnitude: stackEvents.reduce((s, e) => s + Math.abs(e.overallOutcome.magnitude), 0) / stackEvents.length,
          avgBarsToMove: stackEvents.reduce((s, e) => s + e.overallOutcome.barsToSignificantMove, 0) / stackEvents.length,
        });
      }
    }
    
    // Hot zone stats
    const hotZoneEvents = events.filter(e => e.isHotZone);
    const hotZoneUp = hotZoneEvents.filter(e => e.overallOutcome.direction === 'up').length;
    const hotZoneDown = hotZoneEvents.filter(e => e.overallOutcome.direction === 'down').length;
    
    // Cluster stats
    const withCluster = events.filter(e => e.clusters > 0);
    const withoutCluster = events.filter(e => e.clusters === 0);
    
    return {
      symbol,
      lastUpdated: Date.now(),
      totalEvents: events.length,
      tfDecompressionStats,
      stackOutcomes,
      hotZoneStats: {
        count: hotZoneEvents.length,
        upPct: hotZoneEvents.length > 0 ? (hotZoneUp / hotZoneEvents.length) * 100 : 50,
        downPct: hotZoneEvents.length > 0 ? (hotZoneDown / hotZoneEvents.length) * 100 : 50,
        avgMagnitude: hotZoneEvents.length > 0 
          ? hotZoneEvents.reduce((s, e) => s + Math.abs(e.overallOutcome.magnitude), 0) / hotZoneEvents.length 
          : 0,
        avgDecompMins: hotZoneEvents.length > 0
          ? hotZoneEvents.reduce((s, e) => s + (e.decompressions[0]?.decompressionStartMins || 0), 0) / hotZoneEvents.length
          : 0,
      },
      clusterStats: {
        withCluster: {
          count: withCluster.length,
          upPct: withCluster.length > 0 
            ? (withCluster.filter(e => e.overallOutcome.direction === 'up').length / withCluster.length) * 100 
            : 50,
          avgMag: withCluster.length > 0
            ? withCluster.reduce((s, e) => s + Math.abs(e.overallOutcome.magnitude), 0) / withCluster.length
            : 0,
        },
        withoutCluster: {
          count: withoutCluster.length,
          upPct: withoutCluster.length > 0
            ? (withoutCluster.filter(e => e.overallOutcome.direction === 'up').length / withoutCluster.length) * 100
            : 50,
          avgMag: withoutCluster.length > 0
            ? withoutCluster.reduce((s, e) => s + Math.abs(e.overallOutcome.magnitude), 0) / withoutCluster.length
            : 0,
        },
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORECAST GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  async generateForecast(symbol: string): Promise<FullForecast> {
    console.log(`🔮 Generating forecast for ${symbol}...`);
    
    // Get or build learning
    let learning = this.learningCache.get(symbol);
    if (!learning) {
      const scan = await this.scanFullHistory(symbol);
      learning = scan.learning;
    }
    
    // Get current data
    const baseBars = await this.fetchHistoricalData(symbol, '30min');
    
    // Handle empty data gracefully
    if (!baseBars || baseBars.length === 0) {
      throw new Error(`No price data available for ${symbol}. Please check the symbol or try again later.`);
    }
    
    const currentPrice = baseBars[baseBars.length - 1].close;
    const currentTime = Date.now();
    const atr = this.calculateATR(baseBars);
    
    // Calculate current state
    let stack = 0;
    const activeTFs: string[] = [];
    const hotZoneTFs: string[] = [];
    const upcomingTFCloses: { tf: string; minsAway: number }[] = [];
    const mid50Levels: { tf: string; level: number; distance: number }[] = [];
    
    for (const tfConfig of TIMEFRAMES) {
      const tfBars = this.resampleBars(baseBars, tfConfig.minutes);
      const tfMs = tfConfig.minutes * 60 * 1000;
      const periodStart = Math.floor(currentTime / tfMs) * tfMs;
      const periodEnd = periodStart + tfMs;
      const timeSincePeriodStart = currentTime - periodStart;
      const timeToClose = periodEnd - currentTime;
      const minsToClose = Math.floor(timeToClose / 60000);
      
      upcomingTFCloses.push({ tf: tfConfig.label, minsAway: minsToClose });
      
      // Check post-close window
      if (timeSincePeriodStart <= tfConfig.postCloseWindow * 60 * 1000) {
        activeTFs.push(tfConfig.label);
        stack++;
      }
      
      // Check pre-close window
      if (tfConfig.preCloseStart && tfConfig.preCloseEnd) {
        const preStartMs = tfConfig.preCloseStart * 60 * 1000;
        const preEndMs = tfConfig.preCloseEnd * 60 * 1000;
        if (timeToClose <= preStartMs && timeToClose > preEndMs) {
          if (!activeTFs.includes(tfConfig.label)) {
            activeTFs.push(tfConfig.label + '-pre');
            stack++;
          }
        }
      }
      
      // Hot zone
      if (minsToClose <= 5) {
        hotZoneTFs.push(tfConfig.label);
      }
      
      // 50% level
      if (tfBars.length >= 2) {
        const mid50 = this.hl2(tfBars[tfBars.length - 2]);
        const distance = ((currentPrice - mid50) / mid50) * 100;
        mid50Levels.push({ tf: tfConfig.label, level: mid50, distance });
      }
    }
    
    mid50Levels.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
    
    // Count clusters
    let clusters = 0;
    for (let i = 0; i < mid50Levels.length; i++) {
      for (let j = i + 1; j < mid50Levels.length; j++) {
        if (Math.abs(mid50Levels[i].level - mid50Levels[j].level) <= atr) {
          clusters++;
        }
      }
    }
    
    const isHotZone = hotZoneTFs.length >= 3;
    
    // Sort upcoming closes
    upcomingTFCloses.sort((a, b) => a.minsAway - b.minsAway);
    
    // Predict next confluence
    let nextConfluenceIn = 0;
    let potentialStack = 0;
    for (const upcoming of upcomingTFCloses.slice(0, 5)) {
      potentialStack++;
      if (potentialStack >= 5) {
        nextConfluenceIn = upcoming.minsAway;
        break;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DECOMPRESSION PULL ANALYSIS - The core prediction driver
    // Scan all TFs for active decompression windows and calculate pull direction
    // ═══════════════════════════════════════════════════════════════════════════
    const decompPull = this.analyzeDecompressionPull(baseBars, currentPrice, currentTime);
    console.log(`🔄 Decompression Analysis: ${decompPull.activeCount} TFs active, pull=${decompPull.netPullDirection} (bias: ${decompPull.pullBias.toFixed(1)})`);
    
    // Build prediction using learned patterns + decompression pull
    let prediction = this.buildPrediction(learning, {
      stack,
      isHotZone,
      clusters,
      nearestMid50Distance: mid50Levels[0]?.distance || 0,
      currentPrice,
      atr,
      decompPull, // Pass decompression analysis to prediction builder
    });

    // Apply live learning stats if available
    const liveStats = await this.getLearningStats(symbol);
    if (liveStats) {
      const blendedConfidence = Math.round((prediction.confidence + liveStats.win_rate) / 2);
      prediction = {
        ...prediction,
        confidence: Math.min(90, Math.max(10, blendedConfidence)),
        expectedDecompMins: Math.round(Math.max(1, liveStats.avg_time_to_move_mins || prediction.expectedDecompMins)),
      };
    }
    
    // Get AI analysis
    const aiAnalysis = await this.getAIAnalysis(symbol, learning, {
      stack,
      activeTFs,
      isHotZone,
      hotZoneTFs,
      clusters,
      mid50Levels,
      upcomingTFCloses,
      prediction,
    });
    
    return {
      symbol,
      timestamp: currentTime,
      currentPrice,
      currentState: {
        stack,
        activeTFs,
        isHotZone,
        hotZoneTFs,
        clusters,
        mid50Levels,
        nearestMid50: mid50Levels[0] || null,
        // Include decompression pull analysis
        decompression: decompPull.activeCount > 0 ? {
          activeCount: decompPull.activeCount,
          netPullDirection: decompPull.netPullDirection,
          pullBias: decompPull.pullBias,
          activeTFs: decompPull.decompressions
            .filter(d => d.isDecompressing)
            .map(d => ({
              tf: d.tf,
              minsToClose: d.minsToClose,
              mid50Level: d.mid50Level,
              pullDirection: d.pullDirection,
            })),
        } : undefined,
      },
      upcoming: {
        nextConfluenceIn,
        upcomingTFCloses,
        nextHotZoneIn: hotZoneTFs.length >= 2 ? upcomingTFCloses[0]?.minsAway : null,
      },
      prediction,
      historical: {
        similarEvents: learning.totalEvents,
        winRate: liveStats?.win_rate ?? (prediction.direction === 'bullish' 
          ? (learning.stackOutcomes.get(stack)?.upPct || 50)
          : (learning.stackOutcomes.get(stack)?.downPct || 50)),
        avgMoveAfterSimilar: liveStats?.avg_move_pct ?? Math.abs(learning.stackOutcomes.get(stack)?.avgMagnitude || 0.5),
        avgDecompMins: liveStats?.avg_time_to_move_mins ?? Math.round(Math.abs(learning.tfDecompressionStats.get('60')?.avgDecompMins || 30)),
        typicalMid50Reaction: this.getTypicalMid50Reaction(learning),
      },
      aiAnalysis,
    };
  }

  private buildPrediction(
    learning: SymbolLearning,
    context: {
      stack: number;
      isHotZone: boolean;
      clusters: number;
      nearestMid50Distance: number;
      currentPrice: number;
      atr: number;
      decompPull?: DecompressionAnalysis;
    }
  ): Prediction {
    const { stack, isHotZone, clusters, nearestMid50Distance, currentPrice, atr, decompPull } = context;
    
    // Get stack-based bias
    const stackStats = learning.stackOutcomes.get(Math.min(stack, 9));
    let upBias = stackStats?.upPct || 50;
    let downBias = stackStats?.downPct || 50;
    let avgMag = stackStats?.avgMagnitude || 0.5;
    let avgDecompBars = stackStats?.avgBarsToMove || 4;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DECOMPRESSION PULL - Primary direction indicator
    // When TFs are actively decompressing, they pull price toward their 50% levels
    // ═══════════════════════════════════════════════════════════════════════════
    if (decompPull && decompPull.activeCount > 0) {
      // Weight decompression heavily - it's the time-based edge
      const pullWeight = Math.min(30, decompPull.activeCount * 5 + decompPull.netPullStrength);
      
      if (decompPull.netPullDirection === 'bullish') {
        upBias += pullWeight;
        console.log(`🔼 Bullish decompression pull: +${pullWeight}% to upBias (now ${upBias}%)`);
      } else if (decompPull.netPullDirection === 'bearish') {
        downBias += pullWeight;
        console.log(`🔽 Bearish decompression pull: +${pullWeight}% to downBias (now ${downBias}%)`);
      }
      
      // Increase magnitude expectation when multiple TFs decompressing
      if (decompPull.activeCount >= 3) {
        avgMag *= 1.3;
      }
    }
    
    // Adjust for hot zone
    if (isHotZone) {
      if (learning.hotZoneStats.upPct > 55) {
        upBias += 10;
      } else if (learning.hotZoneStats.downPct > 55) {
        downBias += 10;
      }
      avgMag = Math.max(avgMag, learning.hotZoneStats.avgMagnitude);
    }
    
    // Adjust for clusters
    if (clusters > 0) {
      const clusterBias = learning.clusterStats.withCluster.upPct;
      upBias = (upBias + clusterBias) / 2;
      avgMag = Math.max(avgMag, learning.clusterStats.withCluster.avgMag);
    }
    
    // Adjust for distance to 50%
    if (Math.abs(nearestMid50Distance) < 0.25) {
      // Very close to 50% - likely bounce
      avgMag *= 1.2;
    }
    
    // Determine direction - decompression pull is the primary driver
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let confidence = 50;
    
    // If we have active decompressions, use that as primary signal
    if (decompPull && decompPull.activeCount >= 2) {
      if (decompPull.netPullDirection === 'bullish') {
        direction = 'bullish';
        confidence = Math.min(85, 50 + decompPull.pullBias * 0.3);
      } else if (decompPull.netPullDirection === 'bearish') {
        direction = 'bearish';
        confidence = Math.min(85, 50 - decompPull.pullBias * 0.3);
      }
    } else if (upBias > downBias + 10) {
      direction = 'bullish';
      confidence = Math.min(85, upBias);
    } else if (downBias > upBias + 10) {
      direction = 'bearish';
      confidence = Math.min(85, downBias);
    } else {
      direction = nearestMid50Distance > 0 ? 'bearish' : 'bullish';
      confidence = 55;
    }
    
    // Calculate targets
    const moveSize = (avgMag / 100) * currentPrice;
    const targetPrice = direction === 'bullish' 
      ? currentPrice + moveSize 
      : currentPrice - moveSize;
    const stopLoss = direction === 'bullish'
      ? currentPrice - (atr * 1.5)
      : currentPrice + (atr * 1.5);
    
    // Time horizon based on decompression timing
    // Ensure decompMins is a valid positive number
    let decompMins = learning.tfDecompressionStats.get('60')?.avgDecompMins;
    if (!decompMins || decompMins < 0 || !isFinite(decompMins)) {
      decompMins = 30; // Default fallback
    }
    decompMins = Math.round(Math.abs(decompMins)); // Ensure positive integer
    
    const timeHorizon = decompMins < 30 ? '1h' : decompMins < 60 ? '2h' : decompMins < 120 ? '4h' : '8h';
    
    return {
      direction,
      confidence,
      expectedDecompMins: decompMins,
      targetPrice,
      stopLoss,
      timeHorizon,
      reasoning: this.buildReasoning(learning, context, direction, confidence),
    };
  }

  private buildReasoning(
    learning: SymbolLearning,
    context: { stack: number; isHotZone: boolean; clusters: number; nearestMid50Distance: number; decompPull?: DecompressionAnalysis },
    direction: string,
    confidence: number
  ): string {
    const parts: string[] = [];
    
    // Decompression is the primary driver - show it first
    if (context.decompPull && context.decompPull.activeCount > 0) {
      const activeDecomps = context.decompPull.decompressions.filter(d => d.isDecompressing);
      const tfs = activeDecomps.map(d => d.tf).join(', ');
      parts.push(`🔄 ${context.decompPull.activeCount} TFs decompressing (${tfs}) → ${context.decompPull.netPullDirection.toUpperCase()} pull`);
      
      // Show which 50% levels are pulling price
      const pulls = activeDecomps.filter(d => d.pullDirection !== 'none').slice(0, 3);
      for (const p of pulls) {
        const arrow = p.pullDirection === 'up' ? '↑' : '↓';
        parts.push(`${p.tf} ${arrow} ${p.mid50Level.toFixed(2)} (${p.minsToClose}m to close)`);
      }
    }
    
    if (context.stack >= 5) {
      parts.push(`Stack of ${context.stack} active time windows`);
    }
    
    if (context.isHotZone) {
      parts.push(`Hot zone with ${learning.hotZoneStats.upPct.toFixed(0)}% historical up bias`);
    }
    
    if (context.clusters > 0) {
      parts.push(`${context.clusters} clustered 50% levels`);
    }
    
    if (Math.abs(context.nearestMid50Distance) < 0.5) {
      parts.push(`Price near 50% level (${context.nearestMid50Distance.toFixed(2)}%)`);
    }
    
    const decompStats = learning.tfDecompressionStats.get('60');
    if (decompStats) {
      parts.push(`Typical decompression: ${decompStats.avgDecompMins.toFixed(0)} mins, ${decompStats.avgMagnitude.toFixed(2)}% move`);
    }
    
    return parts.join('. ') + '.';
  }

  private getTypicalMid50Reaction(learning: SymbolLearning): string {
    let bounceTotal = 0;
    let breakTotal = 0;
    let count = 0;
    
    for (const [, stats] of learning.tfDecompressionStats) {
      bounceTotal += stats.mid50BounceRate;
      breakTotal += stats.mid50BreakRate;
      count++;
    }
    
    if (count === 0) return 'unknown';
    
    const avgBounce = bounceTotal / count;
    const avgBreak = breakTotal / count;
    
    if (avgBounce > avgBreak + 10) return 'tends to bounce';
    if (avgBreak > avgBounce + 10) return 'tends to break';
    return 'mixed reaction';
  }

  private async getAIAnalysis(
    symbol: string,
    learning: SymbolLearning,
    context: {
      stack: number;
      activeTFs: string[];
      isHotZone: boolean;
      hotZoneTFs: string[];
      clusters: number;
      mid50Levels: { tf: string; level: number; distance: number }[];
      upcomingTFCloses: { tf: string; minsAway: number }[];
      prediction: Prediction;
    }
  ): Promise<string> {
    const prompt = `Analyze this confluence state for ${symbol}:

CURRENT STATE:
- Stack: ${context.stack} (active TFs: ${context.activeTFs.join(', ') || 'none'})
- Hot Zone: ${context.isHotZone ? `YES (${context.hotZoneTFs.join(', ')})` : 'No'}
- Clusters: ${context.clusters} pairs of 50% levels within ATR
- Nearest 50%: ${context.mid50Levels[0]?.tf || 'N/A'} at ${context.mid50Levels[0]?.distance.toFixed(2) || 0}% distance

UPCOMING:
${context.upcomingTFCloses.slice(0, 5).map(t => `- ${t.tf} closes in ${t.minsAway} mins`).join('\n')}

LEARNED PATTERNS (${learning.totalEvents} historical events):
- Typical decompression: ${learning.tfDecompressionStats.get('60')?.avgDecompMins.toFixed(0) || '?'} mins after close
- Stack ${context.stack} historically: ${learning.stackOutcomes.get(context.stack)?.upPct.toFixed(0) || '?'}% up / ${learning.stackOutcomes.get(context.stack)?.downPct.toFixed(0) || '?'}% down
- Hot zone outcomes: ${learning.hotZoneStats.upPct.toFixed(0)}% up, avg move ${learning.hotZoneStats.avgMagnitude.toFixed(2)}%
- 50% level reaction: ${this.getTypicalMid50Reaction(learning)}

PREDICTION: ${context.prediction.direction.toUpperCase()} (${context.prediction.confidence}% confidence)
- Target: $${context.prediction.targetPrice.toFixed(2)}
- Stop: $${context.prediction.stopLoss.toFixed(2)}
- Expected move in: ${context.prediction.expectedDecompMins} minutes

Provide a concise analysis (3-4 sentences) explaining:
1. What the confluence state means RIGHT NOW
2. When price should start decompressing (moving)
3. The most likely direction based on learned patterns
4. Key 50% levels to watch`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert in Time Confluence analysis. You understand that:
- Stack = how many timeframe post-close or pre-close windows are currently active
- Higher stacks indicate more volatility potential
- Hot Zones = 3+ TFs closing within 5 mins = imminent move
- 50% levels = prior bar midpoints across timeframes act as S/R
- Decompression = when price starts moving after a confluence event
- Clusters = multiple 50% levels grouped together = stronger S/R

Be direct and actionable. Focus on TIMING (when will price move) and DIRECTION.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || 'Analysis unavailable';
  }
}

// Export singleton instance
export const confluenceLearningAgent = new ConfluenceLearningAgent();
