/**
 * Backfill Historical Midpoints for Equities
 * 
 * Fetches historical OHLCV data from Alpha Vantage for stocks,
 * converts to midpoints, and stores in the database.
 * 
 * Usage:
 *   npm run backfill:equities
 *   npm run backfill:equities -- --symbol AAPL --timeframe 1D --days 365
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { CandleProcessor, parseAlphaVantageTimeSeries, OHLCVBar } from '../lib/candleProcessor';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const processor = new CandleProcessor();

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// Priority equity symbols to backfill
const EQUITY_SYMBOLS = [
  'AAPL',   // Apple
  'MSFT',   // Microsoft
  'GOOGL',  // Google
  'AMZN',   // Amazon
  'NVDA',   // NVIDIA
  'TSLA',   // Tesla
  'META',   // Meta
  'SPY',    // S&P 500 ETF
  'QQQ',    // Nasdaq ETF
  'IWM'     // Russell 2000 ETF
];

// Timeframe configurations for equities
const TIMEFRAME_CONFIG = [
  { timeframe: '1H', interval: '60min', days: 7, name: '1 Hour', outputsize: 'compact' },
  { timeframe: '4H', interval: '60min', days: 30, name: '4 Hours', outputsize: 'full' }, // Will aggregate 1H data
  { timeframe: '1D', interval: 'daily', days: 365, name: '1 Day', outputsize: 'full' },
  { timeframe: '1W', interval: 'daily', days: 730, name: '1 Week', outputsize: 'full' }, // Will aggregate daily data
];

interface BackfillStats {
  symbol: string;
  timeframe: string;
  candlesProcessed: number;
  midpointsStored: number;
  errors: number;
  duration: number;
}

/**
 * Rate limiter for Alpha Vantage API
 * Free tier: 25 requests/day, 5 requests/minute
 * Premium: 75 requests/minute, 600 requests/minute (commercial)
 */
class RateLimiter {
  private queue: (() => void)[] = [];
  private requestsPerMinute: number;
  private requestsThisMinute: number = 0;
  private minuteStartTime: number = Date.now();

  constructor(rpm: number = 5) {
    this.requestsPerMinute = rpm;
  }

  async take(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.minuteStartTime;

    // Reset counter every minute
    if (elapsed >= 60000) {
      this.requestsThisMinute = 0;
      this.minuteStartTime = now;
    }

    // If we've hit the limit, wait
    if (this.requestsThisMinute >= this.requestsPerMinute) {
      const waitTime = 60000 - elapsed + 1000; // Wait until next minute + 1s buffer
      console.log(`    ⏳ Rate limit reached, waiting ${(waitTime / 1000).toFixed(0)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestsThisMinute = 0;
      this.minuteStartTime = Date.now();
    }

    this.requestsThisMinute++;
  }
}

const rateLimiter = new RateLimiter(
  parseInt(process.env.ALPHA_VANTAGE_RPM || '5', 10)
);

/**
 * Fetch time series data from Alpha Vantage
 */
async function fetchAVTimeSeries(
  symbol: string,
  interval: string = 'daily',
  outputsize: string = 'compact'
): Promise<OHLCVBar[]> {
  await rateLimiter.take();

  if (!ALPHA_VANTAGE_API_KEY) {
    throw new Error('ALPHA_VANTAGE_API_KEY not set in environment');
  }

  const functionName = interval === 'daily' 
    ? 'TIME_SERIES_DAILY_ADJUSTED' 
    : 'TIME_SERIES_INTRADAY';
  
  let url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${encodeURIComponent(symbol)}&outputsize=${outputsize}&entitlement=realtime&apikey=${ALPHA_VANTAGE_API_KEY}`;
  
  if (interval !== 'daily') {
    url += `&interval=${interval}`;
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`Alpha Vantage HTTP ${res.status} for ${symbol}`);
  }

  const json = await res.json();

  // Check for rate limit or error messages
  if (json['Note'] || json['Information']) {
    throw new Error(`Alpha Vantage limit: ${json['Note'] || json['Information']}`);
  }
  if (json['Error Message']) {
    throw new Error(`Alpha Vantage error: ${json['Error Message']}`);
  }

  // Parse time series data
  const timeSeriesKey = Object.keys(json).find(k => k.startsWith('Time Series'));
  if (!timeSeriesKey || !json[timeSeriesKey]) {
    console.warn(`No time series data for ${symbol}`);
    return [];
  }

  const timeSeries = json[timeSeriesKey];
  const bars = parseAlphaVantageTimeSeries(timeSeries);
  
  return bars;
}

/**
 * Aggregate 1H bars into 4H bars
 */
function aggregate1HTo4H(bars: OHLCVBar[]): OHLCVBar[] {
  const fourHourBars: OHLCVBar[] = [];
  
  for (let i = 0; i < bars.length; i += 4) {
    const chunk = bars.slice(i, i + 4);
    if (chunk.length === 0) continue;
    
    const firstBar = chunk[0];
    const lastBar = chunk[chunk.length - 1];
    
    fourHourBars.push({
      time: lastBar.time, // Use close time of last bar
      open: firstBar.open,
      high: Math.max(...chunk.map(b => b.high)),
      low: Math.min(...chunk.map(b => b.low)),
      close: lastBar.close,
      volume: chunk.reduce((sum, b) => sum + (b.volume || 0), 0)
    });
  }
  
  return fourHourBars;
}

/**
 * Aggregate daily bars into weekly bars
 */
function aggregateDailyToWeekly(bars: OHLCVBar[]): OHLCVBar[] {
  const weeklyBars: OHLCVBar[] = [];
  
  for (let i = 0; i < bars.length; i += 5) { // 5 trading days per week
    const chunk = bars.slice(i, i + 5);
    if (chunk.length === 0) continue;
    
    const firstBar = chunk[0];
    const lastBar = chunk[chunk.length - 1];
    
    weeklyBars.push({
      time: lastBar.time,
      open: firstBar.open,
      high: Math.max(...chunk.map(b => b.high)),
      low: Math.min(...chunk.map(b => b.low)),
      close: lastBar.close,
      volume: chunk.reduce((sum, b) => sum + (b.volume || 0), 0)
    });
  }
  
  return weeklyBars;
}

async function backfillSymbol(
  symbol: string,
  timeframe: string,
  interval: string,
  days: number,
  outputsize: string
): Promise<BackfillStats> {
  const startTime = Date.now();
  const stats: BackfillStats = {
    symbol,
    timeframe,
    candlesProcessed: 0,
    midpointsStored: 0,
    errors: 0,
    duration: 0
  };
  
  try {
    console.log(`  📊 Fetching ${timeframe} data for ${symbol} (${days} days)...`);
    
    // Fetch data from Alpha Vantage
    let bars = await fetchAVTimeSeries(symbol, interval, outputsize);
    
    if (!bars || bars.length === 0) {
      console.log(`    ⚠️  No data returned from Alpha Vantage`);
      return stats;
    }
    
    console.log(`    ✓ Fetched ${bars.length} raw bars`);
    
    // Aggregate if needed
    if (timeframe === '4H' && interval === '60min') {
      bars = aggregate1HTo4H(bars);
      console.log(`    ✓ Aggregated to ${bars.length} 4H bars`);
    } else if (timeframe === '1W' && interval === 'daily') {
      bars = aggregateDailyToWeekly(bars);
      console.log(`    ✓ Aggregated to ${bars.length} weekly bars`);
    }
    
    // Filter to requested time range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    bars = bars.filter(b => b.time >= cutoffDate);
    
    console.log(`    ✓ Filtered to ${bars.length} bars within ${days} days`);
    stats.candlesProcessed = bars.length;
    
    // Store midpoints using batch processor
    try {
      const stored = await processor.processCandleBatch(symbol, timeframe, bars, 'stock');
      stats.midpointsStored = stored;
      
      if (stored < bars.length) {
        stats.errors = bars.length - stored;
        console.log(`    ⚠️  ${stats.errors} candles failed to store`);
      }
    } catch (error: any) {
      console.error(`    ❌ Batch processing failed:`, error.message);
      stats.errors = bars.length;
    }
    
    stats.duration = Date.now() - startTime;
    console.log(`    ✓ Stored ${stats.midpointsStored} midpoints in ${(stats.duration / 1000).toFixed(1)}s`);
    
  } catch (error: any) {
    console.error(`    ❌ Failed to backfill ${symbol} ${timeframe}:`, error.message);
    stats.errors++;
  }
  
  stats.duration = Date.now() - startTime;
  return stats;
}

async function backfillAll() {
  console.log('🚀 Starting Historical Equity Midpoint Backfill\n');
  
  if (!ALPHA_VANTAGE_API_KEY) {
    console.error('❌ ALPHA_VANTAGE_API_KEY not set in environment');
    console.error('   Set it in .env.local or .env file');
    process.exit(1);
  }
  
  const rpm = parseInt(process.env.ALPHA_VANTAGE_RPM || '5', 10);
  console.log(`API Rate Limit: ${rpm} requests/minute`);
  console.log(`Symbols: ${EQUITY_SYMBOLS.length}`);
  console.log(`Timeframes: ${TIMEFRAME_CONFIG.length}`);
  console.log(`Total operations: ${EQUITY_SYMBOLS.length * TIMEFRAME_CONFIG.length}\n`);
  
  if (rpm <= 5) {
    console.log('⚠️  WARNING: Using free tier rate limit (5 req/min)');
    console.log('   This will take ~' + Math.ceil(EQUITY_SYMBOLS.length * TIMEFRAME_CONFIG.length / 5) + ' minutes');
    console.log('   Consider upgrading to premium or using --symbol flag for selective backfill\n');
  }
  
  const allStats: BackfillStats[] = [];
  const startTime = Date.now();
  
  // Parse command line args
  const args = process.argv.slice(2);
  let targetSymbol: string | null = null;
  let targetTimeframe: string | null = null;
  let targetDays: number | null = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) {
      targetSymbol = args[i + 1].toUpperCase();
    } else if (args[i] === '--timeframe' && args[i + 1]) {
      targetTimeframe = args[i + 1];
    } else if (args[i] === '--days' && args[i + 1]) {
      targetDays = parseInt(args[i + 1]);
    }
  }
  
  // Filter based on command line args
  const symbolsToProcess = targetSymbol 
    ? [targetSymbol]
    : EQUITY_SYMBOLS;
    
  const timeframesToProcess = targetTimeframe
    ? TIMEFRAME_CONFIG.filter(tf => tf.timeframe === targetTimeframe)
    : TIMEFRAME_CONFIG;
  
  if (targetSymbol && !EQUITY_SYMBOLS.includes(targetSymbol)) {
    console.log(`ℹ️  Symbol ${targetSymbol} not in default list, but proceeding anyway...\n`);
  }
  
  if (targetSymbol || targetTimeframe) {
    console.log('🔍 Filtering:');
    if (targetSymbol) console.log(`  Symbol: ${targetSymbol}`);
    if (targetTimeframe) console.log(`  Timeframe: ${targetTimeframe}`);
    if (targetDays) console.log(`  Days: ${targetDays}`);
    console.log('');
  }
  
  let completedOps = 0;
  const totalOps = symbolsToProcess.length * timeframesToProcess.length;
  
  for (const symbol of symbolsToProcess) {
    console.log(`\n📈 Backfilling ${symbol}`);
    
    for (const config of timeframesToProcess) {
      const days = targetDays || config.days;
      const stats = await backfillSymbol(
        symbol,
        config.timeframe,
        config.interval,
        days,
        config.outputsize
      );
      allStats.push(stats);
      completedOps++;
      
      console.log(`  Progress: ${completedOps}/${totalOps} operations complete`);
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('📊 BACKFILL SUMMARY');
  console.log('='.repeat(60));
  
  const totalCandles = allStats.reduce((sum, s) => sum + s.candlesProcessed, 0);
  const totalMidpoints = allStats.reduce((sum, s) => sum + s.midpointsStored, 0);
  const totalErrors = allStats.reduce((sum, s) => sum + s.errors, 0);
  
  console.log(`\nTotal Candles Processed: ${totalCandles.toLocaleString()}`);
  console.log(`Total Midpoints Stored:  ${totalMidpoints.toLocaleString()}`);
  console.log(`Total Errors:            ${totalErrors}`);
  console.log(`Total Duration:          ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);
  
  if (totalCandles > 0) {
    console.log(`Average Speed:           ${(totalCandles / (totalDuration / 1000)).toFixed(2)} candles/sec`);
  }
  
  // Per-symbol breakdown
  console.log('\n📋 Per-Symbol Breakdown:');
  const symbolStats = new Map<string, { midpoints: number; errors: number }>();
  
  for (const stat of allStats) {
    if (!symbolStats.has(stat.symbol)) {
      symbolStats.set(stat.symbol, { midpoints: 0, errors: 0 });
    }
    const s = symbolStats.get(stat.symbol)!;
    s.midpoints += stat.midpointsStored;
    s.errors += stat.errors;
  }
  
  Array.from(symbolStats.entries())
    .sort((a, b) => b[1].midpoints - a[1].midpoints)
    .forEach(([symbol, stats]) => {
      const status = stats.errors > 0 ? '⚠️' : '✓';
      console.log(`  ${status} ${symbol.padEnd(6)} - ${stats.midpoints.toLocaleString().padStart(5)} midpoints${stats.errors > 0 ? ` (${stats.errors} errors)` : ''}`);
    });
  
  // Next steps
  console.log('\n✅ Backfill Complete!\n');
  console.log('Next steps:');
  console.log('  1. Verify data:  SELECT COUNT(*) FROM timeframe_midpoints WHERE asset_type = \'stock\'');
  console.log('  2. Check stats:  SELECT * FROM midpoint_stats WHERE symbol IN (\'AAPL\', \'SPY\')');
  console.log('  3. Test API:     curl http://localhost:3000/api/midpoints?symbol=AAPL&currentPrice=180');
  console.log('  4. Test TGM:     curl http://localhost:3000/api/time-gravity-map?symbol=AAPL&currentPrice=180');
  console.log('');
}

// Run backfill
backfillAll().catch((error) => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
