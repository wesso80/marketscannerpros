/**
 * Finnhub Data Service
 * Free tier: 60 calls/minute, commercial use allowed
 * Attribution required: "Data provided by Finnhub"
 */

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const BASE_URL = 'https://finnhub.io/api/v1';

// Rate limiting: 60 calls per minute
let callCount = 0;
let windowStart = Date.now();

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  if (now - windowStart > 60000) {
    // Reset window
    callCount = 0;
    windowStart = now;
  }
  
  if (callCount >= 55) { // Leave some buffer
    const waitTime = 60000 - (now - windowStart);
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      callCount = 0;
      windowStart = Date.now();
    }
  }
  
  callCount++;
  return fetch(url);
}

export interface FinnhubQuote {
  c: number;  // Current price
  h: number;  // High
  l: number;  // Low
  o: number;  // Open
  pc: number; // Previous close
  t: number;  // Timestamp
  d: number;  // Change
  dp: number; // Percent change
}

export interface FinnhubCompanyProfile {
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
  logo: string;
  finnhubIndustry: string;
}

export interface FinnhubCandle {
  c: number[];  // Close prices
  h: number[];  // High prices
  l: number[];  // Low prices
  o: number[];  // Open prices
  t: number[];  // Timestamps
  v: number[];  // Volumes
  s: string;    // Status
}

export interface FinnhubTechnicalIndicator {
  technicalAnalysis: {
    count: {
      buy: number;
      neutral: number;
      sell: number;
    };
    signal: 'buy' | 'neutral' | 'sell';
  };
  trend: {
    adx: number;
    trending: boolean;
  };
}

/**
 * Get real-time quote for a symbol
 */
export async function getQuote(symbol: string): Promise<FinnhubQuote | null> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`Finnhub quote error for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Check if we got valid data (c = 0 usually means no data)
    if (!data || data.c === 0) {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`Finnhub quote error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get company profile
 */
export async function getCompanyProfile(symbol: string): Promise<FinnhubCompanyProfile | null> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`Finnhub profile error for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || !data.name) {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`Finnhub profile error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get stock candles (OHLCV data)
 * Resolution: 1, 5, 15, 30, 60, D, W, M
 */
export async function getCandles(
  symbol: string,
  resolution: string = 'D',
  from: number,
  to: number
): Promise<FinnhubCandle | null> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`Finnhub candles error for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.s === 'no_data') {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`Finnhub candles error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get aggregate technical indicators (buy/sell signals)
 */
export async function getTechnicalIndicators(
  symbol: string,
  resolution: string = 'D'
): Promise<FinnhubTechnicalIndicator | null> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/scan/technical-indicator?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`Finnhub technical error for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Finnhub technical error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get market news
 */
export async function getMarketNews(category: string = 'general'): Promise<any[]> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/news?category=${category}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error('Finnhub news error:', error);
    return [];
  }
}

/**
 * Get company news
 */
export async function getCompanyNews(
  symbol: string,
  from: string,
  to: string
): Promise<any[]> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Finnhub company news error for ${symbol}:`, error);
    return [];
  }
}

/**
 * Get basic financials (metrics like P/E, Market Cap, etc.)
 */
export async function getBasicFinancials(symbol: string): Promise<any | null> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Finnhub financials error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Search for symbols
 */
export async function symbolSearch(query: string): Promise<any[]> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error('Finnhub search error:', error);
    return [];
  }
}

/**
 * Get earnings calendar
 */
export async function getEarningsCalendar(
  from: string,
  to: string,
  symbol?: string
): Promise<any[]> {
  try {
    let url = `${BASE_URL}/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    if (symbol) {
      url += `&symbol=${encodeURIComponent(symbol)}`;
    }
    
    const response = await rateLimitedFetch(url);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.earningsCalendar || [];
  } catch (error) {
    console.error('Finnhub earnings error:', error);
    return [];
  }
}

/**
 * Get market status (is market open/closed)
 */
export async function getMarketStatus(exchange: string = 'US'): Promise<any | null> {
  try {
    const response = await rateLimitedFetch(
      `${BASE_URL}/stock/market-status?exchange=${exchange}&token=${FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Finnhub market status error:', error);
    return null;
  }
}

/**
 * Calculate technical indicators from candle data
 * Since Finnhub free tier doesn't have all indicators, we calculate some ourselves
 */
export function calculateIndicators(candles: FinnhubCandle) {
  if (!candles || !candles.c || candles.c.length < 20) {
    return null;
  }
  
  const closes = candles.c;
  const highs = candles.h;
  const lows = candles.l;
  const volumes = candles.v;
  
  // Simple Moving Averages
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.length >= 50 
    ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 
    : null;
  const sma200 = closes.length >= 200 
    ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 
    : null;
  
  // RSI (14-period)
  const rsi = calculateRSI(closes, 14);
  
  // MACD
  const macd = calculateMACD(closes);
  
  // Volume average
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  
  // ATR (14-period)
  const atr = calculateATR(highs, lows, closes, 14);
  
  return {
    price: closes[closes.length - 1],
    sma20,
    sma50,
    sma200,
    rsi,
    macd,
    volume: currentVolume,
    avgVolume,
    volumeRatio,
    atr,
  };
}

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 26) return null;
  
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12 - ema26;
  
  // For signal line, we'd need historical MACD values
  // Simplified: use current MACD as approximation
  const signal = macdLine * 0.9; // Rough approximation
  const histogram = macdLine - signal;
  
  return { macd: macdLine, signal, histogram };
}

function calculateEMA(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  
  return ema;
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Batch fetch quotes for multiple symbols (respects rate limits)
 */
export async function getBatchQuotes(symbols: string[]): Promise<Map<string, FinnhubQuote>> {
  const results = new Map<string, FinnhubQuote>();
  
  // Process in smaller batches to respect rate limits
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    const promises = batch.map(async (symbol) => {
      const quote = await getQuote(symbol);
      if (quote) {
        results.set(symbol, quote);
      }
    });
    
    await Promise.all(promises);
    
    // Small delay between batches
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}
