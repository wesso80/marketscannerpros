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
import { getQuote, getIndicators, getFullSymbolData, getBulkFullSymbolDataFromDB } from '@/lib/onDemandFetch';

export interface CachedScanData {
  price: number;
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  ema9?: number;
  ema20?: number;
  ema50?: number;
  ema200: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  atr: number;
  adx: number;
  plusDI?: number;
  minusDI?: number;
  stochK: number;
  stochD: number;
  cci: number;
  aroonUp: number;
  aroonDown: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  bbWidthPercent?: number;
  inSqueeze?: boolean;
  squeezeStrength?: number;
  volume?: number;
  obv?: number;
  vwap?: number;
  mfi?: number;
  atrPercent?: number;
  willr?: number;
  natr?: number;
  ad?: number;
  roc?: number;
  bop?: number;
  changePct?: number;
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
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

    const result = buildCachedScanData(
      q as any,
      ind as unknown as Record<string, number | boolean | null | undefined> | null,
    );
    if (result) {
      console.log(`[scannerCache] ${symbol} served from ${result.source} (${getCacheMode()} mode)`);
    } else {
      console.log(`[scannerCache] Insufficient indicator data for ${symbol}`);
    }
    return result;

  } catch (err) {
    console.warn(`[scannerCache] Error fetching cached data for ${symbol}:`, err);
    return null;
  }
}

/**
 * Assemble a CachedScanData from a raw quote + indicators pair. Pure — no I/O.
 * Shared by the single-symbol and bulk cache readers so the mapping never drifts.
 * Returns null when the quote price or minimum indicators are missing.
 */
export function buildCachedScanData(
  q: { price?: number; volume?: number; changePct?: number; open?: number; high?: number; low?: number; prevClose?: number; source?: string } | null,
  ind: Record<string, number | boolean | null | undefined> | null,
): CachedScanData | null {
  if (!q?.price) return null;
  // Check we have minimum required indicators
  if (!ind?.rsi14 && !ind?.ema200) return null;

  // B10 FIX: Use 0 instead of NaN for missing indicators.
  // NaN propagates through all arithmetic (NaN + 5 = NaN), corrupting composite scores.
  const safeNum = (v: number | boolean | null | undefined): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const optNum = (v: number | boolean | null | undefined): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

  const result: CachedScanData = {
    price: q.price,
    rsi: safeNum(ind?.rsi14),
    macdLine: safeNum(ind?.macdLine),
    macdSignal: safeNum(ind?.macdSignal),
    macdHist: safeNum(ind?.macdHist),
    ema9: optNum(ind?.ema9),
    ema20: optNum(ind?.ema20),
    ema50: optNum(ind?.ema50),
    ema200: safeNum(ind?.ema200),
    sma20: optNum(ind?.sma20),
    sma50: optNum(ind?.sma50),
    sma200: optNum(ind?.sma200),
    atr: safeNum(ind?.atr14),
    adx: safeNum(ind?.adx14),
    plusDI: optNum(ind?.plusDI),
    minusDI: optNum(ind?.minusDI),
    stochK: safeNum(ind?.stochK),
    stochD: safeNum(ind?.stochD),
    cci: safeNum(ind?.cci20),
    aroonUp: safeNum(ind?.aroonUp),
    aroonDown: safeNum(ind?.aroonDown),
    bbUpper: optNum(ind?.bbUpper),
    bbMiddle: optNum(ind?.bbMiddle),
    bbLower: optNum(ind?.bbLower),
    bbWidthPercent: optNum(ind?.bbWidthPercent20),
    inSqueeze: typeof ind?.inSqueeze === 'boolean' ? ind.inSqueeze : undefined,
    squeezeStrength: optNum(ind?.squeezeStrength),
    volume: typeof q.volume === 'number' && Number.isFinite(q.volume) && q.volume > 0 ? q.volume : undefined,
    obv: optNum(ind?.obv),
    vwap: optNum(ind?.vwap),
    mfi: optNum(ind?.mfi14),
    atrPercent: optNum(ind?.atrPercent14),
    willr: optNum(ind?.willr14),
    natr: optNum(ind?.natr14),
    ad: optNum(ind?.ad),
    roc: optNum(ind?.roc12),
    bop: optNum(ind?.bop),
    changePct: q.changePct != null ? q.changePct : undefined,
    open: q.open != null && q.open > 0 ? q.open : undefined,
    high: q.high != null && q.high > 0 ? q.high : undefined,
    low: q.low != null && q.low > 0 ? q.low : undefined,
    prevClose: q.prevClose != null && q.prevClose > 0 ? q.prevClose : undefined,
    source: q.source === 'live' ? 'database' : ((q.source as CachedScanData['source']) ?? 'database'),
  };
  return result;
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

/**
 * FAST bulk read: assemble CachedScanData for many symbols using exactly TWO
 * database queries (via getBulkFullSymbolDataFromDB) — no per-symbol Redis/DB
 * round-trips and no live Alpha Vantage fallback. This is the scanner hot-path
 * reader: a whole universe reads from the worker-populated cache in one shot.
 * Symbols without cached data are simply absent from the returned map.
 */
export async function getBulkCachedScanDataFast(
  symbols: string[],
  timeframe: string = 'daily',
): Promise<Map<string, CachedScanData>> {
  const results = new Map<string, CachedScanData>();
  if (!shouldUseCache() || symbols.length === 0) return results;

  const raw = await getBulkFullSymbolDataFromDB(symbols, timeframe);
  for (const [symbol, data] of raw) {
    const built = buildCachedScanData(
      data.quote as any,
      data.indicators as unknown as Record<string, number | boolean | null | undefined> | null,
    );
    if (built) results.set(symbol.toUpperCase(), built);
  }
  console.log(`[scannerCache] FAST bulk read: ${results.size}/${symbols.length} symbols from DB in 2 queries`);
  return results;
}
