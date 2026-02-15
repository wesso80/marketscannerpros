/**
 * Bulk Scanner API - Client-triggered universe scan
 * 
 * @route POST /api/scanner/bulk
 * @description Scans top stocks or crypto to find best opportunities
 *              - Crypto: CoinGecko Commercial API (licensed, 500 calls/min)
 *              - Equity: Alpha Vantage Premium (licensed, 300 calls/min)
 * 
 * No auth required - rate limited by normal request throttling
 */

import { NextRequest, NextResponse } from "next/server";
import { getOHLC, getMarketData, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { adx, cci, ema, getIndicatorWarmupStatus, macd, OHLCVBar, rsi, stochastic } from '@/lib/indicators';

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds max for client requests

// Alpha Vantage API Key
const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY;

// =============================================================================
// UNIVERSES TO SCAN
// =============================================================================

const EQUITY_UNIVERSE = [
  // Mega-cap tech (most liquid, best signals)
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  // Finance
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK",
  // Healthcare
  "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK",
  // Consumer
  "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "HD",
  // Industrial
  "CAT", "DE", "UPS", "BA", "HON", "GE",
  // Energy
  "XOM", "CVX", "COP", "SLB",
  // Semiconductors
  "AMD", "INTC", "QCOM", "MU", "AMAT",
  // Growth/Tech
  "NFLX", "UBER", "ABNB", "SQ", "SHOP", "SNOW", "PLTR", "CRWD",
  // Other notable
  "DIS", "PYPL", "ADBE", "NOW", "INTU"
];

// Binance crypto symbols - Top 100 by market cap/volume (USDT pairs)
const CRYPTO_UNIVERSE = [
  // Top 20 by market cap
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK", "DOT",
  "MATIC", "SHIB", "LTC", "BCH", "UNI", "XLM", "NEAR", "ATOM", "ETC", "APT",
  // 21-40
  "ARB", "OP", "FIL", "VET", "HBAR", "INJ", "AAVE", "GRT", "ALGO", "FTM",
  "SAND", "MANA", "AXS", "MKR", "RNDR", "FET", "SUI", "SEI", "TIA", "IMX",
  // 41-60
  "RUNE", "THETA", "STX", "EGLD", "FLOW", "KAVA", "NEO", "XTZ", "EOS", "CFX",
  "GALA", "ROSE", "ZIL", "1INCH", "COMP", "SNX", "ENJ", "CRV", "LDO", "RPL",
  // 61-80
  "BLUR", "PENDLE", "JUP", "WLD", "STRK", "ONDO", "PYTH", "JTO", "BONK", "WIF",
  "PEPE", "FLOKI", "ORDI", "SATS", "TRX", "TON", "KAS", "KLAY", "MINA", "ZEC",
  // 81-100
  "DASH", "XMR", "BAT", "ZRX", "ANKR", "STORJ", "CELO", "ONE", "ICX", "QTUM",
  "ONT", "WAVES", "IOTA", "SC", "RVN", "BTT", "HOT", "CELR", "DENT", "CHZ"
];

// Symbol to CoinGecko ID mapping (extend from lib + add missing)
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  ...COINGECKO_ID_MAP,
  // Add missing mappings from CRYPTO_UNIVERSE
  'BCH': 'bitcoin-cash',
  'ETC': 'ethereum-classic',
  'FIL': 'filecoin',
  'VET': 'vechain',
  'HBAR': 'hedera-hashgraph',
  'AAVE': 'aave',
  'GRT': 'the-graph',
  'ALGO': 'algorand',
  'FTM': 'fantom',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'AXS': 'axie-infinity',
  'MKR': 'maker',
  'RNDR': 'render-token',
  'TIA': 'celestia',
  'IMX': 'immutable-x',
  'RUNE': 'thorchain',
  'THETA': 'theta-token',
  'STX': 'blockstack',
  'EGLD': 'elrond-erd-2',
  'FLOW': 'flow',
  'KAVA': 'kava',
  'NEO': 'neo',
  'XTZ': 'tezos',
  'EOS': 'eos',
  'CFX': 'conflux-token',
  'GALA': 'gala',
  'ROSE': 'oasis-network',
  'ZIL': 'zilliqa',
  '1INCH': '1inch',
  'COMP': 'compound-governance-token',
  'SNX': 'havven',
  'ENJ': 'enjincoin',
  'CRV': 'curve-dao-token',
  'LDO': 'lido-dao',
  'RPL': 'rocket-pool',
  'BLUR': 'blur',
  'PENDLE': 'pendle',
  'WLD': 'worldcoin-wld',
  'STRK': 'starknet',
  'ONDO': 'ondo-finance',
  'PYTH': 'pyth-network',
  'JTO': 'jito-governance-token',
  'FLOKI': 'floki',
  'ORDI': 'ordinals',
  'SATS': '1000sats-ordinals',
  'TON': 'the-open-network',
  'KLAY': 'klay-token',
  'MINA': 'mina-protocol',
  'ZEC': 'zcash',
  'DASH': 'dash',
  'XMR': 'monero',
  'BAT': 'basic-attention-token',
  'ZRX': '0x',
  'ANKR': 'ankr',
  'STORJ': 'storj',
  'CELO': 'celo',
  'ONE': 'harmony',
  'ICX': 'icon',
  'QTUM': 'qtum',
  'ONT': 'ontology',
  'WAVES': 'waves',
  'IOTA': 'iota',
  'SC': 'siacoin',
  'RVN': 'ravencoin',
  'BTT': 'bittorrent',
  'HOT': 'holotoken',
  'CELR': 'celer-network',
  'DENT': 'dent',
  'CHZ': 'chiliz',
};

// =============================================================================
// TECHNICAL INDICATOR CALCULATIONS
// =============================================================================

interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      result.push(ema);
    } else {
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }
  }
  return result;
}

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return NaN;
  
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  let avgGain = 0, avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  
  for (let i = period; i < changes.length; i++) {
    if (changes[i] > 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(ema12[i]) || isNaN(ema26[i])) macdLine.push(NaN);
    else macdLine.push(ema12[i] - ema26[i]);
  }
  
  const validMacd = macdLine.filter(v => !isNaN(v));
  if (validMacd.length < 9) return { macd: NaN, signal: NaN, histogram: NaN };
  
  const signalLine = calculateEMA(validMacd, 9);
  const macd = validMacd[validMacd.length - 1];
  const signal = signalLine[signalLine.length - 1];
  
  return { macd, signal, histogram: macd - signal };
}

function calculateADX(ohlcv: OHLCV[], period: number = 14): number {
  if (ohlcv.length < period * 2) return NaN;
  
  const tr: number[] = [], dmPlus: number[] = [], dmMinus: number[] = [];
  
  for (let i = 1; i < ohlcv.length; i++) {
    const { high, low } = ohlcv[i];
    const { high: prevHigh, low: prevLow, close: prevClose } = ohlcv[i - 1];
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  const smoothTR = calculateEMA(tr, period);
  const smoothDMPlus = calculateEMA(dmPlus, period);
  const smoothDMMinus = calculateEMA(dmMinus, period);
  
  const dx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0 || isNaN(smoothTR[i])) {
      dx.push(0);
    } else {
      const dip = (smoothDMPlus[i] / smoothTR[i]) * 100;
      const dim = (smoothDMMinus[i] / smoothTR[i]) * 100;
      const diSum = dip + dim;
      dx.push(diSum === 0 ? 0 : (Math.abs(dip - dim) / diSum) * 100);
    }
  }
  
  const adx = calculateEMA(dx.filter(v => !isNaN(v)), period);
  const result = adx.length > 0 ? adx[adx.length - 1] : NaN;
  // Clamp to 0-100 range as ADX should never exceed 100
  return Number.isFinite(result) ? Math.min(100, Math.max(0, result)) : NaN;
}

function calculateStochastic(ohlcv: OHLCV[], period: number = 14): { k: number; d: number } {
  if (ohlcv.length < period + 3) return { k: NaN, d: NaN };
  
  const rawK: number[] = [];
  for (let i = period - 1; i < ohlcv.length; i++) {
    const slice = ohlcv.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(d => d.high));
    const low = Math.min(...slice.map(d => d.low));
    const close = ohlcv[i].close;
    rawK.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
  }
  
  const kSmoothed = calculateSMA(rawK, 3);
  const d = calculateSMA(kSmoothed.filter(v => !isNaN(v)), 3);
  
  return { k: kSmoothed[kSmoothed.length - 1] || NaN, d: d[d.length - 1] || NaN };
}

function calculateAroon(ohlcv: OHLCV[], period: number = 25): { up: number; down: number } {
  if (ohlcv.length < period) return { up: NaN, down: NaN };
  
  const slice = ohlcv.slice(-period);
  let highestIdx = 0, lowestIdx = 0;
  let highestVal = slice[0].high, lowestVal = slice[0].low;
  
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high >= highestVal) { highestVal = slice[i].high; highestIdx = i; }
    if (slice[i].low <= lowestVal) { lowestVal = slice[i].low; lowestIdx = i; }
  }
  
  return {
    up: ((period - (period - 1 - highestIdx)) / period) * 100,
    down: ((period - (period - 1 - lowestIdx)) / period) * 100
  };
}

function calculateCCI(ohlcv: OHLCV[], period: number = 20): number {
  if (ohlcv.length < period) return NaN;
  
  const typicalPrices = ohlcv.map(d => (d.high + d.low + d.close) / 3);
  const sma = calculateSMA(typicalPrices, period);
  const lastSMA = sma[sma.length - 1];
  if (isNaN(lastSMA)) return NaN;
  
  const slice = typicalPrices.slice(-period);
  const meanDev = slice.reduce((sum, tp) => sum + Math.abs(tp - lastSMA), 0) / period;
  if (meanDev === 0) return 0;
  
  return (typicalPrices[typicalPrices.length - 1] - lastSMA) / (0.015 * meanDev);
}

// =============================================================================
// SCORING FORMULA (7 Technical Indicators)
// =============================================================================

interface Indicators {
  price: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  adx?: number;
  stochK?: number;
  aroonUp?: number;
  aroonDown?: number;
  cci?: number;
  change24h?: number;
}

function computeScore(indicators: Indicators): { 
  score: number; 
  direction: 'bullish' | 'bearish' | 'neutral'; 
  signals: { bullish: number; bearish: number; neutral: number } 
} {
  let bullish = 0, bearish = 0, neutral = 0;
  const { price, ema200, rsi, macd, macdSignal, adx, stochK, aroonUp, aroonDown, cci } = indicators;

  // =================================================================
  // ADX-BASED TREND MULTIPLIER (not a directional vote!)
  // ADX measures trend STRENGTH, not direction
  // High ADX = trust trend signals more, Low ADX = choppy, reduce trust
  // =================================================================
  let trendMultiplier = 1.0;
  if (adx !== undefined && !isNaN(adx)) {
    if (adx >= 40) {
      trendMultiplier = 1.4; // Very strong trend - heavily trust trend signals
    } else if (adx >= 25) {
      trendMultiplier = 1.25; // Strong trend - trust trend signals more
    } else if (adx >= 20) {
      trendMultiplier = 1.0; // Moderate - normal weighting
    } else {
      trendMultiplier = 0.7; // Choppy market - reduce trend signal trust
    }
  }

  // =================================================================
  // TREND-BASED SIGNALS (affected by ADX multiplier)
  // =================================================================

  // 1. Trend vs EMA200 (base weight: 2, affected by ADX)
  if (price && ema200) {
    const ema200Weight = 2 * trendMultiplier;
    if (price > ema200 * 1.01) bullish += ema200Weight;
    else if (price < ema200 * 0.99) bearish += ema200Weight;
    else neutral += 1;
  }

  // 2. MACD (base weight: 1.5, affected by ADX)
  if (macd !== undefined && macdSignal !== undefined && !isNaN(macd) && !isNaN(macdSignal)) {
    const macdWeight = 1 * trendMultiplier;
    if (macd > macdSignal) bullish += macdWeight; else bearish += macdWeight;
    if (macd > 0) bullish += 0.5 * trendMultiplier; else bearish += 0.5 * trendMultiplier;
  }

  // 3. Aroon (base weight: 1, affected by ADX - it's a trend indicator)
  if (aroonUp !== undefined && aroonDown !== undefined && !isNaN(aroonUp) && !isNaN(aroonDown)) {
    const aroonWeight = 1 * trendMultiplier;
    if (aroonUp > aroonDown && aroonUp > 70) bullish += aroonWeight;
    else if (aroonDown > aroonUp && aroonDown > 70) bearish += aroonWeight;
    else neutral += 0.5;
  }

  // =================================================================
  // MOMENTUM/OSCILLATOR SIGNALS (NOT affected by ADX)
  // These work differently - they catch reversals in ranges
  // =================================================================

  // 4. RSI (not affected by ADX - works well in ranges for reversals)
  if (rsi !== undefined && !isNaN(rsi)) {
    if (rsi >= 55 && rsi <= 70) bullish += 1;
    else if (rsi > 70) bearish += 1;
    else if (rsi <= 45 && rsi >= 30) bearish += 1;
    else if (rsi < 30) bullish += 1;
    else neutral += 1;
  }

  // 5. Stochastic (not affected by ADX - oscillator works in ranges)
  if (stochK !== undefined && !isNaN(stochK)) {
    if (stochK > 80) bearish += 1;
    else if (stochK < 20) bullish += 1;
    else if (stochK >= 50) bullish += 0.5;
    else bearish += 0.5;
  }

  // 6. CCI (not affected by ADX)
  if (cci !== undefined && !isNaN(cci)) {
    if (cci > 100) bullish += 1;
    else if (cci > 0) bullish += 0.5;
    else if (cci < -100) bearish += 1;
    else bearish += 0.5;
  }

  // Direction
  let direction: 'bullish' | 'bearish' | 'neutral';
  if (bullish > bearish * 1.3) direction = 'bullish';
  else if (bearish > bullish * 1.3) direction = 'bearish';
  else direction = 'neutral';

  // Score 0-100 (max possible signals depends on ADX multiplier)
  const maxSignals = 7 * trendMultiplier; // Dynamic based on trend strength
  let score = 50 + ((bullish - bearish) / maxSignals) * 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { 
    score, 
    direction, 
    signals: { 
      bullish: Math.round(bullish * 10) / 10, 
      bearish: Math.round(bearish * 10) / 10, 
      neutral: Math.round(neutral * 10) / 10 
    } 
  };
}

// =============================================================================
// DATA FETCHERS (Licensed APIs)
// =============================================================================

// CoinGecko days mapping for OHLC endpoint
const COINGECKO_DAYS_MAP: Record<string, 1 | 7 | 14 | 30 | 90 | 180 | 365> = {
  '15m': 1,   // 1 day gives ~48 candles (30-min granularity on free, 15-min on Pro)
  '30m': 7,   // 7 days gives ~336 candles
  '1h': 30,   // 30 days of hourly data
  '1d': 180   // 180 days of daily data
};

// Alpha Vantage interval mapping
const AV_INTERVAL_MAP: Record<string, string> = {
  '15m': '15min',
  '30m': '30min',
  '1h': '60min',
  '1d': 'daily'
};

// Fetch crypto OHLCV data from CoinGecko (Commercial licensed - 500 calls/min)
async function fetchCoinGeckoData(symbol: string, timeframe: string = '1d'): Promise<OHLCV[] | null> {
  try {
    // Skip stablecoins
    const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD'];
    if (stablecoins.includes(symbol.toUpperCase())) return null;
    
    // Get CoinGecko ID from symbol
    const coinId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
    if (!coinId) {
      console.warn(`[bulk-scan] No CoinGecko mapping for ${symbol}`);
      return null;
    }
    
    const days = COINGECKO_DAYS_MAP[timeframe] || 30;
    const ohlcData = await getOHLC(coinId, days);
    
    if (!ohlcData || !Array.isArray(ohlcData) || ohlcData.length < 20) {
      return null;
    }
    
    // CoinGecko OHLC format: [[timestamp, open, high, low, close], ...]
    const ohlcv: OHLCV[] = ohlcData.map((candle: number[]) => ({
      date: new Date(candle[0]).toISOString(),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: 0 // CoinGecko OHLC doesn't include volume
    })).filter((c: OHLCV) => Number.isFinite(c.close));
    
    return ohlcv.length >= 20 ? ohlcv : null;
  } catch (err) {
    console.error(`[bulk-scan] CoinGecko fetch error for ${symbol}:`, err);
    return null;
  }
}

// Fetch equity OHLCV data from Alpha Vantage (Premium licensed - 300 calls/min)
async function fetchAlphaVantageData(symbol: string, timeframe: string = '1d'): Promise<OHLCV[] | null> {
  try {
    if (!ALPHA_KEY) {
      console.error('[bulk-scan] No Alpha Vantage API key');
      return null;
    }
    
    const interval = AV_INTERVAL_MAP[timeframe] || 'daily';
    let url: string;
    let tsKey: string;
    
    if (interval === 'daily') {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=delayed&apikey=${ALPHA_KEY}`;
      tsKey = 'Time Series (Daily)';
    } else {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=compact&entitlement=delayed&apikey=${ALPHA_KEY}`;
      tsKey = `Time Series (${interval})`;
    }
    
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    
    const data = await res.json();
    
    // Check for rate limit or errors
    if (data.Note || data.Information) {
      console.warn(`[bulk-scan] AV rate limit for ${symbol}`);
      return null;
    }
    if (data['Error Message']) {
      console.error(`[bulk-scan] AV error for ${symbol}: ${data['Error Message']}`);
      return null;
    }
    
    const ts = data[tsKey] || data['Time Series (Daily)'] || {};
    
    const ohlcv: OHLCV[] = Object.entries(ts).map(([date, values]: [string, any]) => ({
      date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseFloat(values['5. volume'] || '0')
    }))
    .filter((c: OHLCV) => Number.isFinite(c.close))
    .sort((a, b) => a.date.localeCompare(b.date)); // Sort oldest first
    
    return ohlcv.length >= 50 ? ohlcv : null;
  } catch (err) {
    console.error(`[bulk-scan] Alpha Vantage fetch error for ${symbol}:`, err);
    return null;
  }
}

function analyzeAsset(symbol: string, ohlcv: OHLCV[]): {
  symbol: string;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signals: { bullish: number; bearish: number; neutral: number };
  indicators: Indicators;
  change24h: number;
  derivatives?: {
    openInterest: number;
    openInterestCoin: number;
    fundingRate?: number;
    longShortRatio?: number;
  };
} | null {
  return analyzeAssetByTimeframe(symbol, ohlcv, '1d');
}

function analyzeAssetByTimeframe(
  symbol: string,
  ohlcv: OHLCV[],
  timeframe: string
): {
  symbol: string;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signals: { bullish: number; bearish: number; neutral: number };
  indicators: Indicators;
  change24h: number;
  derivatives?: {
    openInterest: number;
    openInterestCoin: number;
    fundingRate?: number;
    longShortRatio?: number;
  };
} | null {
  if (!ohlcv || ohlcv.length < 20) return null;

  const warmup = getIndicatorWarmupStatus(ohlcv.length, timeframe);
  if (!warmup.coreReady) return null;

  const bars: OHLCVBar[] = ohlcv.map((bar) => ({
    timestamp: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
  
  const closes = ohlcv.map(d => d.close);
  const price = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2];
  const change24h = ((price - prevPrice) / prevPrice) * 100;
  
  // Use shorter EMA when history is below 200 bars
  const emaPeriod = Math.min(200, Math.floor(closes.length * 0.8));
  const emaValue = ema(closes, emaPeriod);
  const macdData = macd(closes);
  const stoch = stochastic(bars);
  const aroon = calculateAroon(ohlcv);
  const adxData = adx(bars);
  const cciValue = cci(bars);
  const rsiValue = rsi(closes);
  
  const indicators: Indicators = {
    price,
    ema200: emaValue ?? Number.NaN,
    rsi: rsiValue ?? Number.NaN,
    macd: macdData?.line ?? Number.NaN,
    macdSignal: macdData?.signal ?? Number.NaN,
    adx: adxData?.adx ?? Number.NaN,
    stochK: stoch?.k ?? Number.NaN,
    aroonUp: aroon.up,
    aroonDown: aroon.down,
    cci: cciValue ?? Number.NaN,
    change24h
  };
  
  const { score, direction, signals } = computeScore(indicators);
  return { symbol, score, direction, signals, indicators, change24h };
}

// =============================================================================
// BINANCE DERIVATIVES DATA (OI, FUNDING, L/S RATIO)
// =============================================================================

interface DerivativesData {
  openInterest: number;        // OI in USD
  openInterestCoin: number;    // OI in native coin
  oiChange24h?: number;        // 24h OI change %
  fundingRate?: number;        // Current funding rate
  longShortRatio?: number;     // L/S ratio
}

type BulkScanMode = 'deep' | 'light';

const STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD'];
const LIGHT_SCAN_PER_PAGE = 250;
const LIGHT_SCAN_MAX_API_CALLS = Math.max(1, Number(process.env.SCANNER_LIGHT_MAX_CG_CALLS || 30));
const LIGHT_EQUITY_MAX_API_CALLS = Math.max(2, Number(process.env.SCANNER_LIGHT_MAX_AV_CALLS || 8));

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreLightCryptoCandidate(coin: {
  symbol: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
}, timeframe: string): {
  symbol: string;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  change24h: number;
  signals: { bullish: number; bearish: number; neutral: number };
  indicators: { price: number };
} | null {
  const symbol = coin.symbol.toUpperCase();
  const price = Number(coin.current_price);
  const marketCap = Number(coin.market_cap);
  const volume = Number(coin.total_volume);
  const rank = Number(coin.market_cap_rank || 99999);
  const change1h = Number(coin.price_change_percentage_1h_in_currency || 0);
  const change24h = Number(coin.price_change_percentage_24h || 0);
  const change7d = Number(coin.price_change_percentage_7d_in_currency || 0);

  const momentumChange = timeframe === '1d'
    ? change7d
    : (timeframe === '1h' ? change24h : change1h);

  const momentumRange = timeframe === '1d' ? 60 : (timeframe === '1h' ? 30 : 15);
  const bullishThreshold = timeframe === '1d' ? 4 : (timeframe === '1h' ? 2 : 0.7);
  const bearishThreshold = -bullishThreshold;

  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(marketCap) || marketCap <= 0) return null;
  if (!Number.isFinite(volume) || volume <= 0) return null;

  const momentumScore = clamp(((momentumChange + momentumRange) / (momentumRange * 2)) * 100, 0, 100);
  const turnover = volume / marketCap;
  const liquidityScore = clamp((Math.log10(volume + 1) / 11) * 100, 0, 100);
  const turnoverScore = clamp(turnover * 250, 0, 100);
  const rankScore = clamp(((1200 - rank) / 1200) * 100, 0, 100);

  const scoreRaw =
    momentumScore * 0.45 +
    liquidityScore * 0.25 +
    turnoverScore * 0.20 +
    rankScore * 0.10;

  const score = Math.round(clamp(scoreRaw, 0, 100));

  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  if (momentumChange >= bullishThreshold) bullish += 1;
  else if (momentumChange <= bearishThreshold) bearish += 1;
  else neutral += 1;
  if (turnover >= 0.08) bullish += 1; else if (turnover < 0.025) bearish += 1; else neutral += 1;
  if (rank <= 250) bullish += 1; else if (rank > 1200) bearish += 1; else neutral += 1;

  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bullish > bearish) direction = 'bullish';
  if (bearish > bullish) direction = 'bearish';

  return {
    symbol,
    score,
    direction,
    change24h,
    signals: { bullish, bearish, neutral },
    indicators: { price }
  };
}

async function runLightCryptoScan(maxCoins: number, startTime: number, timeframe: string) {
  const maxCoinsByApiCap = LIGHT_SCAN_MAX_API_CALLS * LIGHT_SCAN_PER_PAGE;
  const cappedCoins = clamp(maxCoins, 100, Math.min(15000, maxCoinsByApiCap));
  const pageCount = Math.ceil(cappedCoins / LIGHT_SCAN_PER_PAGE);
  const markets: any[] = [];
  let apiCallsUsed = 0;

  for (let page = 1; page <= pageCount; page++) {
    if (Date.now() - startTime > 55000) {
      console.log('[bulk-scan/light] Time limit reached while fetching CoinGecko pages');
      break;
    }

    const remaining = cappedCoins - markets.length;
    if (remaining <= 0) break;

    const pageData = await getMarketData({
      order: 'market_cap_desc',
      per_page: Math.min(LIGHT_SCAN_PER_PAGE, remaining),
      page,
      sparkline: false,
      price_change_percentage: ['1h', '24h', '7d'],
    });
    apiCallsUsed += 1;

    if (!pageData || pageData.length === 0) {
      break;
    }

    markets.push(...pageData);

    if (pageData.length < Math.min(LIGHT_SCAN_PER_PAGE, remaining)) {
      break;
    }
  }

  const dedupedBySymbol = new Map<string, any>();
  for (const coin of markets) {
    const symbol = String(coin.symbol || '').toUpperCase();
    if (!symbol || STABLECOINS.includes(symbol)) continue;
    if (!dedupedBySymbol.has(symbol)) {
      dedupedBySymbol.set(symbol, coin);
    }
  }

  const ranked = Array.from(dedupedBySymbol.values())
    .map((coin) => scoreLightCryptoCandidate(coin, timeframe))
    .filter((item): item is NonNullable<ReturnType<typeof scoreLightCryptoCandidate>> => item !== null)
    .sort((a, b) => b.score - a.score);

  return {
    scanned: ranked.length,
    topPicks: ranked.slice(0, 10),
    sourceCoinsFetched: markets.length,
    apiCallsUsed,
    apiCallsCap: LIGHT_SCAN_MAX_API_CALLS,
    effectiveUniverseSize: cappedCoins,
  };
}

function parseAlphaNumber(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(/,/g, '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeTicker(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

async function fetchAlphaTopMovers(): Promise<{
  gainers: any[];
  losers: any[];
  active: any[];
  apiCallsUsed: number;
}> {
  if (!ALPHA_KEY) {
    return { gainers: [], losers: [], active: [], apiCallsUsed: 0 };
  }

  try {
    const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHA_KEY}`;
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();

    if (data?.Note || data?.Information || data?.['Error Message']) {
      return { gainers: [], losers: [], active: [], apiCallsUsed: 1 };
    }

    return {
      gainers: data?.top_gainers || [],
      losers: data?.top_losers || [],
      active: data?.most_actively_traded || [],
      apiCallsUsed: 1,
    };
  } catch {
    return { gainers: [], losers: [], active: [], apiCallsUsed: 1 };
  }
}

async function fetchAlphaBulkQuotes(
  symbols: string[],
  maxApiCalls: number
): Promise<{ priceMap: Map<string, any>; apiCallsUsed: number }> {
  const priceMap = new Map<string, any>();
  if (!ALPHA_KEY || symbols.length === 0 || maxApiCalls <= 0) {
    return { priceMap, apiCallsUsed: 0 };
  }

  const batchSize = 100;
  let apiCallsUsed = 0;

  for (let index = 0; index < symbols.length; index += batchSize) {
    if (apiCallsUsed >= maxApiCalls) break;
    const batch = symbols.slice(index, index + batchSize);
    const symbolList = batch.join(',');
    const url = `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(symbolList)}&entitlement=delayed&apikey=${ALPHA_KEY}`;

    try {
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      apiCallsUsed += 1;

      if (data?.Note || data?.Information || data?.['Error Message']) {
        break;
      }

      const rows = Array.isArray(data?.data) ? data.data : [];
      for (const row of rows) {
        const ticker = normalizeTicker(row?.['01. symbol'] || row?.symbol);
        if (!ticker) continue;
        priceMap.set(ticker, row);
      }
    } catch {
      apiCallsUsed += 1;
    }
  }

  return { priceMap, apiCallsUsed };
}

function scoreLightEquityCandidate(
  symbol: string,
  quote: any,
  timeframe: string,
  moverBias: number
): {
  symbol: string;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  change24h: number;
  signals: { bullish: number; bearish: number; neutral: number };
  indicators: { price: number };
} | null {
  const price = parseAlphaNumber(quote?.['05. price'] || quote?.price);
  const open = parseAlphaNumber(quote?.['02. open'] || quote?.open);
  const prevClose = parseAlphaNumber(quote?.['08. previous close'] || quote?.['previous_close']);
  const dayChangePercent = parseAlphaNumber(quote?.['10. change percent'] || quote?.['change_percent']);
  const volume = parseAlphaNumber(quote?.['06. volume'] || quote?.volume);

  if (!Number.isFinite(price) || price <= 0) return null;

  const intradayChange = Number.isFinite(open) && open > 0
    ? ((price - open) / open) * 100
    : (Number.isFinite(dayChangePercent) ? dayChangePercent : 0);
  const dailyChange = Number.isFinite(dayChangePercent)
    ? dayChangePercent
    : (Number.isFinite(prevClose) && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0);

  const momentumChange = timeframe === '1d'
    ? dailyChange
    : (timeframe === '1h' ? intradayChange * 0.8 + dailyChange * 0.6 : intradayChange * 1.2 + dailyChange * 0.35);

  const momentumRange = timeframe === '1d' ? 12 : (timeframe === '1h' ? 8 : 5);
  const momentumScore = clamp(((momentumChange + momentumRange) / (momentumRange * 2)) * 100, 0, 100);
  const liquidityScore = Number.isFinite(volume) && volume > 0
    ? clamp((Math.log10(volume + 1) / 9) * 100, 0, 100)
    : 35;
  const moverBiasScore = clamp(50 + moverBias * 25, 0, 100);

  const scoreRaw = momentumScore * 0.55 + liquidityScore * 0.3 + moverBiasScore * 0.15;
  const score = Math.round(clamp(scoreRaw, 0, 100));

  const bullishThreshold = timeframe === '1d' ? 1.0 : (timeframe === '1h' ? 0.7 : 0.35);
  const bearishThreshold = -bullishThreshold;

  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  if (momentumChange >= bullishThreshold) bullish += 1;
  else if (momentumChange <= bearishThreshold) bearish += 1;
  else neutral += 1;

  if (Number.isFinite(volume) && volume > 2_000_000) bullish += 1;
  else if (Number.isFinite(volume) && volume < 300_000) bearish += 1;
  else neutral += 1;

  if (moverBias > 0) bullish += 1;
  else if (moverBias < 0) bearish += 1;
  else neutral += 1;

  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bullish > bearish) direction = 'bullish';
  if (bearish > bullish) direction = 'bearish';

  return {
    symbol,
    score,
    direction,
    change24h: dailyChange,
    signals: { bullish, bearish, neutral },
    indicators: { price },
  };
}

async function runLightEquityScan(startTime: number, timeframe: string, universeSize: number) {
  const moverData = await fetchAlphaTopMovers();

  const moverBiasMap = new Map<string, number>();
  for (const row of moverData.gainers) {
    const ticker = normalizeTicker(row?.ticker || row?.symbol);
    if (ticker) moverBiasMap.set(ticker, 1);
  }
  for (const row of moverData.losers) {
    const ticker = normalizeTicker(row?.ticker || row?.symbol);
    if (ticker) moverBiasMap.set(ticker, -1);
  }
  for (const row of moverData.active) {
    const ticker = normalizeTicker(row?.ticker || row?.symbol);
    if (ticker && !moverBiasMap.has(ticker)) moverBiasMap.set(ticker, 0.4);
  }

  const candidateSymbols = new Set<string>(EQUITY_UNIVERSE);
  for (const ticker of moverBiasMap.keys()) candidateSymbols.add(ticker);
  const maxCandidates = Math.max(30, Math.floor(universeSize || 200));
  const prioritized = [
    ...Array.from(moverBiasMap.keys()),
    ...EQUITY_UNIVERSE.filter((symbol) => !moverBiasMap.has(symbol)),
  ];
  const candidates = Array.from(new Set(prioritized)).slice(0, maxCandidates);

  if (Date.now() - startTime > 55000) {
    return {
      scanned: 0,
      topPicks: [] as any[],
      sourceSymbols: candidates.length,
      apiCallsUsed: moverData.apiCallsUsed,
      apiCallsCap: LIGHT_EQUITY_MAX_API_CALLS,
      effectiveUniverseSize: candidates.length,
    };
  }

  const quoteResult = await fetchAlphaBulkQuotes(
    candidates,
    Math.max(0, LIGHT_EQUITY_MAX_API_CALLS - moverData.apiCallsUsed)
  );

  const ranked = candidates
    .map((symbol) => scoreLightEquityCandidate(symbol, quoteResult.priceMap.get(symbol), timeframe, moverBiasMap.get(symbol) ?? 0))
    .filter((item): item is NonNullable<ReturnType<typeof scoreLightEquityCandidate>> => item !== null)
    .sort((left, right) => right.score - left.score);

  return {
    scanned: ranked.length,
    topPicks: ranked.slice(0, 10),
    sourceSymbols: candidates.length,
    apiCallsUsed: moverData.apiCallsUsed + quoteResult.apiCallsUsed,
    apiCallsCap: LIGHT_EQUITY_MAX_API_CALLS,
    effectiveUniverseSize: candidates.length,
  };
}

async function fetchCryptoDerivatives(symbol: string): Promise<DerivativesData | null> {
  try {
    // Convert BTC -> BTCUSDT for Binance
    const binanceSymbol = `${symbol}USDT`;
    
    const [oiRes, fundingRes, lsRes] = await Promise.all([
      // Open Interest
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${binanceSymbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null),
      // Funding Rate
      fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${binanceSymbol}&limit=1`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null),
      // Long/Short Ratio
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${binanceSymbol}&period=1h&limit=1`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null)
    ]);
    
    let openInterestCoin = 0;
    let fundingRate: number | undefined;
    let longShortRatio: number | undefined;
    
    if (oiRes?.ok) {
      const oi = await oiRes.json();
      openInterestCoin = parseFloat(oi.openInterest || '0');
    }
    
    if (fundingRes?.ok) {
      const funding = await fundingRes.json();
      if (funding?.[0]?.fundingRate) {
        fundingRate = parseFloat(funding[0].fundingRate) * 100; // Convert to %
      }
    }
    
    if (lsRes?.ok) {
      const ls = await lsRes.json();
      if (ls?.[0]?.longShortRatio) {
        longShortRatio = parseFloat(ls[0].longShortRatio);
      }
    }
    
    if (openInterestCoin === 0) return null;
    
    return {
      openInterest: 0, // Will calculate with price
      openInterestCoin,
      fundingRate,
      longShortRatio
    };
  } catch {
    return null;
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await req.json();
    const { type, timeframe = '1d' } = body; // 'equity' or 'crypto', timeframe: '15m', '30m', '1h', '1d'
    const mode: BulkScanMode = body?.mode === 'light' ? 'light' : 'deep';
    const universeSizeRaw = Number(body?.universeSize ?? body?.maxCoins ?? 0);
    const universeSize = Number.isFinite(universeSizeRaw) && universeSizeRaw > 0
      ? Math.floor(universeSizeRaw)
      : 500;
    
    if (!type || !['equity', 'crypto'].includes(type)) {
      return NextResponse.json({ error: "Type must be 'equity' or 'crypto'" }, { status: 400 });
    }
    
    const validTimeframes = ['15m', '30m', '1h', '1d'];
    const selectedTimeframe = validTimeframes.includes(timeframe) ? timeframe : '1d';

    if (type === 'crypto' && mode === 'light') {
      console.log(`[bulk-scan/light] Scanning up to ${universeSize} crypto assets using market-data ranking...`);
      const lightResult = await runLightCryptoScan(universeSize, startTime, selectedTimeframe);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      return NextResponse.json({
        success: true,
        type,
        timeframe: selectedTimeframe,
        mode,
        scanned: lightResult.scanned,
        duration: `${duration}s`,
        topPicks: lightResult.topPicks,
        sourceCoinsFetched: lightResult.sourceCoinsFetched,
        apiCallsUsed: lightResult.apiCallsUsed,
        apiCallsCap: lightResult.apiCallsCap,
        effectiveUniverseSize: lightResult.effectiveUniverseSize,
        errors: [],
      });
    }

    if (type === 'equity' && mode === 'light') {
      console.log(`[bulk-scan/light] Scanning up to ${universeSize} equities using hybrid movers + bulk quotes...`);
      const lightResult = await runLightEquityScan(startTime, selectedTimeframe, universeSize);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      return NextResponse.json({
        success: true,
        type,
        timeframe: selectedTimeframe,
        mode,
        scanned: lightResult.scanned,
        duration: `${duration}s`,
        topPicks: lightResult.topPicks,
        sourceSymbols: lightResult.sourceSymbols,
        apiCallsUsed: lightResult.apiCallsUsed,
        apiCallsCap: lightResult.apiCallsCap,
        effectiveUniverseSize: lightResult.effectiveUniverseSize,
        errors: [],
      });
    }
    
    const universe = type === 'equity' ? EQUITY_UNIVERSE : CRYPTO_UNIVERSE;
    const results: any[] = [];
    const errors: string[] = [];
    
    console.log(`[bulk-scan] Scanning ${universe.length} ${type} on ${selectedTimeframe} timeframe...`);
    
    // For crypto, pre-fetch all derivatives data in parallel
    const derivativesMap = new Map<string, DerivativesData>();
    if (type === 'crypto') {
      const derivPromises = CRYPTO_UNIVERSE.map(async (symbol) => {
        const data = await fetchCryptoDerivatives(symbol);
        if (data) derivativesMap.set(symbol, data);
      });
      await Promise.all(derivPromises);
      console.log(`[bulk-scan] Fetched derivatives for ${derivativesMap.size} coins`);
    }
    
    // Crypto: CoinGecko (licensed, slower - 10 per batch)
    // Equity: Alpha Vantage (licensed, rate limited - 5 per batch)
    const BATCH_SIZE = type === 'crypto' ? 10 : 5;
    const DELAY = type === 'crypto' ? 200 : 250; // More delay to respect rate limits
    
    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (id) => {
        try {
          // Crypto uses CoinGecko (licensed), Equity uses Alpha Vantage (licensed)
          const ohlcv = type === 'crypto' 
            ? await fetchCoinGeckoData(id, selectedTimeframe)
            : await fetchAlphaVantageData(id, selectedTimeframe);
          
          if (!ohlcv) {
            errors.push(`${id}: No data`);
            return null;
          }
          
          const result = analyzeAssetByTimeframe(id, ohlcv, selectedTimeframe);
          if (result && type === 'crypto') {
            // Add derivatives data
            const derivData = derivativesMap.get(id);
            if (derivData && result.indicators?.price) {
              result.derivatives = {
                openInterest: derivData.openInterestCoin * result.indicators.price,
                openInterestCoin: derivData.openInterestCoin,
                fundingRate: derivData.fundingRate,
                longShortRatio: derivData.longShortRatio
              };
            }
          }
          return result;
        } catch (e: any) {
          errors.push(`${id}: ${e.message}`);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));
      
      // Progress check - stop if taking too long
      if (Date.now() - startTime > 55000) {
        console.log(`[bulk-scan] Time limit approaching, stopping early`);
        break;
      }
      
      if (i + BATCH_SIZE < universe.length) {
        await new Promise(r => setTimeout(r, DELAY));
      }
    }
    
    // Sort by score and get top 10
    const topPicks = results
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[bulk-scan] Complete in ${duration}s. Top: ${topPicks.map(p => `${p.symbol}:${p.score}`).join(', ')}`);
    
    return NextResponse.json({
      success: true,
      type,
      timeframe: selectedTimeframe,
      mode,
      scanned: results.length,
      duration: `${duration}s`,
      topPicks,
      errors: errors.slice(0, 5)
    });
    
  } catch (error: any) {
    console.error("[bulk-scan] Error:", error);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
