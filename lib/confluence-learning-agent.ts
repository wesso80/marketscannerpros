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
  { tf: '30',  label: '30m', minutes: 30,  postCloseWindow: 10 },
  { tf: '60',  label: '1h',  minutes: 60,  postCloseWindow: 15 },
  { tf: '120', label: '2h',  minutes: 120, postCloseWindow: 20 },
  { tf: '180', label: '3h',  minutes: 180, postCloseWindow: 25, preCloseStart: 25, preCloseEnd: 20 },
  { tf: '240', label: '4h',  minutes: 240, postCloseWindow: 25, preCloseStart: 25, preCloseEnd: 20 },
  { tf: '360', label: '6h',  minutes: 360, postCloseWindow: 30, preCloseStart: 30, preCloseEnd: 25 },
  { tf: '480', label: '8h',  minutes: 480, postCloseWindow: 35, preCloseStart: 35, preCloseEnd: 30 },
  { tf: 'D',   label: '1D',  minutes: 1440, postCloseWindow: 60 },
];

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
    
    // Build prediction using learned patterns
    let prediction = this.buildPrediction(learning, {
      stack,
      isHotZone,
      clusters,
      nearestMid50Distance: mid50Levels[0]?.distance || 0,
      currentPrice,
      atr,
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
    }
  ): Prediction {
    const { stack, isHotZone, clusters, nearestMid50Distance, currentPrice, atr } = context;
    
    // Get stack-based bias
    const stackStats = learning.stackOutcomes.get(Math.min(stack, 9));
    let upBias = stackStats?.upPct || 50;
    let downBias = stackStats?.downPct || 50;
    let avgMag = stackStats?.avgMagnitude || 0.5;
    let avgDecompBars = stackStats?.avgBarsToMove || 4;
    
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
    
    // Determine direction
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let confidence = 50;
    
    if (upBias > downBias + 10) {
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
    context: { stack: number; isHotZone: boolean; clusters: number; nearestMid50Distance: number },
    direction: string,
    confidence: number
  ): string {
    const parts: string[] = [];
    
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
