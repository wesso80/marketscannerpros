/**
 * On-Demand Data Fetcher
 * 
 * When a user requests a symbol not in our cache:
 * 1. Fetch it live from Alpha Vantage (rate limited)
 * 2. Compute indicators locally
 * 3. Store in DB/cache for future requests
 * 4. Add to symbol_universe so worker maintains it
 * 
 * This allows unlimited tickers while the worker pre-caches popular ones.
 */

import { q } from '@/lib/db';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';
import { calculateAllIndicators, detectSqueeze, getIndicatorWarmupStatus, IndicatorWarmupStatus, OHLCVBar } from '@/lib/indicators';

// Simple in-memory rate limiter for on-demand requests
// Allows 10 on-demand fetches per minute (worker uses the rest of the 70 RPM)
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL_MS = 6000; // 6 seconds between on-demand calls

async function canFetchNow(): Promise<boolean> {
  const now = Date.now();
  if (now - lastFetchTime >= MIN_FETCH_INTERVAL_MS) {
    lastFetchTime = now;
    return true;
  }
  return false;
}

export interface QuoteData {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  changeAmt: number;
  changePct: number;
  latestDay: string;
  fetchedAt: string;
  source: 'cache' | 'database' | 'live';
}

export interface IndicatorData {
  symbol: string;
  timeframe: string;
  rsi14?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHist?: number;
  ema9?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  atr14?: number;
  adx14?: number;
  plusDI?: number;
  minusDI?: number;
  stochK?: number;
  stochD?: number;
  cci20?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  obv?: number;
  vwap?: number;
  vwapIntraday?: number;
  atrPercent14?: number;
  bbWidthPercent20?: number;
  inSqueeze?: boolean;
  squeezeStrength?: number;
  warmup?: IndicatorWarmupStatus;
  computedAt: string;
  source: 'cache' | 'database' | 'live';
}

/**
 * Fetch quote from Alpha Vantage
 */
async function fetchQuoteFromAV(symbol: string): Promise<QuoteData | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
  
  if (!apiKey) {
    console.error('[onDemand] No ALPHA_VANTAGE_API_KEY set');
    return null;
  }

  console.log(`[onDemand] Fetching quote for ${symbol}...`);
  
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&entitlement=delayed&apikey=${apiKey}`;
  
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn(`[onDemand] AV HTTP error for ${symbol}: ${res.status}`);
      return null;
    }

    const json = await res.json();
    
    // Handle both live and delayed quote formats
    const quote = json['Global Quote'] || json['Global Quote - DATA DELAYED BY 15 MINUTES'];

    if (!quote || !quote['05. price']) {
      console.warn(`[onDemand] No quote data for ${symbol}`);
      return null;
    }
    
    return {
      symbol: symbol.toUpperCase(),
      price: parseFloat(quote['05. price']),
      open: parseFloat(quote['02. open'] || '0'),
      high: parseFloat(quote['03. high'] || '0'),
      low: parseFloat(quote['04. low'] || '0'),
      prevClose: parseFloat(quote['08. previous close'] || '0'),
      volume: Math.round(parseFloat(quote['06. volume'] || '0')),
      changeAmt: parseFloat(quote['09. change'] || '0'),
      changePct: parseFloat((quote['10. change percent'] || '0%').replace('%', '')),
      latestDay: quote['07. latest trading day'] || new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
      source: 'live',
    };
  } catch (err: any) {
    console.error(`[onDemand] Error fetching quote for ${symbol}:`, err?.message || err);
    return null;
  }
}

/**
 * Fetch daily bars and compute indicators
 */
async function fetchBarsAndIndicatorsFromAV(symbol: string): Promise<{
  bars: OHLCVBar[];
  indicators: IndicatorData;
} | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
  if (!apiKey) return null;

  console.log(`[onDemand] Fetching bars for ${symbol}...`);

  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=delayed&apikey=${apiKey}`;
  
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const json = await res.json();
    const timeSeries = json['Time Series (Daily)'] || json['Time Series (Daily) - DATA DELAYED BY 15 MINUTES'];

    if (!timeSeries) {
      console.warn(`[onDemand] No time series for ${symbol}`);
      return null;
    }

  const bars: OHLCVBar[] = [];
  for (const [timestamp, values] of Object.entries(timeSeries)) {
    const v = values as Record<string, string>;
    bars.push({
      timestamp,
      open: parseFloat(v['1. open'] || '0'),
      high: parseFloat(v['2. high'] || '0'),
      low: parseFloat(v['3. low'] || '0'),
      close: parseFloat(v['4. close'] || '0'),
      volume: Math.round(parseFloat(v['5. volume'] || '0')),
    });
  }

  // Sort oldest first for indicator calculation
  bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Compute indicators locally
  const computed = calculateAllIndicators(bars);
  const squeeze = detectSqueeze(bars);
  const warmup = getIndicatorWarmupStatus(bars.length, 'daily');

  const indicators: IndicatorData = {
    symbol: symbol.toUpperCase(),
    timeframe: 'daily',
    rsi14: computed.rsi14,
    macdLine: computed.macdLine,
    macdSignal: computed.macdSignal,
    macdHist: computed.macdHist,
    ema9: computed.ema9,
    ema20: computed.ema20,
    ema50: computed.ema50,
    ema200: computed.ema200,
    sma20: computed.sma20,
    sma50: computed.sma50,
    sma200: computed.sma200,
    atr14: computed.atr14,
    adx14: computed.adx14,
    plusDI: computed.plusDI,
    minusDI: computed.minusDI,
    stochK: computed.stochK,
    stochD: computed.stochD,
    cci20: computed.cci20,
    bbUpper: computed.bbUpper,
    bbMiddle: computed.bbMiddle,
    bbLower: computed.bbLower,
    obv: computed.obv,
    vwap: computed.vwap,
    vwapIntraday: computed.vwapIntraday,
    atrPercent14: computed.atrPercent14,
    bbWidthPercent20: computed.bbWidthPercent20,
    inSqueeze: squeeze?.inSqueeze ?? false,
    squeezeStrength: squeeze?.squeezeStrength ?? 0,
    warmup,
    computedAt: new Date().toISOString(),
    source: 'live',
  };

  return { bars, indicators };
  } catch (err: any) {
    console.error(`[onDemand] Error fetching bars for ${symbol}:`, err?.message || err);
    return null;
  }
}

/**
 * Add symbol to universe so worker will maintain it
 */
async function addToUniverse(symbol: string, assetType: string = 'equity'): Promise<void> {
  try {
    await q(`
      INSERT INTO symbol_universe (symbol, asset_type, tier, enabled)
      VALUES ($1, $2, 3, TRUE)
      ON CONFLICT (symbol) DO NOTHING
    `, [symbol.toUpperCase(), assetType]);
  } catch (err) {
    // Ignore errors - not critical
  }
}

/**
 * Store quote in database
 */
async function storeQuote(quote: QuoteData): Promise<void> {
  try {
    await q(`
      INSERT INTO quotes_latest (symbol, price, open, high, low, prev_close, volume, change_amount, change_percent, latest_trading_day, fetched_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (symbol) DO UPDATE SET
        price = EXCLUDED.price, open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
        prev_close = EXCLUDED.prev_close, volume = EXCLUDED.volume, change_amount = EXCLUDED.change_amount,
        change_percent = EXCLUDED.change_percent, latest_trading_day = EXCLUDED.latest_trading_day, fetched_at = NOW()
    `, [quote.symbol, quote.price, quote.open, quote.high, quote.low, quote.prevClose, quote.volume, quote.changeAmt, quote.changePct, quote.latestDay]);
  } catch (err) {
    console.error('[onDemand] Failed to store quote:', err);
  }
}

/**
 * Store indicators in database
 */
async function storeIndicators(ind: IndicatorData): Promise<void> {
  try {
    await q(`
      INSERT INTO indicators_latest (
        symbol, timeframe, rsi14, macd_line, macd_signal, macd_hist,
        ema9, ema20, ema50, ema200, sma20, sma50, sma200,
        atr14, adx14, plus_di, minus_di, stoch_k, stoch_d, cci20,
        bb_upper, bb_middle, bb_lower, obv, vwap, in_squeeze, squeeze_strength, warmup_json, computed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28::jsonb, NOW()
      )
      ON CONFLICT (symbol, timeframe) DO UPDATE SET
        rsi14 = EXCLUDED.rsi14, macd_line = EXCLUDED.macd_line, macd_signal = EXCLUDED.macd_signal,
        macd_hist = EXCLUDED.macd_hist, ema9 = EXCLUDED.ema9, ema20 = EXCLUDED.ema20,
        ema50 = EXCLUDED.ema50, ema200 = EXCLUDED.ema200, sma20 = EXCLUDED.sma20,
        sma50 = EXCLUDED.sma50, sma200 = EXCLUDED.sma200, atr14 = EXCLUDED.atr14,
        adx14 = EXCLUDED.adx14, plus_di = EXCLUDED.plus_di, minus_di = EXCLUDED.minus_di,
        stoch_k = EXCLUDED.stoch_k, stoch_d = EXCLUDED.stoch_d, cci20 = EXCLUDED.cci20,
        bb_upper = EXCLUDED.bb_upper, bb_middle = EXCLUDED.bb_middle, bb_lower = EXCLUDED.bb_lower,
        obv = EXCLUDED.obv, vwap = EXCLUDED.vwap, in_squeeze = EXCLUDED.in_squeeze,
        squeeze_strength = EXCLUDED.squeeze_strength, warmup_json = EXCLUDED.warmup_json, computed_at = NOW()
    `, [
      ind.symbol, ind.timeframe, ind.rsi14, ind.macdLine, ind.macdSignal, ind.macdHist,
      ind.ema9, ind.ema20, ind.ema50, ind.ema200, ind.sma20, ind.sma50, ind.sma200,
      ind.atr14, ind.adx14, ind.plusDI, ind.minusDI, ind.stochK, ind.stochD, ind.cci20,
      ind.bbUpper, ind.bbMiddle, ind.bbLower, 
      ind.obv != null ? Math.round(ind.obv) : null, 
      ind.vwap, ind.inSqueeze, ind.squeezeStrength, ind.warmup ? JSON.stringify(ind.warmup) : null
    ]);
  } catch (err) {
    console.error('[onDemand] Failed to store indicators:', err);
  }
}

/**
 * Get quote - from cache, DB, or live fetch
 */
export async function getQuote(symbol: string): Promise<QuoteData | null> {
  const sym = symbol.toUpperCase().trim();
  const cacheKey = CACHE_KEYS.quote(sym);

  // 1. Check Redis cache
  const cached = await getCached<QuoteData>(cacheKey);
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  // 2. Check database
  try {
    const rows = await q<any>(`
      SELECT * FROM quotes_latest WHERE symbol = $1
    `, [sym]);

    if (rows.length > 0) {
      const row = rows[0];
      const quote: QuoteData = {
        symbol: row.symbol,
        price: parseFloat(row.price),
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        prevClose: parseFloat(row.prev_close),
        volume: row.volume,
        changeAmt: parseFloat(row.change_amount),
        changePct: parseFloat(row.change_percent),
        latestDay: row.latest_trading_day,
        fetchedAt: row.fetched_at,
        source: 'database',
      };
      // Cache it
      await setCached(cacheKey, quote, CACHE_TTL.quote);
      return quote;
    }
  } catch (err) {
    // Continue to live fetch
  }

  // 3. Live fetch (rate limited)
  if (await canFetchNow()) {
    const quote = await fetchQuoteFromAV(sym);
    if (quote) {
      // Store and cache
      await storeQuote(quote);
      await setCached(cacheKey, quote, CACHE_TTL.quote);
      await addToUniverse(sym);
      return quote;
    }
  }

  return null;
}

/**
 * Get indicators - from cache, DB, or live fetch
 */
export async function getIndicators(symbol: string, timeframe: string = 'daily'): Promise<IndicatorData | null> {
  const sym = symbol.toUpperCase().trim();
  const cacheKey = CACHE_KEYS.indicators(sym, timeframe);

  // 1. Check Redis cache
  const cached = await getCached<IndicatorData>(cacheKey);
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  // 2. Check database
  try {
    const rows = await q<any>(`
      SELECT * FROM indicators_latest WHERE symbol = $1 AND timeframe = $2
    `, [sym, timeframe]);

    if (rows.length > 0) {
      const row = rows[0];
      const ind: IndicatorData = {
        symbol: row.symbol,
        timeframe: row.timeframe,
        rsi14: row.rsi14 ? parseFloat(row.rsi14) : undefined,
        macdLine: row.macd_line ? parseFloat(row.macd_line) : undefined,
        macdSignal: row.macd_signal ? parseFloat(row.macd_signal) : undefined,
        macdHist: row.macd_hist ? parseFloat(row.macd_hist) : undefined,
        ema9: row.ema9 ? parseFloat(row.ema9) : undefined,
        ema20: row.ema20 ? parseFloat(row.ema20) : undefined,
        ema50: row.ema50 ? parseFloat(row.ema50) : undefined,
        ema200: row.ema200 ? parseFloat(row.ema200) : undefined,
        sma20: row.sma20 ? parseFloat(row.sma20) : undefined,
        sma50: row.sma50 ? parseFloat(row.sma50) : undefined,
        sma200: row.sma200 ? parseFloat(row.sma200) : undefined,
        atr14: row.atr14 ? parseFloat(row.atr14) : undefined,
        adx14: row.adx14 ? parseFloat(row.adx14) : undefined,
        plusDI: row.plus_di ? parseFloat(row.plus_di) : undefined,
        minusDI: row.minus_di ? parseFloat(row.minus_di) : undefined,
        stochK: row.stoch_k ? parseFloat(row.stoch_k) : undefined,
        stochD: row.stoch_d ? parseFloat(row.stoch_d) : undefined,
        cci20: row.cci20 ? parseFloat(row.cci20) : undefined,
        bbUpper: row.bb_upper ? parseFloat(row.bb_upper) : undefined,
        bbMiddle: row.bb_middle ? parseFloat(row.bb_middle) : undefined,
        bbLower: row.bb_lower ? parseFloat(row.bb_lower) : undefined,
        obv: row.obv,
        vwap: row.vwap ? parseFloat(row.vwap) : undefined,
        vwapIntraday: row.vwap_intraday ? parseFloat(row.vwap_intraday) : undefined,
        atrPercent14: row.atr_percent14 ? parseFloat(row.atr_percent14) : undefined,
        bbWidthPercent20: row.bb_width_percent20 ? parseFloat(row.bb_width_percent20) : undefined,
        inSqueeze: row.in_squeeze,
        squeezeStrength: row.squeeze_strength,
        warmup: row.warmup_json && typeof row.warmup_json === 'string'
          ? JSON.parse(row.warmup_json)
          : row.warmup_json || undefined,
        computedAt: row.computed_at,
        source: 'database',
      };
      // Cache it
      await setCached(cacheKey, ind, CACHE_TTL.indicators);
      return ind;
    }
  } catch (err) {
    // Continue to live fetch
  }

  // 3. Live fetch (rate limited)
  if (await canFetchNow()) {
    const result = await fetchBarsAndIndicatorsFromAV(sym);
    if (result) {
      // Store and cache
      await storeIndicators(result.indicators);
      await setCached(cacheKey, result.indicators, CACHE_TTL.indicators);
      await addToUniverse(sym);
      return result.indicators;
    }
  }

  return null;
}

/**
 * Fetch both quote and indicators in one call (more efficient)
 */
export async function getFullSymbolData(symbol: string): Promise<{
  quote: QuoteData | null;
  indicators: IndicatorData | null;
}> {
  const sym = symbol.toUpperCase().trim();
  
  // Try cache/db first
  let quote = await getQuote(sym);
  let indicators = await getIndicators(sym);

  // If neither found, do a combined fetch
  if (!quote && !indicators) {
    if (await canFetchNow()) {
      // Fetch quote
      quote = await fetchQuoteFromAV(sym);
      if (quote) {
        await storeQuote(quote);
        await setCached(CACHE_KEYS.quote(sym), quote, CACHE_TTL.quote);
      }
    }
    
    if (await canFetchNow()) {
      // Fetch bars and compute indicators
      const result = await fetchBarsAndIndicatorsFromAV(sym);
      if (result) {
        indicators = result.indicators;
        await storeIndicators(indicators);
        await setCached(CACHE_KEYS.indicators(sym, 'daily'), indicators, CACHE_TTL.indicators);
      }
    }

    // Add to universe for worker
    if (quote || indicators) {
      await addToUniverse(sym);
    }
  }

  return { quote, indicators };
}
