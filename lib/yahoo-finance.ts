/**
 * Yahoo Finance API Client
 * 
 * Free, no API key required
 * Data provided by Yahoo Finance - used under fair use with attribution
 */

import { validateYahooBars } from './dataQuality';

export interface YahooQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  averageVolume?: number;
}

export interface YahooHistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose: number;
}

export interface YahooCompanyInfo {
  symbol: string;
  shortName: string;
  longName: string;
  sector: string;
  industry: string;
  website: string;
  description: string;
  country: string;
  employees: number;
  marketCap: number;
  trailingPE: number;
  forwardPE: number;
  dividendYield: number;
  beta: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  fiftyDayAverage: number;
  twoHundredDayAverage: number;
}

/**
 * Fetch real-time quote from Yahoo Finance
 */
export async function getQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    
    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    
    return {
      symbol: meta.symbol,
      price: meta.regularMarketPrice,
      change: meta.regularMarketPrice - meta.previousClose,
      changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
      open: quote?.open?.[quote.open.length - 1] || meta.regularMarketPrice,
      high: quote?.high?.[quote.high.length - 1] || meta.regularMarketPrice,
      low: quote?.low?.[quote.low.length - 1] || meta.regularMarketPrice,
      previousClose: meta.previousClose,
      volume: quote?.volume?.[quote.volume.length - 1] || 0,
      marketCap: meta.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    };
  } catch (err) {
    console.error('Yahoo Finance quote error:', err);
    return null;
  }
}

/**
 * Fetch multiple quotes at once
 */
export async function getQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const results = new Map<string, YahooQuote>();
  
  // Yahoo allows bulk quotes
  try {
    const symbolList = symbols.join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return results;
    
    const data = await response.json();
    const quotes = data.quoteResponse?.result || [];
    
    for (const q of quotes) {
      results.set(q.symbol, {
        symbol: q.symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
        open: q.regularMarketOpen,
        high: q.regularMarketDayHigh,
        low: q.regularMarketDayLow,
        previousClose: q.regularMarketPreviousClose,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
        averageVolume: q.averageDailyVolume3Month,
      });
    }
  } catch (err) {
    console.error('Yahoo Finance bulk quote error:', err);
  }
  
  return results;
}

/**
 * Fetch historical OHLCV data
 */
export async function getHistoricalData(
  symbol: string, 
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1wk' | '1mo' = '1d',
  range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '3mo'
): Promise<YahooHistoricalBar[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return [];
    
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const adjClose = result.indicators?.adjclose?.[0]?.adjclose || [];
    
    const bars: YahooHistoricalBar[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.open?.[i] == null) continue;
      
      bars.push({
        date: new Date(timestamps[i] * 1000).toISOString(),
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i] || 0,
        adjClose: adjClose[i] || quote.close[i],
      });
    }
    
    return bars;
  } catch (err) {
    console.error('Yahoo Finance historical error:', err);
    return [];
  }
}

/**
 * Fetch company profile/info
 */
export async function getCompanyInfo(symbol: string): Promise<YahooCompanyInfo | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryProfile,summaryDetail,price`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const result = data.quoteSummary?.result?.[0];
    if (!result) return null;
    
    const profile = result.summaryProfile || {};
    const detail = result.summaryDetail || {};
    const price = result.price || {};
    
    return {
      symbol: price.symbol,
      shortName: price.shortName,
      longName: price.longName,
      sector: profile.sector,
      industry: profile.industry,
      website: profile.website,
      description: profile.longBusinessSummary,
      country: profile.country,
      employees: profile.fullTimeEmployees,
      marketCap: price.marketCap?.raw,
      trailingPE: detail.trailingPE?.raw,
      forwardPE: detail.forwardPE?.raw,
      dividendYield: detail.dividendYield?.raw,
      beta: detail.beta?.raw,
      fiftyTwoWeekHigh: detail.fiftyTwoWeekHigh?.raw,
      fiftyTwoWeekLow: detail.fiftyTwoWeekLow?.raw,
      fiftyDayAverage: detail.fiftyDayAverage?.raw,
      twoHundredDayAverage: detail.twoHundredDayAverage?.raw,
    };
  } catch (err) {
    console.error('Yahoo Finance company info error:', err);
    return null;
  }
}

/**
 * Get top gainers/losers (from Yahoo screener)
 */
export async function getMarketMovers(): Promise<{
  gainers: YahooQuote[];
  losers: YahooQuote[];
  mostActive: YahooQuote[];
}> {
  const result = { gainers: [] as YahooQuote[], losers: [] as YahooQuote[], mostActive: [] as YahooQuote[] };
  
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const mapQuotes = (quotes: any[]): YahooQuote[] =>
    quotes.map((q: any) => ({
      symbol: q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      open: q.regularMarketOpen,
      high: q.regularMarketDayHigh,
      low: q.regularMarketDayLow,
      previousClose: q.regularMarketPreviousClose,
      volume: q.regularMarketVolume,
    }));

  const fetchScreener = async (scrId: string): Promise<YahooQuote[]> => {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=20`,
        { headers: { 'User-Agent': UA } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return mapQuotes(data.finance?.result?.[0]?.quotes || []);
    } catch { return []; }
  };

  try {
    // Fetch all 3 screeners in parallel (was sequential — ~3s → ~1s)
    const [gainers, losers, mostActive] = await Promise.all([
      fetchScreener('day_gainers'),
      fetchScreener('day_losers'),
      fetchScreener('most_actives'),
    ]);
    result.gainers = gainers;
    result.losers = losers;
    result.mostActive = mostActive;
  } catch (err) {
    console.error('Yahoo Finance market movers error:', err);
  }
  
  return result;
}

/**
 * Calculate technical indicators from historical data
 */
export function calculateIndicators(bars: YahooHistoricalBar[]) {
  if (bars.length < 20) return null;

  // Data quality gate — filter out NaN / Infinity / negative prices
  const validated = validateYahooBars(bars);
  if (validated.warnings.length > 0) {
    console.warn('[DQ][yahoo]', validated.warnings);
  }
  const cleanBars = validated.data;
  if (cleanBars.length < 20) return null;
  
  const closes = cleanBars.map(b => b.close);
  const highs = cleanBars.map(b => b.high);
  const lows = cleanBars.map(b => b.low);
  const volumes = cleanBars.map(b => b.volume);
  
  // RSI (14-period)
  const rsi = calculateRSI(closes, 14);
  
  // EMA 12, 26, 200
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const ema200 = calculateEMA(closes, 200);
  
  // MACD — build full series so signal line is a proper 9-period EMA
  const ema12Series = calculateEMASeries(closes, 12);
  const ema26Series = calculateEMASeries(closes, 26);
  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 25 || isNaN(ema12Series[i]) || isNaN(ema26Series[i])) continue;
    macdSeries.push(ema12Series[i] - ema26Series[i]);
  }
  const macdLine = macdSeries.length > 0 ? macdSeries[macdSeries.length - 1] : 0;
  let macdSignal = macdLine;
  let macdHist = 0;
  if (macdSeries.length >= 9) {
    const signalSeries = calculateEMASeries(macdSeries, 9);
    macdSignal = signalSeries[signalSeries.length - 1];
    macdHist = macdLine - macdSignal;
  }
  
  // SMA 20, 50
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  
  // ATR (14-period)
  const atr = calculateATR(highs, lows, closes, 14);
  
  // Stochastic
  const stoch = calculateStochastic(highs, lows, closes, 14, 3);
  
  // ADX (simplified)
  const adx = calculateADX(highs, lows, closes, 14);
  
  return {
    price: closes[closes.length - 1],
    rsi,
    ema12,
    ema26,
    ema200,
    macd: macdLine,
    macdSignal,
    macdHist,
    sma20,
    sma50,
    atr,
    stochK: stoch.k,
    stochD: stoch.d,
    adx,
    volume: volumes[volumes.length - 1],
    avgVolume: volumes.slice(-20).reduce((a, b) => a + b, 0) / 20,
  };
}

// Helper functions

/** Returns full EMA series (same length as input). First `period-1` values are NaN. */
export function calculateEMASeries(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); }
    else if (i === period - 1) { result.push(ema); }
    else { ema = data[i] * k + ema * (1 - k); result.push(ema); }
  }
  return result;
}

export function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1];
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateRSI(data: number[], period: number): number {
  if (data.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
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
  
  return calculateSMA(trueRanges, period);
}

export function calculateStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number, dPeriod: number) {
  if (closes.length < kPeriod + dPeriod - 1) return { k: 50, d: 50 };
  
  // Build %K series over the full window needed for %D smoothing
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const sliceHighs = highs.slice(i - kPeriod + 1, i + 1);
    const sliceLows = lows.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...sliceHighs);
    const lowestLow = Math.min(...sliceLows);
    const range = highestHigh - lowestLow;
    kValues.push(range > 0 ? ((closes[i] - lowestLow) / range) * 100 : 50);
  }
  
  const k = kValues[kValues.length - 1];
  
  // %D = dPeriod-SMA of %K values
  const dSlice = kValues.slice(-dPeriod);
  const d = dSlice.reduce((a, b) => a + b, 0) / dSlice.length;
  
  return { k, d };
}

function calculateADX(highs: number[], lows: number[], closes: number[], period: number): number {
  // Simplified ADX calculation
  if (highs.length < period * 2) return 25;
  
  let sumDX = 0;
  let validCount = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    if (tr > 0) {
      const dmSum = plusDM + minusDM;
      // Only calculate DX when there's directional movement
      if (dmSum > 0) {
        const dx = Math.abs(plusDM - minusDM) / dmSum * 100;
        sumDX += dx;
        validCount++;
      }
    }
  }
  
  const result = validCount > 0 ? sumDX / validCount : 25;
  // Clamp to 0-100 range as ADX should never exceed 100
  return Math.min(100, Math.max(0, result));
}
