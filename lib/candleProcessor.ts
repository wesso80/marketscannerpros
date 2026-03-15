/**
 * Candle-to-Midpoint Processor
 * 
 * Integrates with existing data ingestion worker to automatically:
 * 1. Process closed candles from Alpha Vantage / CoinGecko
 * 2. Calculate and store midpoints
 * 3. Check for tagged midpoints on each price update
 * 
 * This ensures precise midpoint data for the Time Gravity Map.
 */

import { getMidpointService, type CandleData } from './midpointService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard OHLCV bar from data providers
 */
export interface OHLCVBar {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closeTime?: Date;
}

/**
 * Timeframe mapping for common formats
 */
export const TIMEFRAME_MAP: Record<string, string> = {
  // Intraday
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '60min': '1H',
  '1hour': '1H',
  '4hour': '4H',
  
  // Daily+
  '1d': '1D',
  'daily': '1D',
  '1day': '1D',
  '1w': '1W',
  'weekly': '1W',
  '1week': '1W',
  'monthly': '1M',
  '1month': '1M',
};

/**
 * Normalize timeframe to standard format
 */
export function normalizeTimeframe(tf: string): string {
  const normalized = tf.toLowerCase().replace(/\s/g, '');
  return TIMEFRAME_MAP[normalized] || tf;
}

/**
 * Calculate candle duration in milliseconds
 */
export function getTimeframeDuration(timeframe: string): number {
  const tf = normalizeTimeframe(timeframe);
  
  const durations: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1H': 60 * 60 * 1000,
    '2H': 2 * 60 * 60 * 1000,
    '4H': 4 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
    '1W': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000, // Approximate
  };
  
  return durations[tf] || 60 * 60 * 1000; // Default to 1H
}

/**
 * Infer a candle's close time when the data source doesn't provide one.
 * - Daily equity bars: same day at 20:00 UTC (16:00 ET, market close)
 * - Daily crypto bars: same day at 23:59:59 UTC
 * - Weekly: Friday 20:00 UTC (equities) or Sunday 23:59:59 UTC (crypto)
 * - Intraday: open + duration (safe for sub-day intervals)
 */
function inferCloseTime(openTime: Date, timeframe: string, assetType: string): Date {
  const tf = normalizeTimeframe(timeframe);

  if (tf === '1D') {
    const d = new Date(openTime);
    if (assetType === 'crypto') {
      d.setUTCHours(23, 59, 59, 999);
    } else {
      d.setUTCHours(20, 0, 0, 0); // 16:00 ET = 20:00 UTC (standard time)
    }
    return d;
  }

  if (tf === '1W') {
    const d = new Date(openTime);
    // Advance to Friday (day 5) for equities, Sunday (day 0) for crypto
    const targetDay = assetType === 'crypto' ? 0 : 5;
    const diff = (targetDay - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + (diff === 0 ? 0 : diff));
    if (assetType === 'crypto') {
      d.setUTCHours(23, 59, 59, 999);
    } else {
      d.setUTCHours(20, 0, 0, 0);
    }
    return d;
  }

  // Intraday: duration-based offset is fine
  return new Date(openTime.getTime() + getTimeframeDuration(tf));
}

// ═══════════════════════════════════════════════════════════════════════════
// CANDLE PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════

export class CandleProcessor {
  private midpointService = getMidpointService();
  
  /**
   * Process a single closed candle and store its midpoint
   */
  async processCandle(
    symbol: string,
    timeframe: string,
    bar: OHLCVBar,
    assetType: string = 'crypto'
  ): Promise<boolean> {
    const normalizedTF = normalizeTimeframe(timeframe);
    
    const candle: CandleData = {
      symbol,
      timeframe: normalizedTF,
      openTime: new Date(bar.time.getTime()),
      closeTime: bar.closeTime
        ? new Date(bar.closeTime.getTime())
        : inferCloseTime(bar.time, normalizedTF, assetType),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    };
    
    try {
      const stored = await this.midpointService.storeMidpoint(candle, assetType);
      return stored !== null;
    } catch (error) {
      console.error(`Failed to process candle for ${symbol} ${timeframe}:`, error);
      return false;
    }
  }
  
  /**
   * Process multiple candles in batch (for historical data import)
   */
  async processCandleBatch(
    symbol: string,
    timeframe: string,
    bars: OHLCVBar[],
    assetType: string = 'crypto'
  ): Promise<number> {
    if (bars.length === 0) return 0;
    
    const normalizedTF = normalizeTimeframe(timeframe);
    const duration = getTimeframeDuration(normalizedTF);
    
    const candles: CandleData[] = bars.map(bar => ({
      symbol,
      timeframe: normalizedTF,
      openTime: new Date(bar.time.getTime()),
      closeTime: new Date(bar.time.getTime() + duration),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
    
    try {
      return await this.midpointService.storeMidpointBatch(candles, assetType);
    } catch (error) {
      console.error(`Failed to process candle batch for ${symbol} ${timeframe}:`, error);
      return 0;
    }
  }
  
  /**
   * Update tagging status based on current price
   * Call this whenever you get a new price tick
   */
  async updateTaggingStatus(
    symbol: string,
    currentHigh: number,
    currentLow: number
  ): Promise<number> {
    try {
      return await this.midpointService.checkAndTagMidpoints(symbol, currentHigh, currentLow);
    } catch (error) {
      console.error(`Failed to update tagging status for ${symbol}:`, error);
      return 0;
    }
  }
  
  /**
   * Get midpoints for Time Gravity Map
   */
  async getMidpointsForTGM(
    symbol: string,
    currentPrice: number,
    maxDistance: number = 10.0
  ) {
    return this.midpointService.getUntaggedMidpoints(symbol, currentPrice, {
      maxDistancePercent: maxDistance,
      limit: 100,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert Alpha Vantage time series data to OHLCV bars
 */
export function parseAlphaVantageTimeSeries(
  timeSeries: Record<string, any>
): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  
  for (const [timestamp, data] of Object.entries(timeSeries)) {
    bars.push({
      time: new Date(timestamp),
      open: parseFloat(data['1. open'] || data.open || 0),
      high: parseFloat(data['2. high'] || data.high || 0),
      low: parseFloat(data['3. low'] || data.low || 0),
      close: parseFloat(data['4. close'] || data.close || 0),
      volume: parseFloat(data['5. volume'] || data.volume || 0),
    });
  }
  
  // Sort by time ascending
  return bars.sort((a, b) => a.time.getTime() - b.time.getTime());
}

/**
 * Convert CoinGecko OHLC data to OHLCV bars
 */
export function parseCoinGeckoOHLC(
  ohlcData: [number, number, number, number, number][]
): OHLCVBar[] {
  return ohlcData.map(([timestamp, open, high, low, close]) => ({
    time: new Date(timestamp),
    open,
    high,
    low,
    close,
    volume: 0, // CoinGecko OHLC doesn't include volume
  }));
}

/**
 * Example Integration with existing worker
 */
export async function integrateWithWorker(
  symbol: string,
  assetType: 'crypto' | 'stock' | 'forex'
) {
  const processor = new CandleProcessor();
  
  // Example: Process historical data on first run
  if (assetType === 'crypto') {
    // Assuming you have a function to fetch CoinGecko data
    // const ohlcData = await getCoinGeckoOHLC(symbol, 'daily');
    // const bars = parseCoinGeckoOHLC(ohlcData);
    // await processor.processCandleBatch(symbol, '1D', bars, 'crypto');
    
    console.log(`Would fetch and process historical candles for ${symbol}`);
  } else {
    // For stocks/forex using Alpha Vantage
    // const timeSeries = await fetchAlphaVantageDaily(symbol);
    // const bars = parseAlphaVantageTimeSeries(timeSeries);
    // await processor.processCandleBatch(symbol, '1D', bars, assetType);
    
    console.log(`Would fetch and process historical candles for ${symbol}`);
  }
  
  // Example: Update on new price tick
  // const currentPrice = await getCurrentPrice(symbol);
  // const tagged = await processor.updateTaggingStatus(
  //   symbol,
  //   currentPrice * 1.001, // High (allow small tolerance)
  //   currentPrice * 0.999  // Low
  // );
  // console.log(`Tagged ${tagged} midpoints for ${symbol}`);
}

/**
 * Singleton instance
 */
let candleProcessorInstance: CandleProcessor | null = null;

export function getCandleProcessor(): CandleProcessor {
  if (!candleProcessorInstance) {
    candleProcessorInstance = new CandleProcessor();
  }
  return candleProcessorInstance;
}

/**
 * Usage Example:
 * 
 * import { getCandleProcessor, parseAlphaVantageTimeSeries } from './candleProcessor';
 * 
 * // In your data ingestion worker, after fetching candles:
 * const processor = getCandleProcessor();
 * 
 * // Store new candle on close
 * await processor.processCandle('BTCUSD', '1H', {
 *   time: new Date(),
 *   open: 67900,
 *   high: 68100,
 *   low: 67850,
 *   close: 68000,
 *   volume: 1234.56
 * }, 'crypto');
 * 
 * // Update tagging status on price updates
 * await processor.updateTaggingStatus('BTCUSD', 68050, 67950);
 * 
 * // Get midpoints for Time Gravity Map
 * const midpoints = await processor.getMidpointsForTGM('BTCUSD', 68000);
 */
