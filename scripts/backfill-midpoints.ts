/**
 * Backfill Historical Midpoints
 * 
 * Fetches historical OHLCV data from CoinGecko and Alpha Vantage,
 * converts to midpoints, and stores in the database.
 * 
 * Usage:
 *   npm run backfill:midpoints
 *   npm run backfill:midpoints -- --symbol BTCUSD --timeframe 1H --days 7
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { CandleProcessor, parseCoinGeckoOHLC } from '../lib/candleProcessor';
import { getOHLC } from '../lib/coingecko';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const processor = new CandleProcessor();

// Tier 1 crypto symbols to backfill (top 20 by market cap)
const CRYPTO_SYMBOLS = [
  'bitcoin',              // BTCUSD
  'ethereum',             // ETHUSD
  'solana',               // SOLUSD
  'binancecoin',          // BNBUSD
  'ripple',               // XRPUSD
  'cardano',              // ADAUSD
  'dogecoin',             // DOGEUSD
  'avalanche-2',          // AVAXUSD
  'chainlink',            // LINKUSD
  'polkadot',             // DOTUSD
  'tron',                 // TRXUSD
  'the-open-network',     // TONUSD
  'shiba-inu',            // SHIBUSD
  'litecoin',             // LTCUSD
  'bitcoin-cash',         // BCHUSD
  'stellar',              // XLMUSD
  'hedera-hashgraph',     // HBARUSD
  'sui',                  // SUIUSD
  'aptos',                // APTUSD
  'near',                 // NEARUSD
];

// Mapping of CoinGecko IDs to trading symbols
const SYMBOL_MAP: Record<string, string> = {
  'bitcoin': 'BTCUSD',
  'ethereum': 'ETHUSD',
  'solana': 'SOLUSD',
  'binancecoin': 'BNBUSD',
  'ripple': 'XRPUSD',
  'cardano': 'ADAUSD',
  'dogecoin': 'DOGEUSD',
  'avalanche-2': 'AVAXUSD',
  'chainlink': 'LINKUSD',
  'polkadot': 'DOTUSD',
  'tron': 'TRXUSD',
  'the-open-network': 'TONUSD',
  'shiba-inu': 'SHIBUSD',
  'litecoin': 'LTCUSD',
  'bitcoin-cash': 'BCHUSD',
  'stellar': 'XLMUSD',
  'hedera-hashgraph': 'HBARUSD',
  'sui': 'SUIUSD',
  'aptos': 'APTUSD',
  'near': 'NEARUSD',
};

// Timeframe configurations
// CoinGecko OHLC endpoint accepts: 1, 7, 14, 30, 90, 180, 365 (not 730)
// For 1W we use 365 days max — enough for ~52 weekly candles
const TIMEFRAME_CONFIG = [
  { timeframe: '1H', days: 7, name: '1 Hour' },
  { timeframe: '4H', days: 30, name: '4 Hours' },
  { timeframe: '1D', days: 365, name: '1 Day' },
  { timeframe: '1W', days: 365, name: '1 Week' },
];

interface BackfillStats {
  symbol: string;
  timeframe: string;
  candlesProcessed: number;
  midpointsStored: number;
  errors: number;
  duration: number;
}

async function backfillSymbol(
  coingeckoId: string, 
  symbol: string, 
  timeframe: string, 
  days: number
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
    
    // Fetch OHLC data from CoinGecko
    const ohlcData = await getOHLC(coingeckoId, days as any);
    
    if (!ohlcData || ohlcData.length === 0) {
      console.log(`    ⚠️  No data returned from CoinGecko`);
      return stats;
    }
    
    console.log(`    ✓ Fetched ${ohlcData.length} candles`);
    
    // Convert CoinGecko format to our candle format using the processor's parser
    const candles = parseCoinGeckoOHLC(ohlcData as [number, number, number, number, number][]);
    
    if (candles.length === 0) {
      console.log(`    ⚠️  No candles after parsing`);
      return stats;
    }
    
    console.log(`    ✓ Parsed ${candles.length} candles`);
    stats.candlesProcessed = candles.length;
    
    // Store midpoints using batch processor
    try {
      const stored = await processor.processCandleBatch(symbol, timeframe, candles, 'crypto');
      stats.midpointsStored = stored;
      
      if (stored < candles.length) {
        stats.errors = candles.length - stored;
        console.log(`    ⚠️  ${stats.errors} candles failed to store`);
      }
    } catch (error: any) {
      console.error(`    ❌ Batch processing failed:`, error.message);
      stats.errors = candles.length;
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
  console.log('🚀 Starting Historical Midpoint Backfill\n');
  console.log(`Symbols: ${CRYPTO_SYMBOLS.length}`);
  console.log(`Timeframes: ${TIMEFRAME_CONFIG.length}`);
  console.log(`Total operations: ${CRYPTO_SYMBOLS.length * TIMEFRAME_CONFIG.length}\n`);
  
  const allStats: BackfillStats[] = [];
  const startTime = Date.now();
  
  // Parse command line args
  const args = process.argv.slice(2);
  let targetSymbol: string | null = null;
  let targetTimeframe: string | null = null;
  let targetDays: number | null = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) {
      targetSymbol = args[i + 1];
    } else if (args[i] === '--timeframe' && args[i + 1]) {
      targetTimeframe = args[i + 1];
    } else if (args[i] === '--days' && args[i + 1]) {
      targetDays = parseInt(args[i + 1]);
    }
  }
  
  // Filter based on command line args
  const symbolsToProcess = targetSymbol 
    ? CRYPTO_SYMBOLS.filter(id => SYMBOL_MAP[id] === targetSymbol)
    : CRYPTO_SYMBOLS;
    
  const timeframesToProcess = targetTimeframe
    ? TIMEFRAME_CONFIG.filter(tf => tf.timeframe === targetTimeframe)
    : TIMEFRAME_CONFIG;
  
  if (symbolsToProcess.length === 0) {
    console.error(`❌ Symbol ${targetSymbol} not found in SYMBOL_MAP`);
    process.exit(1);
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
  
  for (const coingeckoId of symbolsToProcess) {
    const symbol = SYMBOL_MAP[coingeckoId];
    console.log(`\n📈 Backfilling ${symbol} (${coingeckoId})`);
    
    for (const config of timeframesToProcess) {
      const days = targetDays || config.days;
      const stats = await backfillSymbol(coingeckoId, symbol, config.timeframe, days);
      allStats.push(stats);
      completedOps++;
      
      console.log(`  Progress: ${completedOps}/${totalOps} operations complete`);
      
      // Rate limiting: CoinGecko 500 RPM (500K/month cap) → 120ms between requests
      if (completedOps < totalOps) {
        await new Promise(resolve => setTimeout(resolve, 120));
      }
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
  console.log(`Average Speed:           ${(totalCandles / (totalDuration / 1000)).toFixed(0)} candles/sec`);
  
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
      console.log(`  ${status} ${symbol.padEnd(10)} - ${stats.midpoints.toLocaleString().padStart(6)} midpoints${stats.errors > 0 ? ` (${stats.errors} errors)` : ''}`);
    });
  
  // Next steps
  console.log('\n✅ Backfill Complete!\n');
  console.log('Next steps:');
  console.log('  1. Verify data:  npm run db:query -- "SELECT COUNT(*) FROM timeframe_midpoints"');
  console.log('  2. Check stats:  npm run db:query -- "SELECT * FROM midpoint_stats"');
  console.log('  3. Test API:     curl http://localhost:3000/api/midpoints?symbol=BTCUSD&currentPrice=68000');
  console.log('  4. Test TGM:     curl http://localhost:3000/api/time-gravity-map?symbol=BTCUSD&currentPrice=68000');
  console.log('');
}

// Run backfill
backfillAll().catch((error) => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
