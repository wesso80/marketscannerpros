/**
 * AI Confluence Forecasting Agent
 * Uses Time Confluence Windows logic + historical pattern analysis + GPT-4
 * to forecast market movements based on multi-timeframe confluence
 */

import OpenAI from 'openai';

// Types
interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TimeframeData {
  tf: string;
  minutes: number;
  bars: OHLCV[];
  mid50: number | null;        // Previous bar's HL2
  secsToClose: number | null;  // Seconds until next close
  nextClose: number | null;    // Timestamp of next close
}

interface ConfluenceState {
  timestamp: number;
  price: number;
  stack: number;              // Number of active windows (post + pre close)
  activeTFs: string[];        // Which TFs are in window
  mid50Levels: { tf: string; level: number; distance: number }[];
  clusters: { tf1: string; tf2: string; level: number }[];
  isHotZone: boolean;
  hotZoneTFs: string[];
}

interface HistoricalPattern {
  confluenceState: ConfluenceState;
  outcome: {
    direction: 'up' | 'down' | 'sideways';
    magnitude: number;        // % move in next N bars
    barsToMove: number;       // How many bars until move completed
  };
}

interface Forecast {
  symbol: string;
  timestamp: number;
  currentState: ConfluenceState;
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;       // 0-100
    targetPrice: number;
    stopLoss: number;
    timeHorizon: string;      // e.g., "4h", "1D"
    reasoning: string;
  };
  historicalSimilar: {
    count: number;
    winRate: number;
    avgMove: number;
  };
  aiAnalysis: string;
}

// Configuration
const TIMEFRAMES = [
  { tf: '30', minutes: 30, postCloseWindow: 10 },
  { tf: '60', minutes: 60, postCloseWindow: 15 },
  { tf: '120', minutes: 120, postCloseWindow: 20 },
  { tf: '180', minutes: 180, postCloseWindow: 25, preCloseStart: 25, preCloseEnd: 20 },
  { tf: '240', minutes: 240, postCloseWindow: 25, preCloseStart: 25, preCloseEnd: 20 },
  { tf: '360', minutes: 360, postCloseWindow: 30, preCloseStart: 30, preCloseEnd: 25 },
  { tf: '480', minutes: 480, postCloseWindow: 35, preCloseStart: 35, preCloseEnd: 30 },
  { tf: 'D', minutes: 1440, postCloseWindow: 60 },
];

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

export class AIConfluenceAgent {
  private openai: OpenAI;
  private historicalPatterns: Map<string, HistoricalPattern[]> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  async fetchHistoricalData(symbol: string, interval: string = '30min', outputSize: string = 'full'): Promise<OHLCV[]> {
    const isCrypto = symbol.includes('USD') || symbol.includes('BTC') || symbol.includes('ETH');
    
    let url: string;
    if (isCrypto) {
      // Use crypto endpoint
      const [from, to] = symbol.includes('/') ? symbol.split('/') : [symbol.replace('USD', ''), 'USD'];
      url = `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${from}&market=${to}&interval=${interval}&outputsize=${outputSize}&apikey=${ALPHA_VANTAGE_KEY}`;
    } else {
      // Stock endpoint
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&outputsize=${outputSize}&apikey=${ALPHA_VANTAGE_KEY}`;
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
      const v = values as any;
      bars.push({
        time: new Date(timestamp).getTime(),
        open: parseFloat(v['1. open']),
        high: parseFloat(v['2. high']),
        low: parseFloat(v['3. low']),
        close: parseFloat(v['4. close']),
        volume: parseFloat(v['5. volume'] || v['6. volume'] || '0'),
      });
    }

    // Sort oldest first
    return bars.sort((a, b) => a.time - b.time);
  }

  async fetchDailyData(symbol: string): Promise<OHLCV[]> {
    const isCrypto = symbol.includes('USD') || symbol.includes('BTC');
    
    let url: string;
    if (isCrypto) {
      const from = symbol.replace('USD', '').replace('USDT', '');
      url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${from}&market=USD&apikey=${ALPHA_VANTAGE_KEY}`;
    } else {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    const timeSeriesKey = Object.keys(data).find(k => k.includes('Time Series'));
    if (!timeSeriesKey) return [];

    const timeSeries = data[timeSeriesKey];
    const bars: OHLCV[] = [];

    for (const [timestamp, values] of Object.entries(timeSeries)) {
      const v = values as any;
      bars.push({
        time: new Date(timestamp).getTime(),
        open: parseFloat(v['1. open'] || v['1a. open (USD)']),
        high: parseFloat(v['2. high'] || v['2a. high (USD)']),
        low: parseFloat(v['3. low'] || v['3a. low (USD)']),
        close: parseFloat(v['4. close'] || v['4a. close (USD)']),
        volume: parseFloat(v['5. volume'] || v['5. volume'] || '0'),
      });
    }

    return bars.sort((a, b) => a.time - b.time);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFLUENCE CALCULATIONS (ported from Pine Script)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resample bars to a higher timeframe
   */
  resampleToTimeframe(bars: OHLCV[], tfMinutes: number): OHLCV[] {
    if (bars.length === 0) return [];
    
    const tfMs = tfMinutes * 60 * 1000;
    const resampled: OHLCV[] = [];
    let currentBar: OHLCV | null = null;

    for (const bar of bars) {
      const periodStart = Math.floor(bar.time / tfMs) * tfMs;
      
      if (!currentBar || currentBar.time !== periodStart) {
        if (currentBar) resampled.push(currentBar);
        currentBar = {
          time: periodStart,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        };
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

  /**
   * Calculate HL2 (midpoint) of a bar
   */
  hl2(bar: OHLCV): number {
    return (bar.high + bar.low) / 2;
  }

  /**
   * Get previous bar's 50% level for a timeframe
   */
  getPrior50(bars: OHLCV[], tfMinutes: number): number | null {
    const resampled = this.resampleToTimeframe(bars, tfMinutes);
    if (resampled.length < 2) return null;
    
    // Get the PREVIOUS completed bar's HL2
    const prevBar = resampled[resampled.length - 2];
    return this.hl2(prevBar);
  }

  /**
   * Calculate seconds until next timeframe close
   */
  getSecsToClose(currentTime: number, tfMinutes: number): number {
    const tfMs = tfMinutes * 60 * 1000;
    const periodStart = Math.floor(currentTime / tfMs) * tfMs;
    const periodEnd = periodStart + tfMs;
    return Math.max(0, Math.floor((periodEnd - currentTime) / 1000));
  }

  /**
   * Check if in post-close window
   */
  isInPostCloseWindow(currentTime: number, tfMinutes: number, windowMinutes: number): boolean {
    const tfMs = tfMinutes * 60 * 1000;
    const periodStart = Math.floor(currentTime / tfMs) * tfMs;
    const timeSincePeriodStart = currentTime - periodStart;
    return timeSincePeriodStart <= windowMinutes * 60 * 1000;
  }

  /**
   * Check if in pre-close anticipatory window
   */
  isInPreCloseWindow(secsToClose: number, startMin: number, endMin: number): boolean {
    const secsStart = startMin * 60;
    const secsEnd = endMin * 60;
    return secsToClose <= secsStart && secsToClose > secsEnd;
  }

  /**
   * Calculate ATR for cluster detection
   */
  calculateATR(bars: OHLCV[], period: number = 14): number {
    if (bars.length < period + 1) return 0;

    let atr = 0;
    for (let i = bars.length - period; i < bars.length; i++) {
      const high = bars[i].high;
      const low = bars[i].low;
      const prevClose = bars[i - 1]?.close || bars[i].open;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      atr += tr;
    }
    return atr / period;
  }

  /**
   * Build complete confluence state at a given time
   */
  buildConfluenceState(bars: OHLCV[], atTime?: number): ConfluenceState {
    const currentTime = atTime || bars[bars.length - 1]?.time || Date.now();
    const currentPrice = bars[bars.length - 1]?.close || 0;
    const atr = this.calculateATR(bars);

    const activeTFs: string[] = [];
    const mid50Levels: { tf: string; level: number; distance: number }[] = [];
    const hotZoneTFs: string[] = [];
    let stack = 0;

    for (const tfConfig of TIMEFRAMES) {
      const mid50 = this.getPrior50(bars, tfConfig.minutes);
      const secsToClose = this.getSecsToClose(currentTime, tfConfig.minutes);
      
      // Check post-close window
      if (this.isInPostCloseWindow(currentTime, tfConfig.minutes, tfConfig.postCloseWindow)) {
        activeTFs.push(tfConfig.tf);
        stack++;
      }

      // Check pre-close window (for 3h, 4h, 6h, 8h)
      if (tfConfig.preCloseStart && tfConfig.preCloseEnd) {
        if (this.isInPreCloseWindow(secsToClose, tfConfig.preCloseStart, tfConfig.preCloseEnd)) {
          if (!activeTFs.includes(tfConfig.tf)) {
            activeTFs.push(tfConfig.tf + '-pre');
            stack++;
          }
        }
      }

      // Track 50% levels
      if (mid50) {
        const distance = ((currentPrice - mid50) / mid50) * 100;
        mid50Levels.push({ tf: tfConfig.tf, level: mid50, distance });
      }

      // Hot zone detection (closing within 5 mins)
      if (secsToClose <= 5 * 60) {
        hotZoneTFs.push(tfConfig.tf);
      }
    }

    // Find clusters (50% levels within 1x ATR of each other)
    const clusters: { tf1: string; tf2: string; level: number }[] = [];
    for (let i = 0; i < mid50Levels.length; i++) {
      for (let j = i + 1; j < mid50Levels.length; j++) {
        if (Math.abs(mid50Levels[i].level - mid50Levels[j].level) <= atr) {
          clusters.push({
            tf1: mid50Levels[i].tf,
            tf2: mid50Levels[j].tf,
            level: (mid50Levels[i].level + mid50Levels[j].level) / 2,
          });
        }
      }
    }

    return {
      timestamp: currentTime,
      price: currentPrice,
      stack,
      activeTFs,
      mid50Levels: mid50Levels.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance)),
      clusters,
      isHotZone: hotZoneTFs.length >= 3,
      hotZoneTFs,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORICAL PATTERN ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze historical data to find patterns after confluence events
   */
  analyzeHistoricalPatterns(bars: OHLCV[], lookForwardBars: number = 8): HistoricalPattern[] {
    const patterns: HistoricalPattern[] = [];
    
    // Slide through history, checking confluence states
    for (let i = 100; i < bars.length - lookForwardBars; i++) {
      const historicalBars = bars.slice(0, i + 1);
      const state = this.buildConfluenceState(historicalBars, bars[i].time);
      
      // Only record significant confluence events (stack >= 5 or clusters)
      if (state.stack >= 5 || state.clusters.length > 0 || state.isHotZone) {
        // Calculate outcome
        const entryPrice = bars[i].close;
        let maxUp = 0, maxDown = 0, finalPrice = entryPrice;
        let barsToMove = lookForwardBars;

        for (let j = 1; j <= lookForwardBars; j++) {
          const futureBar = bars[i + j];
          const change = ((futureBar.close - entryPrice) / entryPrice) * 100;
          
          if (change > maxUp) maxUp = change;
          if (change < maxDown) maxDown = change;
          
          // Find first significant move (> 0.5%)
          if (Math.abs(change) > 0.5 && barsToMove === lookForwardBars) {
            barsToMove = j;
          }
          
          finalPrice = futureBar.close;
        }

        const magnitude = ((finalPrice - entryPrice) / entryPrice) * 100;
        const direction: 'up' | 'down' | 'sideways' = 
          magnitude > 0.3 ? 'up' : magnitude < -0.3 ? 'down' : 'sideways';

        patterns.push({
          confluenceState: state,
          outcome: { direction, magnitude, barsToMove },
        });
      }
    }

    return patterns;
  }

  /**
   * Find similar historical patterns to current state
   */
  findSimilarPatterns(
    currentState: ConfluenceState,
    historicalPatterns: HistoricalPattern[]
  ): HistoricalPattern[] {
    return historicalPatterns.filter(pattern => {
      const p = pattern.confluenceState;
      
      // Match criteria:
      // 1. Similar stack count (within 2)
      const stackMatch = Math.abs(p.stack - currentState.stack) <= 2;
      
      // 2. Similar cluster presence
      const clusterMatch = (p.clusters.length > 0) === (currentState.clusters.length > 0);
      
      // 3. Similar hot zone status
      const hotZoneMatch = p.isHotZone === currentState.isHotZone;
      
      // 4. Similar distance to nearest 50%
      const nearestCurrent = currentState.mid50Levels[0]?.distance || 0;
      const nearestHistorical = p.mid50Levels[0]?.distance || 0;
      const distanceMatch = Math.abs(nearestCurrent - nearestHistorical) < 0.5;

      return stackMatch && (clusterMatch || hotZoneMatch || distanceMatch);
    });
  }

  /**
   * Calculate win rate and average move from similar patterns
   */
  calculatePatternStats(patterns: HistoricalPattern[], direction: 'bullish' | 'bearish'): {
    winRate: number;
    avgMove: number;
    count: number;
  } {
    if (patterns.length === 0) return { winRate: 0, avgMove: 0, count: 0 };

    const targetDirection = direction === 'bullish' ? 'up' : 'down';
    const wins = patterns.filter(p => p.outcome.direction === targetDirection);
    const moves = patterns.map(p => p.outcome.magnitude);

    return {
      winRate: (wins.length / patterns.length) * 100,
      avgMove: moves.reduce((a, b) => a + b, 0) / moves.length,
      count: patterns.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI FORECASTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate AI forecast using GPT-4 + pattern analysis
   */
  async generateForecast(symbol: string): Promise<Forecast> {
    console.log(`🔮 Generating forecast for ${symbol}...`);

    // Fetch data
    const bars30m = await this.fetchHistoricalData(symbol, '30min', 'full');
    const dailyBars = await this.fetchDailyData(symbol);

    if (bars30m.length < 100) {
      throw new Error(`Insufficient data for ${symbol}`);
    }

    // Build current confluence state
    const currentState = this.buildConfluenceState(bars30m);
    console.log(`📊 Current state: Stack=${currentState.stack}, Clusters=${currentState.clusters.length}, HotZone=${currentState.isHotZone}`);

    // Analyze historical patterns
    const historicalPatterns = this.analyzeHistoricalPatterns(bars30m);
    console.log(`📈 Found ${historicalPatterns.length} historical confluence events`);

    // Find similar patterns
    const similarPatterns = this.findSimilarPatterns(currentState, historicalPatterns);
    console.log(`🔍 Found ${similarPatterns.length} similar historical patterns`);

    // Calculate stats for both directions
    const bullishStats = this.calculatePatternStats(similarPatterns, 'bullish');
    const bearishStats = this.calculatePatternStats(similarPatterns, 'bearish');

    // Determine bias from patterns
    const patternBias = bullishStats.winRate > bearishStats.winRate ? 'bullish' : 
                        bearishStats.winRate > bullishStats.winRate ? 'bearish' : 'neutral';

    // Build prompt for GPT-4
    const prompt = this.buildForecastPrompt(symbol, currentState, {
      bullishStats,
      bearishStats,
      patternBias,
      recentBars: bars30m.slice(-20),
      dailyBars: dailyBars.slice(-10),
    });

    // Get AI analysis
    const aiResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert quantitative analyst specializing in multi-timeframe confluence analysis. 
You analyze market data using the Time Confluence Windows methodology which identifies high-probability 
reversal/continuation zones when multiple timeframe closes align. You provide clear, actionable forecasts 
with specific price targets and stop losses. Always be direct and confident in your analysis.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const aiAnalysis = aiResponse.choices[0]?.message?.content || 'Analysis unavailable';

    // Parse AI response for structured prediction
    const prediction = this.parseAIPrediction(aiAnalysis, currentState, patternBias);

    return {
      symbol,
      timestamp: Date.now(),
      currentState,
      prediction,
      historicalSimilar: {
        count: similarPatterns.length,
        winRate: patternBias === 'bullish' ? bullishStats.winRate : bearishStats.winRate,
        avgMove: patternBias === 'bullish' ? bullishStats.avgMove : bearishStats.avgMove,
      },
      aiAnalysis,
    };
  }

  /**
   * Build detailed prompt for GPT-4
   */
  private buildForecastPrompt(
    symbol: string,
    state: ConfluenceState,
    context: {
      bullishStats: { winRate: number; avgMove: number; count: number };
      bearishStats: { winRate: number; avgMove: number; count: number };
      patternBias: string;
      recentBars: OHLCV[];
      dailyBars: OHLCV[];
    }
  ): string {
    const { bullishStats, bearishStats, patternBias, recentBars, dailyBars } = context;

    // Calculate some additional metrics
    const last20High = Math.max(...recentBars.map(b => b.high));
    const last20Low = Math.min(...recentBars.map(b => b.low));
    const dailyHigh = Math.max(...dailyBars.map(b => b.high));
    const dailyLow = Math.min(...dailyBars.map(b => b.low));
    const currentPrice = state.price;
    const priceVsRange = ((currentPrice - last20Low) / (last20High - last20Low)) * 100;

    return `
## CONFLUENCE FORECAST REQUEST: ${symbol}

### Current Market State
- **Price**: $${currentPrice.toFixed(4)}
- **Position in 20-bar range**: ${priceVsRange.toFixed(1)}% (0=low, 100=high)
- **20-bar High/Low**: $${last20High.toFixed(4)} / $${last20Low.toFixed(4)}
- **Daily High/Low (10d)**: $${dailyHigh.toFixed(4)} / $${dailyLow.toFixed(4)}

### Time Confluence State
- **Stack Count**: ${state.stack} (number of overlapping time windows)
- **Active Timeframes**: ${state.activeTFs.length > 0 ? state.activeTFs.join(', ') : 'None'}
- **Hot Zone Active**: ${state.isHotZone ? `YES - ${state.hotZoneTFs.join(', ')} closing within 5 mins` : 'No'}
- **Clustered 50% Levels**: ${state.clusters.length > 0 ? state.clusters.map(c => `${c.tf1}+${c.tf2} @ $${c.level.toFixed(4)}`).join(', ') : 'None'}

### Nearest 50% Levels (Distance from price)
${state.mid50Levels.slice(0, 5).map(l => `- ${l.tf}: $${l.level.toFixed(4)} (${l.distance >= 0 ? '+' : ''}${l.distance.toFixed(2)}%)`).join('\n')}

### Historical Pattern Analysis
When similar confluence states occurred in the past:
- **Bullish outcomes**: ${bullishStats.count} occurrences, ${bullishStats.winRate.toFixed(1)}% win rate, avg move +${bullishStats.avgMove.toFixed(2)}%
- **Bearish outcomes**: ${bearishStats.count} occurrences, ${bearishStats.winRate.toFixed(1)}% win rate, avg move ${bearishStats.avgMove.toFixed(2)}%
- **Historical bias**: ${patternBias.toUpperCase()}

### Request
Based on this confluence analysis:
1. Provide your **DIRECTION** forecast (BULLISH, BEARISH, or NEUTRAL)
2. Assign a **CONFIDENCE** score (0-100%)
3. Give a specific **TARGET PRICE** 
4. Give a specific **STOP LOSS**
5. Specify the **TIME HORIZON** (e.g., "4h", "8h", "1D")
6. Explain your **REASONING** in 2-3 sentences

Format your response clearly with these labeled sections.
`;
  }

  /**
   * Parse AI response into structured prediction
   */
  private parseAIPrediction(
    aiResponse: string,
    state: ConfluenceState,
    patternBias: string
  ): Forecast['prediction'] {
    const price = state.price;
    
    // Extract direction
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (/bullish/i.test(aiResponse)) direction = 'bullish';
    else if (/bearish/i.test(aiResponse)) direction = 'bearish';

    // Extract confidence (look for percentage)
    const confidenceMatch = aiResponse.match(/(\d{1,3})%?\s*confidence/i) || 
                           aiResponse.match(/confidence[:\s]+(\d{1,3})/i);
    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 
                       state.stack >= 7 ? 75 : state.stack >= 5 ? 60 : 50;

    // Extract target price
    const targetMatch = aiResponse.match(/target[:\s]+\$?([\d,.]+)/i) ||
                       aiResponse.match(/\$?([\d,.]+)\s*target/i);
    let targetPrice = targetMatch ? parseFloat(targetMatch[1].replace(',', '')) : 
                      direction === 'bullish' ? price * 1.01 : price * 0.99;

    // Extract stop loss
    const stopMatch = aiResponse.match(/stop[- ]?loss[:\s]+\$?([\d,.]+)/i) ||
                     aiResponse.match(/stop[:\s]+\$?([\d,.]+)/i);
    let stopLoss = stopMatch ? parseFloat(stopMatch[1].replace(',', '')) :
                   direction === 'bullish' ? price * 0.995 : price * 1.005;

    // Extract time horizon
    const timeMatch = aiResponse.match(/(\d+[hd]|hours?|days?)/i);
    const timeHorizon = timeMatch ? timeMatch[1] : '4h';

    // Extract reasoning (last paragraph or after "reasoning")
    const reasoningMatch = aiResponse.match(/reasoning[:\s]+(.+?)(?:\n\n|$)/is) ||
                          aiResponse.match(/because[:\s]+(.+?)(?:\n|$)/is);
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 
                      `Based on ${state.stack} overlapping time windows with ${patternBias} historical bias.`;

    return {
      direction,
      confidence: Math.min(100, Math.max(0, confidence)),
      targetPrice,
      stopLoss,
      timeHorizon,
      reasoning,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Scan a symbol and return full forecast
   */
  async scan(symbol: string): Promise<Forecast> {
    return this.generateForecast(symbol);
  }

  /**
   * Scan multiple symbols
   */
  async scanMultiple(symbols: string[]): Promise<Forecast[]> {
    const forecasts: Forecast[] = [];
    
    for (const symbol of symbols) {
      try {
        const forecast = await this.scan(symbol);
        forecasts.push(forecast);
        // Rate limit: wait 1 second between symbols
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error scanning ${symbol}:`, error);
      }
    }

    return forecasts;
  }

  /**
   * Get current confluence state only (no AI, faster)
   */
  async getConfluenceState(symbol: string): Promise<ConfluenceState> {
    const bars = await this.fetchHistoricalData(symbol, '30min', 'compact');
    return this.buildConfluenceState(bars);
  }

  /**
   * Quick check: is symbol in a high-confluence zone?
   */
  async isHighConfluence(symbol: string): Promise<{
    isHigh: boolean;
    stack: number;
    hasCluster: boolean;
    isHotZone: boolean;
  }> {
    const state = await this.getConfluenceState(symbol);
    return {
      isHigh: state.stack >= 5 || state.clusters.length > 0 || state.isHotZone,
      stack: state.stack,
      hasCluster: state.clusters.length > 0,
      isHotZone: state.isHotZone,
    };
  }
}

// Export singleton instance
export const confluenceAgent = new AIConfluenceAgent();

// Export types
export type { Forecast, ConfluenceState, HistoricalPattern };
