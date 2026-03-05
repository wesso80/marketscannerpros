/**
 * Scanner Cache Helper
 * 
 * Provides cached indicators for the scanner to use instead of
 * making 7+ separate Alpha Vantage API calls per symbol.
 * 
 * When cache mode is enabled:
 * - Try DB/cache first
 * - Fall back to AV only if missing and allowed
 */

import { q } from '@/lib/db';
import { getCached, CACHE_KEYS } from '@/lib/redis';
import { shouldUseCache, canFallbackToAV, getCacheMode } from '@/lib/cacheMode';
import { getQuote, getIndicators, getFullSymbolData } from '@/lib/onDemandFetch';

export interface CachedScanData {
  price: number;
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  ema200: number;
  atr: number;
  adx: number;
  stochK: number;
  stochD: number;
  cci: number;
  aroonUp: number;
  aroonDown: number;
  volume?: number;
  obv?: number;
  vwap?: number;
  mfi?: number;
  atrPercent?: number;
  source: 'cache' | 'database' | 'unavailable';
}

/**
 * Get all scan data for a symbol from cache/DB
 * Returns null if data not available
 */
export async function getCachedScanData(symbol: string): Promise<CachedScanData | null> {
  const useCache = shouldUseCache();
  
  if (!useCache) {
    return null; // Legacy mode - don't use cache
  }

  try {
    // Try to get full data (quote + indicators)
    const data = await getFullSymbolData(symbol);
    
    if (!data?.quote?.price) {
      console.log(`[scannerCache] No quote data for ${symbol}`);
      return null;
    }

    const q = data.quote;
    const ind = data.indicators;

    // Check we have minimum required indicators
    if (!ind?.rsi14 && !ind?.ema200) {
      console.log(`[scannerCache] Insufficient indicator data for ${symbol}`);
      return null;
    }

    // B10 FIX: Use 0 instead of NaN for missing indicators.
    // NaN propagates through all arithmetic (NaN + 5 = NaN), corrupting composite scores.
    const safeNum = (v: number | null | undefined): number =>
      v != null && Number.isFinite(v) ? v : 0;

    const result: CachedScanData = {
      price: q.price,
      rsi: safeNum(ind?.rsi14),
      macdLine: safeNum(ind?.macdLine),
      macdSignal: safeNum(ind?.macdSignal),
      macdHist: safeNum(ind?.macdHist),
      ema200: safeNum(ind?.ema200),
      atr: safeNum(ind?.atr14),
      adx: safeNum(ind?.adx14),
      stochK: safeNum(ind?.stochK),
      stochD: safeNum(ind?.stochD),
      cci: safeNum(ind?.cci20),
      aroonUp: safeNum((ind as unknown as Record<string, number | undefined>)?.aroonUp),
      aroonDown: safeNum((ind as unknown as Record<string, number | undefined>)?.aroonDown),
      volume: Number.isFinite(q.volume) && q.volume > 0 ? q.volume : undefined,
      obv: ind?.obv != null ? ind.obv : undefined,
      vwap: ind?.vwap != null ? ind.vwap : undefined,
      mfi: ind?.mfi14 != null ? ind.mfi14 : undefined,
      atrPercent: ind?.atrPercent14 != null ? ind.atrPercent14 : undefined,
      source: q.source === 'live' ? 'database' : q.source,
    };

    console.log(`[scannerCache] ${symbol} served from ${result.source} (${getCacheMode()} mode)`);
    return result;

  } catch (err) {
    console.warn(`[scannerCache] Error fetching cached data for ${symbol}:`, err);
    return null;
  }
}

/**
 * Batch fetch scan data for multiple symbols
 * Returns a Map of symbol -> CachedScanData
 */
export async function getBulkCachedScanData(symbols: string[]): Promise<Map<string, CachedScanData>> {
  const results = new Map<string, CachedScanData>();
  
  if (!shouldUseCache()) {
    return results; // Empty map in legacy mode
  }

  // Fetch in parallel (but with some batching to avoid overwhelming)
  const BATCH_SIZE = 10;
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (symbol) => {
      const data = await getCachedScanData(symbol);
      if (data) {
        results.set(symbol.toUpperCase(), data);
      }
    });
    await Promise.all(promises);
  }

  console.log(`[scannerCache] Got cached data for ${results.size}/${symbols.length} symbols`);
  return results;
}
