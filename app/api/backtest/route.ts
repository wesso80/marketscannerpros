/**
 * Backtest API
 * 
 * @route POST /api/backtest
 * @description Run historical backtests on trading strategies with real market data
 * @authentication Optional (enhanced features for authenticated users)
 * 
 * @body {object} request
 * @body {string} request.symbol - Stock symbol (e.g., "AAPL", "TSLA")
 * @body {string} request.strategy - Strategy name ("ema_crossover", "rsi_mean_reversion", "macd_momentum", "bollinger_bands")
 * @body {string} request.startDate - Backtest start date (YYYY-MM-DD)
 * @body {string} request.endDate - Backtest end date (YYYY-MM-DD)
 * @body {number} request.initialCapital - Starting capital amount
 * 
 * @returns {object} Backtest results
 * @returns {number} totalTrades - Number of trades executed
 * @returns {number} winRate - Percentage of winning trades
 * @returns {number} totalReturn - Total profit/loss
 * @returns {number} maxDrawdown - Maximum drawdown percentage
 * @returns {number} sharpeRatio - Risk-adjusted returns metric
 * @returns {Array} trades - Individual trade details
 * 
 * @example
 * POST /api/backtest
 * Body: { symbol: "AAPL", strategy: "ema_crossover", startDate: "2023-01-01", endDate: "2023-12-31", initialCapital: 10000 }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { backtestRequestSchema, type BacktestRequest } from '../../../lib/validation';
import { getSessionFromCookie } from '@/lib/auth';
import { buildBacktestEngineResult } from '@/lib/backtest/engine';
import { runCoreStrategyStep } from '@/lib/backtest/strategyExecutors';
import { getBacktestStrategy } from '@/lib/strategies/registry';
import { getOHLC, resolveSymbolToId, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import {
  parseBacktestTimeframe,
  isStrategyTimeframeCompatible,
  resamplePriceData,
  computeCoverage,
} from '@/lib/backtest/timeframe';
import { buildBacktestDiagnostics, inferStrategyDirection } from '@/lib/backtest/diagnostics';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'UI755FUUAM6FRRI9';

// Known crypto symbols for detection
const KNOWN_CRYPTO = [
  'BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK',
  'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'FIL', 'AAVE', 'EOS',
  'XTZ', 'THETA', 'XMR', 'NEO', 'MKR', 'COMP', 'SNX', 'SUSHI', 'YFI', 'CRV',
  'GRT', 'ENJ', 'MANA', 'SAND', 'AXS', 'CHZ', 'HBAR', 'FTM', 'NEAR', 'EGLD',
  'FLOW', 'ICP', 'AR', 'HNT', 'STX', 'KSM', 'ZEC', 'DASH', 'WAVES', 'KAVA',
  'BNB', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'APE', 'IMX', 'OP', 'ARB',
  'SUI', 'SEI', 'TIA', 'INJ', 'FET', 'RNDR', 'RENDER', 'JUP', 'KAS', 'HBAR',
  'RUNE', 'OSMO', 'CELO', 'ONE', 'ZIL', 'ICX', 'QTUM', 'ONT', 'ZRX', 'BAT'
];

// Detect if symbol is crypto
function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase().replace(/-?USD$/, '').replace(/-?USDT$/, '');
  return KNOWN_CRYPTO.includes(upper);
}

// Normalize symbol (remove USD suffix for crypto)
function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/-?USD$/, '').replace(/-?USDT$/, '');
}

interface Trade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  holdingPeriodDays: number;
}

interface StrategyResult {
  trades: Trade[];
  dates: string[];
  closes: number[];
}

interface PriceData {
  [date: string]: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
}

type PriceDataSource = 'alpha_vantage' | 'binance' | 'coingecko';

interface PriceFetchResult {
  priceData: PriceData;
  source: PriceDataSource;
}

// Fetch daily price data from Alpha Vantage (Stocks)
async function fetchStockPriceData(symbol: string, timeframe: string = 'daily'): Promise<PriceData> {
  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  if (!parsedTimeframe) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  let url: string;
  let timeSeriesKey: string;
  
  if (parsedTimeframe.kind === 'daily') {
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
    timeSeriesKey = 'Time Series (Daily)';
  } else {
    const interval = parsedTimeframe.alphaInterval || '1min';
    url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`;
    timeSeriesKey = `Time Series (${interval})`;
  }
  
  const response = await fetch(url);
  const data = await response.json();
  const timeSeries = data[timeSeriesKey];
  
  if (!timeSeries) {
    // Check for error messages
    if (data['Error Message']) {
      throw new Error(`Invalid symbol ${symbol}: ${data['Error Message']}`);
    }
    if (data['Note']) {
      throw new Error(`API rate limit exceeded. Please try again in a minute.`);
    }
    throw new Error(`Failed to fetch price data for ${symbol}`);
  }

  const priceData: PriceData = {};
  for (const [date, values] of Object.entries(timeSeries)) {
    priceData[date] = {
      open: parseFloat((values as any)['1. open']),
      high: parseFloat((values as any)['2. high']),
      low: parseFloat((values as any)['3. low']),
      close: parseFloat((values as any)['4. close']),
      volume: parseFloat((values as any)['5. volume'])
    };
  }
  
  if (parsedTimeframe.kind === 'intraday' && parsedTimeframe.minutes > parsedTimeframe.sourceMinutes) {
    return resamplePriceData(priceData, parsedTimeframe.minutes, parsedTimeframe.sourceMinutes);
  }

  return priceData;
}

// Fetch crypto price data from Binance (FREE, no API key, excellent historical data)
async function fetchCryptoPriceDataBinance(symbol: string, timeframe: string = 'daily', startDate: string, endDate: string): Promise<PriceData> {
  const cleanSymbol = normalizeSymbol(symbol);
  const binanceSymbol = `${cleanSymbol}USDT`;

  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  if (!parsedTimeframe) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }
  
  const interval = parsedTimeframe.binanceInterval;
  
  // Calculate timestamps
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime() + 86400000; // Add 1 day to include end date
  
  logger.info(`Fetching ${cleanSymbol} from Binance (${interval}) ${startDate} to ${endDate}`);
  
  // Binance returns max 1000 candles per request, so we may need multiple requests
  const allCandles: any[] = [];
  let currentStart = startTime;
  const limit = 1000;
  
  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${limit}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      // Try with USD pair instead of USDT
      const altUrl = `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}USD&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${limit}`;
      const altResponse = await fetch(altUrl);
      
      if (!altResponse.ok) {
        throw new Error(`Binance API error for ${cleanSymbol}: Symbol not found. Try major pairs like BTC, ETH, XRP, SOL.`);
      }
      
      const altData = await altResponse.json();
      allCandles.push(...altData);
      break;
    }
    
    const data = await response.json();
    
    if (data.code) {
      throw new Error(`Binance API error: ${data.msg}`);
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }
    
    allCandles.push(...data);
    
    // Move start time to after last candle
    const lastCandle = data[data.length - 1];
    currentStart = lastCandle[0] + 1;
    
    // If we got less than limit, we've reached the end
    if (data.length < limit) {
      break;
    }
  }
  
  if (allCandles.length === 0) {
    throw new Error(`No data found for ${cleanSymbol} on Binance. Symbol may not be listed.`);
  }
  
  // Convert Binance klines to our format
  // Kline format: [openTime, open, high, low, close, volume, closeTime, ...]
  const priceData: PriceData = {};
  for (const candle of allCandles) {
    const timestamp = candle[0];
    const date = new Date(timestamp);
    
    // Format date based on timeframe
    let dateKey: string;
    if (parsedTimeframe.kind === 'daily') {
      dateKey = date.toISOString().split('T')[0];
    } else {
      // For intraday, use full datetime
      dateKey = date.toISOString().replace('T', ' ').slice(0, 19);
    }
    
    priceData[dateKey] = {
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    };
  }
  
  const finalPriceData = parsedTimeframe.kind === 'intraday' && parsedTimeframe.minutes > parsedTimeframe.sourceMinutes
    ? resamplePriceData(priceData, parsedTimeframe.minutes, parsedTimeframe.sourceMinutes)
    : priceData;

  logger.info(`Fetched ${Object.keys(finalPriceData).length} ${timeframe} bars from Binance for ${cleanSymbol}`);
  return finalPriceData;
}

// Fetch crypto price data from CoinGecko - FALLBACK
async function fetchCryptoPriceDataCoinGecko(symbol: string, timeframe: string = 'daily'): Promise<PriceData> {
  const cleanSymbol = normalizeSymbol(symbol);
  logger.info(`Fetching crypto data for ${cleanSymbol} (${timeframe}) via CoinGecko`);

  const parsedTimeframe = parseBacktestTimeframe(timeframe);
  if (!parsedTimeframe) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  const coinId = COINGECKO_ID_MAP[cleanSymbol] || await resolveSymbolToId(cleanSymbol);
  if (!coinId) {
    throw new Error(`No CoinGecko mapping found for ${cleanSymbol}`);
  }

  const days: 1 | 7 | 14 | 30 | 90 | 180 | 365 = parsedTimeframe.kind === 'daily' ? 365 : 7;
  const ohlc = await getOHLC(coinId, days);
  if (!ohlc || ohlc.length === 0) {
    throw new Error(`Failed to fetch CoinGecko OHLC data for ${cleanSymbol}`);
  }

  const priceData: PriceData = {};
  for (const candle of ohlc) {
    const date = new Date(candle[0]);
    const key = parsedTimeframe.kind === 'daily'
      ? date.toISOString().slice(0, 10)
      : date.toISOString().replace('T', ' ').slice(0, 19);

    priceData[key] = {
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: 0,
    };
  }
  
  const finalPriceData = parsedTimeframe.kind === 'intraday' && parsedTimeframe.minutes > parsedTimeframe.sourceMinutes
    ? resamplePriceData(priceData, parsedTimeframe.minutes, parsedTimeframe.sourceMinutes)
    : priceData;

  logger.info(`Fetched ${Object.keys(finalPriceData).length} ${timeframe} bars of crypto data for ${cleanSymbol} (CoinGecko)`);
  return finalPriceData;
}

// Smart crypto fetch - tries Binance first (better data), falls back to CoinGecko
async function fetchCryptoPriceData(symbol: string, timeframe: string, startDate: string, endDate: string): Promise<PriceFetchResult> {
  try {
    // Try Binance first - better historical data for all timeframes
    return {
      priceData: await fetchCryptoPriceDataBinance(symbol, timeframe, startDate, endDate),
      source: 'binance',
    };
  } catch (binanceError) {
    logger.warn(`Binance failed for ${symbol}, trying CoinGecko: ${binanceError}`);
    // Fallback to CoinGecko
    return {
      priceData: await fetchCryptoPriceDataCoinGecko(symbol, timeframe),
      source: 'coingecko',
    };
  }
}

// Smart fetch - detects crypto vs stock and supports intraday for both
async function fetchPriceData(symbol: string, timeframe: string = 'daily', startDate: string = '', endDate: string = ''): Promise<PriceFetchResult> {
  if (isCryptoSymbol(symbol)) {
    return fetchCryptoPriceData(symbol, timeframe, startDate, endDate);
  } else {
    return {
      priceData: await fetchStockPriceData(symbol, timeframe),
      source: 'alpha_vantage',
    };
  }
}

// Calculate EMA
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;
  
  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  
  return ema;
}

// Calculate SMA
function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma[i] = sum / period;
  }
  
  return sma;
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    
    if (i <= period) {
      if (change > 0) gains += change;
      else losses += Math.abs(change);
      
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / (avgLoss || 0.0001);
        rsi[i] = 100 - (100 / (1 + rs));
      }
    } else {
      const prevAvgGain = (rsi[i-1] >= 50) ? ((100 - 100/(1 + rsi[i-1]/100)) * period - (change > 0 ? change : 0)) / period : 0;
      const prevAvgLoss = (rsi[i-1] < 50) ? ((100/(1 - rsi[i-1]/100) - 100) * period - (change < 0 ? Math.abs(change) : 0)) / period : 0;
      
      const avgGain = (prevAvgGain * (period - 1) + (change > 0 ? change : 0)) / period;
      const avgLoss = (prevAvgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
      const rs = avgGain / (avgLoss || 0.0001);
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  
  return rsi;
}

// Calculate MACD
function calculateMACD(prices: number[]): { macd: number[], signal: number[], histogram: number[] } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (ema12[i] !== undefined && ema26[i] !== undefined) {
      macd[i] = ema12[i] - ema26[i];
    }
  }
  
  const macdValues = macd.filter(v => v !== undefined);
  const signal = calculateEMA(macdValues, 9);
  const histogram: number[] = [];
  
  let signalIdx = 0;
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] !== undefined && signal[signalIdx] !== undefined) {
      histogram[i] = macd[i] - signal[signalIdx];
      signalIdx++;
    }
  }
  
  return { macd, signal, histogram };
}

// Calculate ATR
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const atr: number[] = [];
  const tr: number[] = [];
  
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  
  // First ATR is simple average
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += tr[i] || 0;
  }
  atr[period] = sum / period;
  
  // Subsequent ATRs use smoothing
  for (let i = period + 1; i < closes.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  
  return atr;
}

// Calculate ADX
function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): { adx: number[], diPlus: number[], diMinus: number[] } {
  const adx: number[] = [];
  const diPlus: number[] = [];
  const diMinus: number[] = [];
  const tr: number[] = [];
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
    
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    dmPlus[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    dmMinus[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  
  // Smoothed values
  let smoothedTR = 0, smoothedDMPlus = 0, smoothedDMMinus = 0;
  
  for (let i = 1; i <= period; i++) {
    smoothedTR += tr[i] || 0;
    smoothedDMPlus += dmPlus[i] || 0;
    smoothedDMMinus += dmMinus[i] || 0;
  }
  
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      smoothedTR = smoothedTR - (smoothedTR / period) + (tr[i] || 0);
      smoothedDMPlus = smoothedDMPlus - (smoothedDMPlus / period) + (dmPlus[i] || 0);
      smoothedDMMinus = smoothedDMMinus - (smoothedDMMinus / period) + (dmMinus[i] || 0);
    }
    
    diPlus[i] = smoothedTR > 0 ? (smoothedDMPlus / smoothedTR) * 100 : 0;
    diMinus[i] = smoothedTR > 0 ? (smoothedDMMinus / smoothedTR) * 100 : 0;
    
    const diDiff = Math.abs(diPlus[i] - diMinus[i]);
    const diSum = diPlus[i] + diMinus[i];
    const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0;
    
    if (i === period) {
      adx[i] = dx;
    } else if (adx[i - 1] !== undefined) {
      adx[i] = (adx[i - 1] * (period - 1) + dx) / period;
    }
  }
  
  return { adx, diPlus, diMinus };
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
  const bands: { upper: number[], middle: number[], lower: number[] } = {
    upper: [],
    middle: [],
    lower: []
  };
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    bands.middle[i] = avg;
    bands.upper[i] = avg + (stdDev * std);
    bands.lower[i] = avg - (stdDev * std);
  }
  
  return bands;
}

// Calculate Stochastic Oscillator
function calculateStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number = 14, dPeriod: number = 3): { k: number[], d: number[] } {
  const k: number[] = [];
  const d: number[] = [];
  
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    
    if (highestHigh - lowestLow > 0) {
      k[i] = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    } else {
      k[i] = 50;
    }
  }
  
  // Calculate %D (SMA of %K)
  for (let i = kPeriod - 1 + dPeriod - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = 0; j < dPeriod; j++) {
      sum += k[i - j] || 0;
    }
    d[i] = sum / dPeriod;
  }
  
  return { k, d };
}

// Calculate CCI (Commodity Channel Index)
function calculateCCI(highs: number[], lows: number[], closes: number[], period: number = 20): number[] {
  const cci: number[] = [];
  const tp: number[] = [];
  
  // Calculate Typical Price
  for (let i = 0; i < closes.length; i++) {
    tp[i] = (highs[i] + lows[i] + closes[i]) / 3;
  }
  
  for (let i = period - 1; i < closes.length; i++) {
    const tpSlice = tp.slice(i - period + 1, i + 1);
    const sma = tpSlice.reduce((a, b) => a + b, 0) / period;
    
    // Mean deviation
    const meanDev = tpSlice.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;
    
    if (meanDev > 0) {
      cci[i] = (tp[i] - sma) / (0.015 * meanDev);
    } else {
      cci[i] = 0;
    }
  }
  
  return cci;
}

// Calculate OBV (On Balance Volume)
function calculateOBV(closes: number[], volumes: number[]): number[] {
  const obv: number[] = [0];
  
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv[i] = obv[i - 1] + volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      obv[i] = obv[i - 1] - volumes[i];
    } else {
      obv[i] = obv[i - 1];
    }
  }
  
  return obv;
}

// Run backtest based on strategy using real price data and indicators
function runStrategy(
  strategy: string,
  priceData: PriceData,
  initialCapital: number,
  startDate: string,
  endDate: string,
  symbol: string,
  timeframe: string = 'daily'
): StrategyResult {
  const isIntraday = timeframe !== 'daily';
  
  // Get all available dates and filter by date range
  const allDates = Object.keys(priceData).sort();
  
  // Filter dates by range (works for both daily YYYY-MM-DD and intraday YYYY-MM-DD HH:MM:SS)
  const dates = allDates.filter(d => {
    const dateOnly = d.split(' ')[0]; // Extract date part for comparison
    return dateOnly >= startDate && dateOnly <= endDate;
  });
  
  logger.info(`Backtest data: ${dates.length} bars from ${dates[0] || 'N/A'} to ${dates[dates.length - 1] || 'N/A'}`);
  
  // Minimum data requirements
  const minDataPoints = isIntraday ? 50 : 100;
  if (dates.length < minDataPoints) {
    const tfLabel = isIntraday ? `${timeframe} bars` : 'days';
    throw new Error(`Insufficient data for ${symbol}. Got ${dates.length} ${tfLabel}, need at least ${minDataPoints}. Try adjusting date range.`);
  }
  
  const closes = dates.map(d => priceData[d].close);
  const trades: Trade[] = [];
  let position: { entry: number; entryDate: string; entryIdx: number } | null = null;
  
  // Get all OHLC data for MSP strategies
  const highs = dates.map(d => priceData[d].high);
  const lows = dates.map(d => priceData[d].low);
  const volumes = dates.map(d => priceData[d].volume);
  
  // Calculate indicators based on strategy
  let ema9: number[] = [];
  let ema21: number[] = [];
  let ema55: number[] = [];
  let ema200: number[] = [];
  let sma50: number[] = [];
  let sma200: number[] = [];
  let rsi: number[] = [];
  let macdData: { macd: number[], signal: number[], histogram: number[] } | null = null;
  let bbands: { upper: number[], middle: number[], lower: number[] } | null = null;
  let adxData: { adx: number[], diPlus: number[], diMinus: number[] } | null = null;
  let atr: number[] = [];
  let volSMA: number[] = [];
  
  // Strategy type detection
  const isMSP = strategy.startsWith('msp_');
  const isScalp = strategy.startsWith('scalp_');
  const isSwing = strategy.startsWith('swing_');
  const needsFullIndicators = isMSP || isScalp || isSwing || strategy === 'supertrend' || strategy === 'multi_confluence_5';
  
  // EMA calculations - needed by many strategies
  if (strategy.includes('ema') || strategy === 'multi_ema_rsi' || needsFullIndicators) {
    ema9 = calculateEMA(closes, 9);
    ema21 = calculateEMA(closes, 21);
  }
  
  // Extended EMAs for MSP/Swing/Scalp strategies
  if (needsFullIndicators) {
    ema55 = calculateEMA(closes, 55);
    // For intraday with limited data, use shorter EMA period as proxy
    const emaPeriod = closes.length >= 200 ? 200 : Math.max(55, Math.floor(closes.length * 0.6));
    ema200 = calculateEMA(closes, emaPeriod);
    adxData = calculateADX(highs, lows, closes, 14);
    atr = calculateATR(highs, lows, closes, 14);
    volSMA = calculateSMA(volumes, 20);
  }
  
  if (strategy.includes('sma')) {
    sma50 = calculateSMA(closes, 50);
    sma200 = calculateSMA(closes, 200);
  }
  
  if (strategy.includes('rsi') || strategy === 'multi_ema_rsi' || needsFullIndicators) {
    rsi = calculateRSI(closes, 14);
  }
  
  if (strategy.includes('macd') || strategy === 'multi_macd_adx' || needsFullIndicators) {
    macdData = calculateMACD(closes);
  }
  
  if (strategy.includes('bbands') || strategy.includes('bb') || strategy === 'multi_bb_stoch' || isScalp) {
    bbands = calculateBollingerBands(closes, 20, 2);
  }
  
  // Stochastic indicator
  let stochData: { k: number[], d: number[] } | null = null;
  if (strategy.includes('stoch') || strategy === 'multi_bb_stoch') {
    stochData = calculateStochastic(highs, lows, closes, 14, 3);
  }
  
  // CCI indicator
  let cci: number[] = [];
  if (strategy.includes('cci')) {
    cci = calculateCCI(highs, lows, closes, 20);
  }
  
  // OBV indicator
  let obv: number[] = [];
  if (strategy.includes('obv')) {
    obv = calculateOBV(closes, volumes);
  }
  
  // ADX for adx_trend strategy
  if (strategy === 'adx_trend' && !adxData) {
    adxData = calculateADX(highs, lows, closes, 14);
  }
  
  // Determine start index based on strategy requirements
  // Scalp strategies can start earlier, MSP/Swing need more warmup
  let startIdx: number;
  if (isScalp) {
    startIdx = 25; // Scalping needs minimal warmup
  } else if (isMSP || isSwing) {
    startIdx = Math.min(60, Math.floor(dates.length * 0.2)); // Reduced from 200/40%
  } else if (strategy === 'sma_crossover' || strategy.includes('200')) {
    startIdx = Math.min(200, Math.floor(dates.length * 0.4));
  } else {
    startIdx = 30;
  }
  
  // Strategy execution logic
  for (let i = startIdx; i < dates.length - 1; i++) {
    const date = dates[i];
    const close = closes[i];
    const coreStep = runCoreStrategyStep({
      strategy,
      i,
      date,
      close,
      initialCapital,
      symbol,
      position,
      trades,
      indicators: {
        ema9,
        ema21,
        sma50,
        sma200,
        rsi,
        closes,
        cci,
        obv,
        macdData,
        bbands,
        adxData,
        stochData,
      },
    });

    if (coreStep.handled) {
      position = coreStep.position;
      continue;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // MSP MULTI-TF DASHBOARD STRATEGY
    // ═══════════════════════════════════════════════════════════════
    
    if ((strategy === 'msp_multi_tf' || strategy === 'msp_multi_tf_strict') && adxData && macdData) {
      const { adx, diPlus, diMinus } = adxData;
      const { macd, signal, histogram } = macdData;
      const minBias = strategy === 'msp_multi_tf_strict' ? 8 : 6;
      
      // Calculate per-TF bias score (simulated using multi-period analysis)
      // TF1 (fast) - using short EMAs
      const tf1Trend = close > ema9[i] && ema9[i] > ema21[i] ? 1 : close < ema9[i] && ema9[i] < ema21[i] ? -1 : 0;
      const tf1RSI = rsi[i] > 55 ? 1 : rsi[i] < 45 ? -1 : 0;
      const tf1MACD = macd[i] > signal[i] && histogram[i] > 0 ? 1 : macd[i] < signal[i] && histogram[i] < 0 ? -1 : 0;
      const tf1Vol = volumes[i] > (volSMA[i] || 0) * 1.2 ? 1 : 0;
      const tf1Bias = tf1Trend + tf1RSI + tf1MACD + (tf1Trend !== 0 && tf1Vol ? (tf1Trend > 0 ? 1 : -1) : 0);
      
      // TF2 (medium) - using medium EMAs  
      const tf2Trend = close > ema21[i] && ema21[i] > ema55[i] ? 1 : close < ema21[i] && ema21[i] < ema55[i] ? -1 : 0;
      const rsi21 = calculateRSI(closes.slice(0, i+1), 21);
      const tf2RSI = (rsi21[rsi21.length-1] || 50) > 55 ? 1 : (rsi21[rsi21.length-1] || 50) < 45 ? -1 : 0;
      const tf2Bias = tf2Trend + tf2RSI + tf1MACD;
      
      // TF3 (slow) - using slow EMAs
      const tf3Trend = close > ema55[i] && ema55[i] > ema200[i] ? 1 : close < ema55[i] && ema55[i] < ema200[i] ? -1 : 0;
      const tf3Bias = tf3Trend + (adx[i] > 25 && diPlus[i] > diMinus[i] ? 1 : adx[i] > 25 && diMinus[i] > diPlus[i] ? -1 : 0);
      
      // TF4 (very slow) - using 200 EMA context
      const tf4Trend = close > ema200[i] ? 1 : close < ema200[i] ? -1 : 0;
      const tf4Bias = tf4Trend;
      
      // Total bias across all TFs
      const totalBias = tf1Bias + tf2Bias + tf3Bias + tf4Bias;
      
      // All TFs aligned
      const allBull = tf1Trend === 1 && tf2Trend === 1 && tf3Trend === 1 && tf4Trend === 1;
      const allBear = tf1Trend === -1 && tf2Trend === -1 && tf3Trend === -1 && tf4Trend === -1;
      
      // ADX confirmation
      const adxOk = adx[i] > 20;
      
      // Entry conditions
      const longSignal = totalBias >= minBias && adxOk && !position;
      const shortSignal = totalBias <= -minBias && adxOk && !position;
      
      // Position management with ATR-based exits (matching v1 settings)
      const slATR = 1.5;
      const tpATR = 3.0;
      
      if (longSignal) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const entryPrice = position.entry;
        const sl = entryPrice - (atr[i] || close * 0.02) * slATR;
        const tp = entryPrice + (atr[i] || close * 0.02) * tpATR;
        
        // Exit conditions
        const hitSL = lows[i] <= sl;
        const hitTP = highs[i] >= tp;
        const biasReversal = totalBias <= 0; // Exit when bias goes neutral/negative
        const barsHeld = i - position.entryIdx;
        
        if (hitSL || hitTP || biasReversal) {
          let exitPrice = close;
          if (hitSL) exitPrice = sl;
          if (hitTP) exitPrice = tp;
          
          const shares = (initialCapital * 0.95) / position.entry;
          const returnDollars = (exitPrice - position.entry) * shares;
          const returnPercent = ((exitPrice - position.entry) / position.entry) * 100;
          
          trades.push({
            entryDate: position.entryDate,
            exitDate: date,
            symbol,
            side: 'LONG',
            entry: position.entry,
            exit: exitPrice,
            return: returnDollars,
            returnPercent,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // MSP DAY TRADER STRATEGIES
    // ═══════════════════════════════════════════════════════════════
    
    if ((strategy === 'msp_day_trader' || strategy === 'msp_day_trader_strict' || strategy === 'msp_day_trader_v3' || strategy === 'msp_day_trader_v3_aggressive' || strategy === 'msp_trend_pullback' || strategy === 'msp_liquidity_reversal') && adxData && macdData) {
      const { adx, diPlus, diMinus } = adxData;
      const { macd, signal, histogram } = macdData;
      const minScore = strategy === 'msp_day_trader_strict' ? 6 : 5;
      
      // Calculate indicators for this bar
      const bullTrend = ema9[i] > ema21[i] && ema21[i] > ema55[i] && close > ema55[i];
      const bearTrend = ema9[i] < ema21[i] && ema21[i] < ema55[i] && close < ema55[i];
      const htfBull = close > ema200[i] && ema9[i] > ema200[i];
      const htfBear = close < ema200[i] && ema9[i] < ema200[i];
      const strongTrend = adx[i] >= 25;
      const trendUp = diPlus[i] > diMinus[i] && strongTrend;
      const trendDn = diMinus[i] > diPlus[i] && strongTrend;
      
      // Momentum
      const rsiBull = rsi[i] > 55 && rsi[i] < 75;
      const rsiBear = rsi[i] < 45 && rsi[i] > 25;
      const macdBull = macd[i] > signal[i] && histogram[i] > 0 && histogram[i] > (histogram[i-1] || 0);
      const macdBear = macd[i] < signal[i] && histogram[i] < 0 && histogram[i] < (histogram[i-1] || 0);
      const momBull = rsiBull && macdBull;
      const momBear = rsiBear && macdBear;
      
      // Volume
      const volSpike = volumes[i] > (volSMA[i] || 0) * 1.3;
      
      // Liquidity sweeps
      const body = Math.abs(close - priceData[dates[i]].open);
      const upWick = highs[i] - Math.max(close, priceData[dates[i]].open);
      const dnWick = Math.min(close, priceData[dates[i]].open) - lows[i];
      const priorHH = Math.max(...highs.slice(Math.max(0, i-10), i));
      const priorLL = Math.min(...lows.slice(Math.max(0, i-10), i));
      const sweepLow = lows[i] < priorLL && dnWick > body * 1.5 && close > priorLL;
      const sweepHigh = highs[i] > priorHH && upWick > body * 1.5 && close < priorHH;
      
      // FVG detection
      const bullFVG = i >= 2 && lows[i] > highs[i-2];
      const bearFVG = i >= 2 && highs[i] < lows[i-2];
      const nearBullFVG = (i >= 1 && lows[i-1] > highs[i-3]) || (i >= 2 && lows[i-2] > highs[i-4]);
      const nearBearFVG = (i >= 1 && highs[i-1] < lows[i-3]) || (i >= 2 && highs[i-2] < lows[i-4]);
      
      // Scoring system
      let scoreBull = 0;
      scoreBull += bullTrend ? 1 : 0;
      scoreBull += htfBull ? 1 : 0;
      scoreBull += trendUp ? 1 : 0;
      scoreBull += momBull ? 1 : 0;
      scoreBull += sweepLow ? 1 : 0;
      scoreBull += nearBullFVG ? 1 : 0;
      scoreBull += volSpike ? 1 : 0;
      
      let scoreBear = 0;
      scoreBear += bearTrend ? 1 : 0;
      scoreBear += htfBear ? 1 : 0;
      scoreBear += trendDn ? 1 : 0;
      scoreBear += momBear ? 1 : 0;
      scoreBear += sweepHigh ? 1 : 0;
      scoreBear += nearBearFVG ? 1 : 0;
      scoreBear += volSpike ? 1 : 0;
      
      // Specific strategy variants
      const isTrendPullback = strategy === 'msp_trend_pullback';
      const isLiquidityReversal = strategy === 'msp_liquidity_reversal';
      const isDayTraderV3 = strategy === 'msp_day_trader_v3';
      const isDayTraderV3Aggressive = strategy === 'msp_day_trader_v3_aggressive';
      
      // Entry conditions
      let longSignal = false;
      let shortSignal = false;
      
      if (isTrendPullback) {
        longSignal = bullTrend && htfBull && momBull && scoreBull >= 4;
        shortSignal = bearTrend && htfBear && momBear && scoreBear >= 4;
      } else if (isLiquidityReversal) {
        longSignal = sweepLow && momBull && htfBull && scoreBull >= 4;
        shortSignal = sweepHigh && momBear && htfBear && scoreBear >= 4;
      } else if (isDayTraderV3) {
        // Day Trader v3 Optimized - More trades, relaxed conditions
        // Only requires score >= 3 and EMA alignment (no ADX requirement)
        longSignal = scoreBull >= 3 && bullTrend;
        shortSignal = scoreBear >= 3 && bearTrend;
      } else if (isDayTraderV3Aggressive) {
        // Day Trader v3 Aggressive - Maximum trades, minimal filters
        // Only requires score >= 2 OR momentum confirmation
        longSignal = scoreBull >= 2 || (momBull && bullTrend);
        shortSignal = scoreBear >= 2 || (momBear && bearTrend);
      } else {
        // Default MSP Day Trader
        longSignal = scoreBull >= minScore && htfBull && strongTrend;
        shortSignal = scoreBear >= minScore && htfBear && strongTrend;
      }
      
      // Position management with ATR-based exits
      const slATR = 1.0;
      const tpATR = 3.5;
      
      if (!position && longSignal) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const entryPrice = position.entry;
        const sl = entryPrice - (atr[i] || close * 0.02) * slATR;
        const tp = entryPrice + (atr[i] || close * 0.02) * tpATR;
        
        // Exit conditions
        const hitSL = lows[i] <= sl;
        const hitTP = highs[i] >= tp;
        const trendFlip = bearTrend && adx[i] > 25;
        const barsHeld = i - position.entryIdx;
        const timeExit = barsHeld >= 20 && close < entryPrice + (atr[i] || 0) * 0.5;
        
        if (hitSL || hitTP || trendFlip || timeExit) {
          let exitPrice = close;
          if (hitSL) exitPrice = sl;
          if (hitTP) exitPrice = tp;
          
          const shares = (initialCapital * 0.95) / position.entry;
          const returnDollars = (exitPrice - position.entry) * shares;
          const returnPercent = ((exitPrice - position.entry) / position.entry) * 100;
          
          trades.push({
            entryDate: position.entryDate,
            exitDate: date,
            symbol,
            side: 'LONG',
            entry: position.entry,
            exit: exitPrice,
            return: returnDollars,
            returnPercent,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // INTRADAY SCALPING STRATEGIES
    // ═══════════════════════════════════════════════════════════════
    
    // VWAP Bounce Scalper - Simple VWAP approximation using typical price
    if (strategy === 'scalp_vwap_bounce') {
      // Approximate VWAP using cumulative typical price * volume / cumulative volume
      const typicalPrice = (highs[i] + lows[i] + close) / 3;
      let cumTPV = 0, cumVol = 0;
      for (let j = Math.max(0, i - 20); j <= i; j++) {
        const tp = (highs[j] + lows[j] + closes[j]) / 3;
        cumTPV += tp * volumes[j];
        cumVol += volumes[j];
      }
      const vwap = cumVol > 0 ? cumTPV / cumVol : close;
      
      // Entry: Price bounces off VWAP (within 0.5% and moving up)
      const nearVWAP = Math.abs(close - vwap) / vwap < 0.005;
      const bounceUp = close > closes[i-1] && lows[i] <= vwap * 1.003;
      
      if (!position && nearVWAP && bounceUp && rsi[i] > 40 && rsi[i] < 60) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        // Quick scalp: exit at 0.8% gain or 0.5% loss or after 10 bars
        if (gain >= 0.008 || gain <= -0.005 || barsHeld >= 10) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Opening Range Breakout (15m) - First 15m high/low breakout
    if (strategy === 'scalp_orb_15') {
      // Use first few bars as opening range (simulated)
      const sessionStart = i % 26 === 0; // Approximate new session every 26 bars (6.5hr session / 15min)
      const orbHigh = Math.max(...highs.slice(Math.max(0, i - 2), i + 1));
      const orbLow = Math.min(...lows.slice(Math.max(0, i - 2), i + 1));
      const orbRange = orbHigh - orbLow;
      
      // Breakout above ORB high with volume
      const breakoutUp = close > orbHigh && volumes[i] > (volSMA[i] || 0) * 1.2;
      
      if (!position && breakoutUp && i > 3) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const entryPrice = position.entry;
        const target = entryPrice + orbRange;
        const stop = entryPrice - orbRange * 0.5;
        const barsHeld = i - position.entryIdx;
        
        if (highs[i] >= target || lows[i] <= stop || barsHeld >= 15) {
          const exitPrice = highs[i] >= target ? target : (lows[i] <= stop ? stop : close);
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: exitPrice,
            return: (exitPrice - position.entry) * shares,
            returnPercent: ((exitPrice - position.entry) / position.entry) * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Momentum Burst - Strong momentum continuation
    if (strategy === 'scalp_momentum_burst') {
      const momentumBurst = rsi[i] > 65 && rsi[i] < 80 && 
        macdData && macdData.histogram[i] > 0 && 
        macdData.histogram[i] > (macdData.histogram[i-1] || 0) * 1.5 &&
        volumes[i] > (volSMA[i] || 0) * 1.5;
      
      if (!position && momentumBurst) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        const momentumFading = macdData && macdData.histogram[i] < (macdData.histogram[i-1] || 0);
        
        if (gain >= 0.015 || gain <= -0.008 || momentumFading || barsHeld >= 8) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Mean Reversion Scalp
    if (strategy === 'scalp_mean_revert' && bbands) {
      const oversold = close <= bbands.lower[i] && rsi[i] < 30;
      
      if (!position && oversold) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const revertedToMean = close >= bbands.middle[i];
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        
        if (revertedToMean || gain <= -0.01 || barsHeld >= 12) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // SWING TRADING STRATEGIES
    // ═══════════════════════════════════════════════════════════════
    
    // Pullback Buy Setup
    if (strategy === 'swing_pullback_buy') {
      const uptrend = ema21[i] > ema55[i] && close > ema200[i];
      const pullback = close < ema21[i] && close > ema55[i];
      const reversing = close > closes[i-1] && rsi[i] > 40;
      
      if (!position && uptrend && pullback && reversing) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        const trendBroken = close < ema55[i];
        
        if (gain >= 0.08 || gain <= -0.03 || trendBroken || barsHeld >= 30) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Breakout Swing
    if (strategy === 'swing_breakout') {
      const resistance = Math.max(...highs.slice(Math.max(0, i - 20), i));
      const breakout = close > resistance && volumes[i] > (volSMA[i] || 0) * 1.5;
      const trendConfirm = ema21[i] > ema55[i];
      
      if (!position && breakout && trendConfirm) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        const failedBreakout = close < position.entry * 0.97;
        
        if (gain >= 0.10 || failedBreakout || barsHeld >= 25) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Post-Earnings Drift (simplified)
    if (strategy === 'swing_earnings_drift') {
      // Simulate earnings surprise with volume spike + gap
      const gap = (priceData[dates[i]].open - closes[i-1]) / closes[i-1];
      const positiveGap = gap > 0.03;
      const volumeSpike = volumes[i] > (volSMA[i] || 0) * 3;
      
      if (!position && positiveGap && volumeSpike) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        
        // Hold for drift effect (5-15 days)
        if (gain >= 0.12 || gain <= -0.05 || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ADDITIONAL ELITE STRATEGIES
    // ═══════════════════════════════════════════════════════════════
    
    // Triple EMA Ribbon
    if (strategy === 'triple_ema') {
      const ribbonBull = ema9[i] > ema21[i] && ema21[i] > ema55[i];
      const ribbonBullPrev = ema9[i-1] <= ema21[i-1] || ema21[i-1] <= ema55[i-1];
      
      if (!position && ribbonBull && ribbonBullPrev) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const ribbonBear = ema9[i] < ema21[i];
        const barsHeld = i - position.entryIdx;
        
        if (ribbonBear) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // SuperTrend Strategy (simplified using ATR)
    if (strategy === 'supertrend') {
      const atrMultiplier = 3;
      const upperBand = (highs[i] + lows[i]) / 2 + atrMultiplier * (atr[i] || close * 0.02);
      const lowerBand = (highs[i] + lows[i]) / 2 - atrMultiplier * (atr[i] || close * 0.02);
      const superTrendBull = close > lowerBand;
      const superTrendBullPrev = closes[i-1] <= ((highs[i-1] + lows[i-1]) / 2 - atrMultiplier * (atr[i-1] || closes[i-1] * 0.02));
      
      if (!position && superTrendBull && superTrendBullPrev) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const superTrendBear = close < lowerBand;
        const barsHeld = i - position.entryIdx;
        
        if (superTrendBear) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Volume Breakout
    if (strategy === 'volume_breakout') {
      const priceBreakout = close > Math.max(...highs.slice(Math.max(0, i - 10), i));
      const volumeBreakout = volumes[i] > (volSMA[i] || 0) * 2;
      
      if (!position && priceBreakout && volumeBreakout) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const volumeDry = volumes[i] < (volSMA[i] || 0) * 0.5;
        const barsHeld = i - position.entryIdx;
        
        if (gain >= 0.06 || gain <= -0.025 || volumeDry || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Volume Climax Reversal
    if (strategy === 'volume_climax_reversal') {
      const climaxVolume = volumes[i] > (volSMA[i] || 0) * 3;
      const bearishCandle = close < priceData[dates[i]].open;
      const longWick = (highs[i] - Math.max(close, priceData[dates[i]].open)) > Math.abs(close - priceData[dates[i]].open) * 2;
      const potentialReversal = climaxVolume && bearishCandle && longWick && rsi[i] < 35;
      
      if (!position && potentialReversal) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        
        if (gain >= 0.05 || gain <= -0.03 || barsHeld >= 10) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Williams %R Extremes
    if (strategy === 'williams_r') {
      // Calculate Williams %R
      const period = 14;
      const highestHigh = Math.max(...highs.slice(Math.max(0, i - period + 1), i + 1));
      const lowestLow = Math.min(...lows.slice(Math.max(0, i - period + 1), i + 1));
      const williamsR = ((highestHigh - close) / (highestHigh - lowestLow)) * -100;
      
      // Oversold bounce
      if (!position && williamsR < -80 && close > closes[i-1]) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const williamsROverbought = williamsR > -20;
        const barsHeld = i - position.entryIdx;
        
        if (williamsROverbought || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // MACD Histogram Reversal
    if (strategy === 'macd_histogram_reversal' && macdData) {
      const { histogram } = macdData;
      const histReversalUp = histogram[i] > histogram[i-1] && histogram[i-1] < histogram[i-2] && histogram[i] < 0;
      
      if (!position && histReversalUp) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const histCrossedZero = histogram[i] > 0 && histogram[i-1] <= 0;
        const histPeaked = histogram[i] < histogram[i-1] && histogram[i] > 0;
        const barsHeld = i - position.entryIdx;
        
        if (histPeaked || barsHeld >= 20) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // RSI Divergence (simplified)
    if (strategy === 'rsi_divergence') {
      // Bullish divergence: price makes lower low, RSI makes higher low
      const priceLowerLow = lows[i] < Math.min(...lows.slice(Math.max(0, i - 10), i));
      const rsiHigherLow = rsi[i] > Math.min(...rsi.slice(Math.max(0, i - 10), i).filter(r => r !== undefined));
      const bullishDivergence = priceLowerLow && rsiHigherLow && rsi[i] < 40;
      
      if (!position && bullishDivergence) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const gain = (close - position.entry) / position.entry;
        const barsHeld = i - position.entryIdx;
        
        if (rsi[i] > 65 || gain <= -0.03 || barsHeld >= 15) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: gain * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // Keltner ATR Breakout
    if (strategy === 'keltner_atr_breakout') {
      const keltnerMid = ema21[i];
      const keltnerUpper = keltnerMid + 2 * (atr[i] || close * 0.02);
      const keltnerLower = keltnerMid - 2 * (atr[i] || close * 0.02);
      const breakoutUp = close > keltnerUpper && closes[i-1] <= (ema21[i-1] + 2 * (atr[i-1] || closes[i-1] * 0.02));
      
      if (!position && breakoutUp) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const backInsideChannel = close < ema21[i];
        const barsHeld = i - position.entryIdx;
        
        if (backInsideChannel || barsHeld >= 20) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
    
    // 5-Indicator Confluence
    if (strategy === 'multi_confluence_5' && macdData && bbands && adxData) {
      const emaBull = ema9[i] > ema21[i];
      const rsiBull = rsi[i] > 50 && rsi[i] < 70;
      const macdBull = macdData.histogram[i] > 0;
      const aboveBBMid = close > bbands.middle[i];
      const adxStrong = adxData.adx[i] > 25 && adxData.diPlus[i] > adxData.diMinus[i];
      
      const confluenceScore = [emaBull, rsiBull, macdBull, aboveBBMid, adxStrong].filter(Boolean).length;
      
      if (!position && confluenceScore >= 4) {
        position = { entry: close, entryDate: date, entryIdx: i };
      } else if (position) {
        const exitScore = [emaBull, rsiBull, macdBull, aboveBBMid, adxStrong].filter(Boolean).length;
        const barsHeld = i - position.entryIdx;
        
        if (exitScore <= 2 || barsHeld >= 25) {
          const shares = (initialCapital * 0.95) / position.entry;
          trades.push({
            entryDate: position.entryDate, exitDate: date, symbol, side: 'LONG',
            entry: position.entry, exit: close,
            return: (close - position.entry) * shares,
            returnPercent: ((close - position.entry) / position.entry) * 100,
            holdingPeriodDays: barsHeld + 1
          });
          position = null;
        }
      }
    }
  }
  
  return { trades, dates, closes };
}

export async function POST(req: NextRequest) {
  try {
    // Pro Trader tier required
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Please log in to use Backtesting' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ error: 'Pro Trader subscription required for Backtesting' }, { status: 403 });
    }

    // Validate request body with Zod
    const json = await req.json();
    const body: BacktestRequest = backtestRequestSchema.parse(json);
    
    const { symbol, strategy, startDate, endDate, initialCapital, timeframe = 'daily' } = body;

    const strategyDefinition = getBacktestStrategy(strategy);
    if (!strategyDefinition) {
      return NextResponse.json(
        { error: `Unknown strategy: ${strategy}` },
        { status: 400 }
      );
    }

    const isCrypto = isCryptoSymbol(symbol);
    const normalizedSymbol = isCrypto ? normalizeSymbol(symbol) : symbol.toUpperCase();
    
    const parsedTimeframe = parseBacktestTimeframe(timeframe);
    if (!parsedTimeframe) {
      return NextResponse.json(
        { error: `Unsupported timeframe format: ${timeframe}` },
        { status: 400 }
      );
    }

    if (!isStrategyTimeframeCompatible(strategyDefinition.timeframes, parsedTimeframe)) {
      return NextResponse.json(
        {
          error: `Timeframe ${parsedTimeframe.normalized} is not supported for strategy ${strategyDefinition.label}`,
        },
        { status: 400 }
      );
    }
    
    logger.info('Backtest request started', { 
      symbol: normalizedSymbol, 
      strategy: strategyDefinition.id,
      startDate, 
      endDate, 
      initialCapital,
      timeframe: parsedTimeframe.normalized,
      assetType: isCrypto ? 'crypto' : 'stock'
    });

    // Fetch real historical price data
    logger.debug(`Fetching ${isCrypto ? 'crypto (Binance)' : 'stock (Alpha Vantage)'} price data for ${normalizedSymbol} (${parsedTimeframe.normalized})...`);
    const { priceData, source: priceDataSource } = await fetchPriceData(normalizedSymbol, parsedTimeframe.normalized, startDate, endDate);
    logger.debug(`Fetched ${Object.keys(priceData).length} bars of price data`);

    const coverage = computeCoverage(priceData, startDate, endDate);

    // Run backtest with real indicators
    const { trades, dates } = runStrategy(
      strategyDefinition.id,
      priceData,
      initialCapital,
      coverage.appliedStartDate,
      coverage.appliedEndDate,
      normalizedSymbol,
      parsedTimeframe.normalized
    );
    logger.debug(`Backtest complete: ${trades.length} trades executed`);
    const result = buildBacktestEngineResult(trades, dates, initialCapital);
    const strategyDirection = inferStrategyDirection(strategyDefinition.id, result.trades);
    const diagnostics = buildBacktestDiagnostics(
      result,
      strategyDirection,
      parsedTimeframe.normalized,
      coverage.bars,
    );

    logger.info('Backtest completed successfully', { 
      symbol, 
      totalTrades: result.totalTrades,
      winRate: result.winRate,
      totalReturn: result.totalReturn.toFixed(2)
    });

    return NextResponse.json({
      ...result,
      dataSources: {
        priceData: priceDataSource,
        assetType: isCrypto ? 'crypto' : 'stock',
      },
      dataCoverage: {
        requested: {
          startDate,
          endDate,
        },
        applied: {
          startDate: coverage.appliedStartDate,
          endDate: coverage.appliedEndDate,
        },
        minAvailable: coverage.minAvailable,
        maxAvailable: coverage.maxAvailable,
        bars: coverage.bars,
      },
      strategyProfile: {
        id: strategyDefinition.id,
        label: strategyDefinition.label,
        direction: strategyDirection,
        invalidation: diagnostics.invalidation,
      },
      diagnostics,
    });
  } catch (error: any) {
    logger.error('Backtest error', { 
      error: error?.message || 'Failed to run backtest',
      stack: error?.stack
    });
    
    return NextResponse.json(
      { error: error.message || 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
