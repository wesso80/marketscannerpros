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
  // Daily/Swing
  { tf: 'D',   label: '1D',  minutes: 1440, postCloseWindow: 60, decompStart: 60 },
  { tf: '2D',  label: '2D',  minutes: 2880, postCloseWindow: 90, decompStart: 120 },
  { tf: '3D',  label: '3D',  minutes: 4320, postCloseWindow: 120, decompStart: 180 },
  { tf: 'W',   label: '1W',  minutes: 10080, postCloseWindow: 240, decompStart: 390 },
  // Macro
  { tf: '2W',  label: '2W',  minutes: 20160, postCloseWindow: 480, decompStart: 780 },
  { tf: 'M',   label: '1M',  minutes: 43200, postCloseWindow: 720, decompStart: 1560 },
  { tf: '3M',  label: '3M',  minutes: 129600, postCloseWindow: 1440, decompStart: 4680 },
  { tf: 'Y',   label: '1Y',  minutes: 525600, postCloseWindow: 2880, decompStart: 18720 },
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

interface DecompressionAnalysis {
  decompressions: DecompressionPull[];
  activeCount: number;
  netPullDirection: 'bullish' | 'bearish' | 'neutral';
  netPullStrength: number;                 // Aggregate pull strength
  pullBias: number;                        // -100 to +100 (negative=bearish, positive=bullish)
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HIERARCHICAL SCAN RESULT
// ═══════════════════════════════════════════════════════════════════════════

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
        const base = symbol.replace('USD', '').replace('USDT', '');
        const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=USD&apikey=${ALPHA_VANTAGE_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data['Realtime Currency Exchange Rate']) {
          const rate = data['Realtime Currency Exchange Rate']['5. Exchange Rate'];
          return parseFloat(rate);
        }
      } else {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data['Global Quote'] && data['Global Quote']['05. price']) {
          return parseFloat(data['Global Quote']['05. price']);
        }
      }
    } catch (err) {
      console.warn('Live price fetch failed:', err);
    }
    
    return null;
  }

  async fetchHistoricalData(symbol: string, interval: string = '30min'): Promise<OHLCV[]> {
    const isCrypto = symbol.includes('USD') && !symbol.includes('/');
    
    let url: string;
    if (isCrypto) {
      const base = symbol.replace('USD', '').replace('USDT', '');
      url = `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${base}&market=USD&interval=${interval}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
    } else {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    const timeSeriesKey = Object.keys(data).find(k => k.includes('Time Series'));
    if (!timeSeriesKey || !data[timeSeriesKey]) {
      console.error('No data returned:', data);
      return [];
    }

    const timeSeries = data[timeSeriesKey];
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
    
    for (const tfConfig of TIMEFRAMES) {
      const tfMs = tfConfig.minutes * 60 * 1000;
      const periodStart = Math.floor(currentTime / tfMs) * tfMs;
      const periodEnd = periodStart + tfMs;
      const timeToClose = periodEnd - currentTime;
      const minsToClose = Math.floor(timeToClose / 60000);
      
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
    
    let bullishPull = 0;
    let bearishPull = 0;
    const pullReasons: string[] = [];
    
    for (const d of activeDecomps) {
      if (d.pullDirection === 'up') {
        bullishPull += d.pullStrength;
        pullReasons.push(`${d.tf} pulling UP to ${d.mid50Level.toFixed(2)} (${d.minsToClose}m to close)`);
      } else if (d.pullDirection === 'down') {
        bearishPull += d.pullStrength;
        pullReasons.push(`${d.tf} pulling DOWN to ${d.mid50Level.toFixed(2)} (${d.minsToClose}m to close)`);
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
    
    const reasoning = activeCount > 0 
      ? `${activeCount} TFs decompressing: ${pullReasons.join(', ')}`
      : 'No active decompressions - wait for TFs to enter decompression window';
    
    return {
      decompressions,
      activeCount,
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
      throw new Error(`No price data for ${symbol}`);
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
    
    for (const tfConfig of includedTFConfigs) {
      const tfMs = tfConfig.minutes * 60 * 1000;
      const periodStart = Math.floor(currentTime / tfMs) * tfMs;
      const periodEnd = periodStart + tfMs;
      const timeToClose = periodEnd - currentTime;
      const minsToClose = Math.floor(timeToClose / 60000);
      
      // Resample for 50% level
      const tfBars = this.resampleBars(baseBars, tfConfig.minutes);
      if (tfBars.length < 2) continue;
      
      const mid50Level = this.hl2(tfBars[tfBars.length - 2]);
      const distanceToMid50 = ((currentPrice - mid50Level) / mid50Level) * 100;
      
      // Check decompression
      const decompStart = tfConfig.decompStart || 0;
      const isDecompressing = decompStart > 0 && minsToClose <= decompStart && minsToClose > 0;
      
      let pullDirection: 'up' | 'down' | 'none' = 'none';
      let pullStrength = 0;
      
      if (isDecompressing) {
        pullDirection = mid50Level > currentPrice ? 'up' : mid50Level < currentPrice ? 'down' : 'none';
        const closenessScore = (decompStart - minsToClose) / decompStart * 5;
        const tfWeight = Math.log2(tfConfig.minutes / 5) * 0.5;
        const distanceScore = Math.max(0, 2 - Math.abs(distanceToMid50) * 2);
        pullStrength = Math.min(10, closenessScore + tfWeight + distanceScore);
      }
      
      allDecomps.push({
        tf: tfConfig.label,
        isDecompressing,
        minsToClose,
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
    let bullishPull = 0;
    let bearishPull = 0;
    const pullReasons: string[] = [];
    
    for (const d of activeDecomps) {
      if (d.pullDirection === 'up') {
        bullishPull += d.pullStrength;
        pullReasons.push(`${d.tf}→${d.mid50Level.toFixed(2)}`);
      } else if (d.pullDirection === 'down') {
        bearishPull += d.pullStrength;
        pullReasons.push(`${d.tf}→${d.mid50Level.toFixed(2)}`);
      }
    }
    
    const netPullStrength = bullishPull + bearishPull;
    const pullBias = netPullStrength > 0 ? ((bullishPull - bearishPull) / netPullStrength) * 100 : 0;
    let netPullDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (pullBias > 20) netPullDirection = 'bullish';
    else if (pullBias < -20) netPullDirection = 'bearish';
    
    const decompression: DecompressionAnalysis = {
      decompressions: allDecomps,
      activeCount: activeDecomps.length,
      netPullDirection,
      netPullStrength,
      pullBias,
      reasoning: activeDecomps.length > 0 
        ? `${activeDecomps.length} TFs decompressing: ${pullReasons.join(', ')}`
        : 'No active decompressions',
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
    
    // Build prediction
    let direction: 'bullish' | 'bearish' | 'neutral' = netPullDirection;
    let confidence = Math.min(90, 40 + activeDecomps.length * 10 + clusters.length * 5);
    let targetLevel = currentPrice;
    
    // Find target: nearest cluster or strongest decompressing 50%
    if (clusters.length > 0) {
      // Sort clusters by proximity to price
      clusters.sort((a, b) => Math.abs(a.avgLevel - currentPrice) - Math.abs(b.avgLevel - currentPrice));
      targetLevel = clusters[0].avgLevel;
    } else if (activeDecomps.length > 0) {
      // Use strongest decompressing TF's 50%
      const strongest = activeDecomps.sort((a, b) => b.pullStrength - a.pullStrength)[0];
      targetLevel = strongest.mid50Level;
    }
    
    // Adjust direction based on target
    if (targetLevel > currentPrice * 1.001) direction = 'bullish';
    else if (targetLevel < currentPrice * 0.999) direction = 'bearish';
    
    // Determine signal strength
    let signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal' = 'no_signal';
    if (activeDecomps.length >= modeConfig.minConfluence && clusters.length >= 1) {
      signalStrength = 'strong';
    } else if (activeDecomps.length >= modeConfig.minConfluence - 1) {
      signalStrength = 'moderate';
    } else if (activeDecomps.length >= 1) {
      signalStrength = 'weak';
    }
    
    // Build reasoning
    const reasoningParts: string[] = [];
    if (activeDecomps.length > 0) {
      reasoningParts.push(`${activeDecomps.length} TFs decompressing toward 50%`);
    }
    if (clusters.length > 0) {
      reasoningParts.push(`${clusters.length} 50% cluster(s) detected`);
    }
    if (netPullDirection !== 'neutral') {
      reasoningParts.push(`Net pull ${netPullDirection} (bias: ${pullBias.toFixed(0)}%)`);
    }
    
    // Expected move time based on nearest close
    const nearestClose = allDecomps
      .filter(d => d.isDecompressing)
      .sort((a, b) => a.minsToClose - b.minsToClose)[0];
    const expectedMoveTime = nearestClose 
      ? `${nearestClose.minsToClose}m (${nearestClose.tf} close)`
      : 'Wait for decompression';
    
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
      prediction: {
        direction,
        confidence,
        reasoning: reasoningParts.join(' | ') || 'No confluence detected',
        targetLevel,
        expectedMoveTime,
      },
      tradeSetup,
      signalStrength,
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
