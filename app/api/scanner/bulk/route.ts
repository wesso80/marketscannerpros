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
import { getDerivativesForSymbols, getOHLC, getMarketData, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { adx, atr as atrFn, atrPercent as atrPctFn, cci, ema, getIndicatorWarmupStatus, macd, OHLCVBar, rsi, stochastic } from '@/lib/indicators';
import { getSessionFromCookie } from '@/lib/auth';
import {
  OHLCV,
  calculateSMA, calculateEMA, calculateRSI, calculateMACD,
  calculateADX, calculateStochastic, calculateAroon, calculateCCI,
} from '@/lib/scanner-indicators';
import { getAdaptiveLayer } from '@/lib/adaptiveTrader';
import { computeInstitutionalFilter, inferStrategyFromText } from '@/lib/institutionalFilter';
import { avTakeToken } from '@/lib/avRateGovernor';
import { getBulkCachedScanData, CachedScanData } from '@/lib/scannerCache';
import { q as dbQuery } from '@/lib/db';

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

// Crypto symbols - Top 100 by market cap/volume
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
// TECHNICAL INDICATOR CALCULATIONS — imported from lib/scanner-indicators.ts
// =============================================================================

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
  volume?: number;
  mfi?: number;
  obv?: number;
  vwap?: number;
  atr?: number;
  atr_percent?: number;
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
  if (bullish > bearish * 1.15) direction = 'bullish';
  else if (bearish > bullish * 1.15) direction = 'bearish';
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

// ── Alpha Vantage individual indicator fetchers (works for both crypto & equity) ──
// Crypto: symbol like BTCUSD;  Equity: symbol like AAPL
async function fetchAVIndicators(
  symbol: string,
  timeframe: string,
  assetType: 'crypto' | 'equity' = 'crypto'
): Promise<Partial<Indicators> | null> {
  if (!ALPHA_KEY) return null;
  const avInterval = AV_INTERVAL_MAP[timeframe] || 'daily';
  const avSym = assetType === 'crypto' ? `${symbol.toUpperCase()}USD` : symbol.toUpperCase();

  const safeFetch = async (url: string, label: string): Promise<any> => {
    try {
      await avTakeToken();
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const j = await res.json();
      if (j.Note || j.Information || j['Error Message']) {
        console.warn(`[bulk-scan/AV] ${label} rate-limited or error for ${avSym}`);
        return null;
      }
      return j;
    } catch (err: any) {
      console.warn(`[bulk-scan/AV] ${label} fetch error for ${avSym}:`, err.message);
      return null;
    }
  };

  // Fire 7 AV calls in parallel: RSI, ADX, ATR, MACD, STOCH, CCI, MFI
  const [rsiJ, adxJ, atrJ, macdJ, stochJ, cciJ, mfiJ] = await Promise.all([
    safeFetch(
      `https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(avSym)}&interval=${avInterval}&time_period=14&series_type=close&entitlement=realtime&apikey=${ALPHA_KEY}`,
      'RSI'
    ),
    safeFetch(
      `https://www.alphavantage.co/query?function=ADX&symbol=${encodeURIComponent(avSym)}&interval=${avInterval}&time_period=14&entitlement=realtime&apikey=${ALPHA_KEY}`,
      'ADX'
    ),
    safeFetch(
      `https://www.alphavantage.co/query?function=ATR&symbol=${encodeURIComponent(avSym)}&interval=${avInterval}&time_period=14&entitlement=realtime&apikey=${ALPHA_KEY}`,
      'ATR'
    ),
    safeFetch(
      `https://www.alphavantage.co/query?function=MACD&symbol=${encodeURIComponent(avSym)}&interval=${avInterval}&series_type=close&entitlement=realtime&apikey=${ALPHA_KEY}`,
      'MACD'
    ),
    safeFetch(
      `https://www.alphavantage.co/query?function=STOCH&symbol=${encodeURIComponent(avSym)}&interval=${avInterval}&entitlement=realtime&apikey=${ALPHA_KEY}`,
      'STOCH'
    ),
    safeFetch(
      `https://www.alphavantage.co/query?function=CCI&symbol=${encodeURIComponent(avSym)}&interval=${avInterval}&time_period=20&entitlement=realtime&apikey=${ALPHA_KEY}`,
      'CCI'
    ),
    safeFetch(
      `https://www.alphavantage.co/query?function=MFI&symbol=${encodeURIComponent(avSym)}&interval=${avInterval}&time_period=14&entitlement=realtime&apikey=${ALPHA_KEY}`,
      'MFI'
    ),
  ]);

  const result: Partial<Indicators> = {};
  let anyValid = false;

  // Parse RSI
  const rsiTA = rsiJ?.["Technical Analysis: RSI"];
  if (rsiTA) {
    const first = Object.values(rsiTA)[0] as any;
    if (first?.RSI) { result.rsi = Number(first.RSI); anyValid = true; }
  }

  // Parse ADX
  const adxTA = adxJ?.["Technical Analysis: ADX"];
  if (adxTA) {
    const first = Object.values(adxTA)[0] as any;
    if (first?.ADX) { result.adx = Number(first.ADX); anyValid = true; }
  }

  // Parse ATR
  const atrTA = atrJ?.["Technical Analysis: ATR"];
  if (atrTA) {
    const first = Object.values(atrTA)[0] as any;
    if (first?.ATR) { result.atr = Number(first.ATR); anyValid = true; }
  }

  // Parse MACD
  const macdTA = macdJ?.["Technical Analysis: MACD"];
  if (macdTA) {
    const first = Object.values(macdTA)[0] as any;
    if (first?.MACD) {
      result.macd = Number(first.MACD);
      result.macdSignal = Number(first.MACD_Signal);
      anyValid = true;
    }
  }

  // Parse STOCH
  const stochTA = stochJ?.["Technical Analysis: STOCH"];
  if (stochTA) {
    const first = Object.values(stochTA)[0] as any;
    if (first?.SlowK) { result.stochK = Number(first.SlowK); anyValid = true; }
  }

  // Parse CCI
  const cciTA = cciJ?.["Technical Analysis: CCI"];
  if (cciTA) {
    const first = Object.values(cciTA)[0] as any;
    if (first?.CCI) { result.cci = Number(first.CCI); anyValid = true; }
  }

  // Parse MFI
  const mfiTA = mfiJ?.["Technical Analysis: MFI"];
  if (mfiTA) {
    const first = Object.values(mfiTA)[0] as any;
    if (first?.MFI) { result.mfi = Number(first.MFI); anyValid = true; }
  }

  if (!anyValid) return null;
  console.log(`[bulk-scan/AV] Got indicators for ${avSym}: RSI=${result.rsi}, ADX=${result.adx}, ATR=${result.atr}, MACD=${result.macd}, Stoch=${result.stochK}, CCI=${result.cci}, MFI=${result.mfi}`);
  return result;
}

// Convenience wrapper for crypto (backward compat)
async function fetchAVCryptoIndicators(symbol: string, timeframe: string) {
  return fetchAVIndicators(symbol, timeframe, 'crypto');
}

// Fetch crypto OHLCV data from CoinGecko (Commercial licensed - 500 calls/min)
async function fetchCoinGeckoData(symbol: string, timeframe: string = '1d'): Promise<OHLCV[] | null> {
  try {
    // Skip stablecoins
    if (STABLECOINS.has(symbol.toUpperCase())) return null;
    
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
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${ALPHA_KEY}`;
      tsKey = 'Time Series (Daily)';
    } else {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=compact&entitlement=realtime&apikey=${ALPHA_KEY}`;
      tsKey = `Time Series (${interval})`;
    }
    
    const res = await (async () => { await avTakeToken(); return fetch(url, { cache: 'no-store' }); })();
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
  
  // Get volume from last OHLCV bar
  const lastVolume = ohlcv[ohlcv.length - 1]?.volume;

  // Compute MFI, OBV, VWAP from candle data (requires volume > 0)
  const highs = ohlcv.map(d => d.high);
  const lows = ohlcv.map(d => d.low);
  const volumes = ohlcv.map(d => d.volume);
  const hasVolume = volumes.some(v => v > 0);

  let mfiValue: number | undefined;
  let obvValue: number | undefined;
  let vwapValue: number | undefined;

  if (hasVolume) {
    // MFI (Money Flow Index) — period 14
    const mfiPeriod = 14;
    if (ohlcv.length > mfiPeriod) {
      const tp = ohlcv.map(d => (d.high + d.low + d.close) / 3);
      let posFlow = 0, negFlow = 0;
      for (let j = ohlcv.length - mfiPeriod; j < ohlcv.length; j++) {
        const flow = tp[j] * volumes[j];
        if (j > 0 && tp[j] > tp[j - 1]) posFlow += flow;
        else negFlow += flow;
      }
      mfiValue = negFlow > 0 ? 100 - (100 / (1 + posFlow / negFlow)) : 100;
    }

    // OBV (On-Balance Volume)
    let obv = 0;
    for (let j = 1; j < closes.length; j++) {
      if (closes[j] > closes[j - 1]) obv += volumes[j];
      else if (closes[j] < closes[j - 1]) obv -= volumes[j];
    }
    obvValue = obv;

    // VWAP
    let cumTPV = 0, cumVol = 0;
    for (let j = 0; j < ohlcv.length; j++) {
      const tp = (highs[j] + lows[j] + closes[j]) / 3;
      cumTPV += tp * volumes[j];
      cumVol += volumes[j];
    }
    vwapValue = cumVol > 0 ? cumTPV / cumVol : undefined;
  }

  // ATR (Average True Range)
  const atrValue = atrFn(bars);
  const atrPctValue = atrPctFn(bars);

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
    change24h,
    volume: Number.isFinite(lastVolume) && lastVolume > 0 ? lastVolume : undefined,
    mfi: Number.isFinite(mfiValue) ? Math.round(mfiValue! * 10) / 10 : undefined,
    obv: Number.isFinite(obvValue) ? obvValue : undefined,
    vwap: Number.isFinite(vwapValue) ? Math.round(vwapValue! * 100) / 100 : undefined,
    atr: Number.isFinite(atrValue) ? atrValue! : undefined,
    atr_percent: Number.isFinite(atrPctValue) ? Math.round(atrPctValue! * 100) / 100 : undefined,
  };
  
  const { score, direction, signals } = computeScore(indicators);
  return { symbol, score, direction, signals, indicators, change24h };
}

// =============================================================================
// CRYPTO DERIVATIVES DATA (COINGECKO AGGREGATE: OI, FUNDING, L/S PROXY)
// =============================================================================

interface DerivativesData {
  openInterest: number;        // OI in USD
  openInterestCoin: number;    // OI in native coin
  oiChange24h?: number;        // 24h OI change %
  fundingRate?: number;        // Current funding rate
  longShortRatio?: number;     // L/S ratio
}

type BulkScanMode = 'deep' | 'light' | 'hybrid';

type Permission = 'allowed' | 'watch' | 'blocked';
type DirectionV2 = 'long' | 'short' | 'neutral';

interface InstitutionalPickScoreV2 {
  version: '2.0';
  context: {
    regime: 'trend' | 'range' | 'expansion' | 'contraction' | 'unknown';
    riskMode: 'risk_on' | 'risk_off' | 'neutral';
    biasAllowed: 'long_only' | 'short_only' | 'both' | 'none';
    contextScore: number;
    tags: string[];
  };
  setup: {
    direction: DirectionV2;
    tfAlignment: 0 | 1 | 2 | 3 | 4;
    alignmentFlags: {
      trendAligned: boolean;
      momentumAligned: boolean;
      flowAligned: boolean;
      directional: boolean;
    };
    subscores: {
      structure: number;
      momentum: number;
      flow: number;
      volatility: number;
    };
    setupScore: number;
    notes: string[];
  };
  execution: {
    permission: Permission;
    executionScore: number;
    blockReasons: Array<
      | 'direction_neutral'
      | 'tf_alignment_low'
      | 'quality_below_threshold'
      | 'risk_mode_block'
      | 'volatility_unfavorable'
      | 'liquidity_unfavorable'
      | 'no_trigger'
      | 'data_integrity_low'
    >;
  };
  final: {
    confidence: number;
    qualityTier: 'high' | 'medium' | 'low';
    rankScore: number;
  };
  meta?: {
    mode: 'deep' | 'light';
    engine: 'deepScoreV2' | 'lightCryptoV2' | 'lightEquityV2';
    computedAt: string;
  };
}

const STABLECOINS = new Set([
  // USD-pegged
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FRAX', 'LUSD',
  'FDUSD', 'PYUSD', 'USDD', 'USDE', 'USDS', 'USD1', 'CRVUSD', 'GHO',
  'MIM', 'RAI', 'SUSD', 'DOLA', 'HAY', 'USDX', 'ZUSD', 'HUSD', 'ALUSD',
  'CUSD', 'USDJ', 'UST', 'USDB', 'USDZ', 'USDK', 'TRIBE', 'FEI',
  'UXDUSDC', 'FLEXUSD', 'MIMATIC', 'USDN', 'USDFL',
  // EUR-pegged
  'EURC', 'EURS', 'EURT', 'EUROC', 'AGEUR',
  // Wrapped / bridged stablecoin variants
  'USDC.E', 'USDCE', 'USDT.E', 'USDTE',
  // Gold-pegged (no directional signals)
  'XAUT', 'PAXG'
]);
const LIGHT_SCAN_PER_PAGE = 250;
const LIGHT_SCAN_MAX_API_CALLS = Math.max(1, Number(process.env.SCANNER_LIGHT_MAX_CG_CALLS || 30));
const LIGHT_EQUITY_MAX_API_CALLS = Math.max(2, Number(process.env.SCANNER_LIGHT_MAX_AV_CALLS || 8));

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function toDirectionV2(direction: string | undefined): DirectionV2 {
  if (direction === 'bullish') return 'long';
  if (direction === 'bearish') return 'short';
  return 'neutral';
}

function deriveRegime(adxValue?: number, atrPercent?: number): InstitutionalPickScoreV2['context']['regime'] {
  if (Number.isFinite(atrPercent) && (atrPercent as number) >= 5) return 'expansion';
  if (Number.isFinite(atrPercent) && (atrPercent as number) <= 0.8) return 'contraction';
  if (Number.isFinite(adxValue) && (adxValue as number) >= 28) return 'trend';
  if (Number.isFinite(adxValue) && (adxValue as number) < 20) return 'range';
  return 'unknown';
}

function deriveRiskMode(atrPercent?: number, momentumAbs?: number): InstitutionalPickScoreV2['context']['riskMode'] {
  if ((Number.isFinite(atrPercent) && (atrPercent as number) >= 6) || (Number.isFinite(momentumAbs) && (momentumAbs as number) >= 8)) {
    return 'risk_off';
  }
  if ((Number.isFinite(atrPercent) && (atrPercent as number) <= 3) && (Number.isFinite(momentumAbs) && (momentumAbs as number) >= 1)) {
    return 'risk_on';
  }
  return 'neutral';
}

function buildInstitutionalPickScoreV2(
  pick: any,
  params: {
    type: 'equity' | 'crypto';
    timeframe: string;
    mode: BulkScanMode;
    engine: 'deepScoreV2' | 'lightCryptoV2' | 'lightEquityV2';
  }
): InstitutionalPickScoreV2 {
  const direction = toDirectionV2(pick?.direction);
  const directional = direction !== 'neutral';

  const indicators = pick?.indicators || {};
  const price = Number(indicators?.price);
  const ema200 = Number(indicators?.ema200);
  const rsiValue = Number(indicators?.rsi);
  const macdValue = Number(indicators?.macd);
  const macdSignal = Number(indicators?.macdSignal);
  const adxValue = Number(indicators?.adx);
  const atrValue = Number(indicators?.atr);
  const change24h = Number(pick?.change24h ?? indicators?.change24h ?? 0);
  const volume = Number(indicators?.volume);

  const atrPercent = Number.isFinite(atrValue) && Number.isFinite(price) && price > 0
    ? (atrValue / price) * 100
    : undefined;

  const trendAligned = Number.isFinite(price) && Number.isFinite(ema200)
    ? (direction === 'long' ? price > ema200 : direction === 'short' ? price < ema200 : false)
    : false;

  const momentumAligned = Number.isFinite(rsiValue) && Number.isFinite(macdValue)
    ? (direction === 'long'
      ? rsiValue >= 50 && macdValue >= (Number.isFinite(macdSignal) ? macdSignal : 0)
      : direction === 'short'
      ? rsiValue <= 50 && macdValue <= (Number.isFinite(macdSignal) ? macdSignal : 0)
      : false)
    : (direction === 'long' ? change24h > 0 : direction === 'short' ? change24h < 0 : false);

  const bullishSignals = Number(pick?.signals?.bullish || 0);
  const bearishSignals = Number(pick?.signals?.bearish || 0);
  const neutralSignals = Number(pick?.signals?.neutral || 0);
  const signalTotal = bullishSignals + bearishSignals + neutralSignals;
  const flowAligned = direction === 'long'
    ? bullishSignals > bearishSignals
    : direction === 'short'
    ? bearishSignals > bullishSignals
    : false;

  const tfAlignmentRaw = [trendAligned, momentumAligned, flowAligned, directional].filter(Boolean).length;
  const tfAlignment = clamp(tfAlignmentRaw, 0, 4) as 0 | 1 | 2 | 3 | 4;

  const alignmentScore = (tfAlignment / 4) * 100;

  const structureScore = Number.isFinite(adxValue)
    ? clamp((adxValue / 45) * 100, 0, 100)
    : clamp(40 + (directional ? 15 : 0) + (Math.abs(change24h) > 1 ? 15 : 0), 0, 100);

  const momentumScore = Number.isFinite(rsiValue)
    ? clamp(
        direction === 'long'
          ? ((rsiValue - 35) / 35) * 100
          : direction === 'short'
          ? ((65 - rsiValue) / 35) * 100
          : 45,
        0,
        100,
      )
    : clamp(50 + (direction === 'long' ? change24h * 4 : direction === 'short' ? -change24h * 4 : 0), 0, 100);

  const flowScore = signalTotal > 0
    ? clamp(
        direction === 'long'
          ? (bullishSignals / signalTotal) * 100
          : direction === 'short'
          ? (bearishSignals / signalTotal) * 100
          : (neutralSignals / signalTotal) * 100,
        0,
        100,
      )
    : 50;

  const volatilityScore = Number.isFinite(atrPercent)
    ? clamp(100 - (Math.abs((atrPercent as number) - 2.5) * 22), 0, 100)
    : 55;

  const setupScoreRaw =
    0.4 * alignmentScore +
    0.3 * structureScore +
    0.15 * momentumScore +
    0.15 * flowScore;
  const setupScore = clamp(setupScoreRaw, 0, 100);

  const regime = deriveRegime(Number.isFinite(adxValue) ? adxValue : undefined, atrPercent);
  const riskMode = deriveRiskMode(atrPercent, Math.abs(change24h));

  const biasAllowed: InstitutionalPickScoreV2['context']['biasAllowed'] = !directional
    ? 'none'
    : riskMode === 'risk_off'
    ? 'none'
    : direction === 'long'
    ? 'long_only'
    : 'short_only';

  const liquidityScore = Number.isFinite(volume) && volume > 0
    ? clamp((Math.log10(volume + 1) / 9) * 100, 0, 100)
    : params.type === 'crypto'
    ? 60
    : 50;
  const contextScore = clamp((structureScore * 0.4) + (volatilityScore * 0.25) + (liquidityScore * 0.35), 0, 100);

  const tags: string[] = [];
  if (contextScore >= 70) tags.push('breadth_strong');
  if (volatilityScore >= 55) tags.push('vol_controlled');
  if (liquidityScore >= 55) tags.push('liquidity_normal');
  if (tags.length === 0) tags.push('mixed_context');

  const notes: string[] = [];
  if (!Number.isFinite(rsiValue) || !Number.isFinite(macdValue)) notes.push('momentum_proxy_used');
  if (!Number.isFinite(adxValue)) notes.push('structure_proxy_used');
  if (!Number.isFinite(atrPercent)) notes.push('volatility_proxy_used');

  const blockReasons: InstitutionalPickScoreV2['execution']['blockReasons'] = [];
  if (!directional) blockReasons.push('direction_neutral');
  if (tfAlignment <= 2) blockReasons.push('tf_alignment_low');
  if (setupScore < 55) blockReasons.push('quality_below_threshold');
  if (biasAllowed === 'none') blockReasons.push('risk_mode_block');
  if (volatilityScore < 35) blockReasons.push('volatility_unfavorable');
  if (liquidityScore < 30) blockReasons.push('liquidity_unfavorable');
  if (setupScore < 60 && directional) blockReasons.push('no_trigger');
  if (notes.length >= 2) blockReasons.push('data_integrity_low');

  const uniqueBlockReasons = Array.from(new Set(blockReasons));
  const permission: Permission = uniqueBlockReasons.length >= 2
    ? 'blocked'
    : uniqueBlockReasons.length === 1
    ? 'watch'
    : 'allowed';

  const executionScoreBase =
    (setupScore * 0.5) +
    (volatilityScore * 0.25) +
    (contextScore * 0.25);
  const executionScorePenalty = uniqueBlockReasons.length * 12;
  const executionScore = clamp(executionScoreBase - executionScorePenalty, 0, 100);

  let confidence =
    (0.55 * setupScore) +
    (0.25 * contextScore) +
    (0.20 * executionScore);

  if (permission === 'watch') confidence = Math.min(confidence, 69);
  if (permission === 'blocked') confidence = Math.min(confidence, 54);
  confidence = clampInt(confidence, 1, 99);

  const qualityTier: 'high' | 'medium' | 'low' = permission !== 'allowed'
    ? 'low'
    : (setupScore >= 75 && tfAlignment >= 3)
    ? 'high'
    : setupScore >= 55
    ? 'medium'
    : 'low';

  const rankScore = clampInt((0.70 * confidence) + (0.30 * contextScore), 0, 100);

  return {
    version: '2.0',
    context: {
      regime,
      riskMode,
      biasAllowed,
      contextScore: clampInt(contextScore, 0, 100),
      tags,
    },
    setup: {
      direction,
      tfAlignment,
      alignmentFlags: {
        trendAligned,
        momentumAligned,
        flowAligned,
        directional,
      },
      subscores: {
        structure: clampInt(structureScore, 0, 100),
        momentum: clampInt(momentumScore, 0, 100),
        flow: clampInt(flowScore, 0, 100),
        volatility: clampInt(volatilityScore, 0, 100),
      },
      setupScore: clampInt(setupScore, 0, 100),
      notes,
    },
    execution: {
      permission,
      executionScore: clampInt(executionScore, 0, 100),
      blockReasons: uniqueBlockReasons,
    },
    final: {
      confidence,
      qualityTier,
      rankScore,
    },
    meta: {
      mode: params.mode === 'deep' ? 'deep' : 'light',
      engine: params.engine,
      computedAt: new Date().toISOString(),
    },
  };
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
  indicators: { price: number; volume?: number };
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
    indicators: { price, volume: Number.isFinite(volume) && volume > 0 ? volume : undefined }
  };
}

// ── Shared enrichment helpers for crypto picks ──────────────────────────────

/** Classify strategy label from indicator values */
function classifyStrategy(ind: Indicators, direction: string): string {
  const rsiVal = Number(ind.rsi);
  const adxVal = Number(ind.adx);
  const macdVal = Number(ind.macd);
  const macdSig = Number(ind.macdSignal);
  const arUp = Number(ind.aroonUp);
  const arDn = Number(ind.aroonDown);
  const stochK = Number(ind.stochK);
  const ema200 = Number(ind.ema200);
  const price = ind.price;

  if (adxVal > 25 && Math.abs(arUp - arDn) > 30) {
    return price > ema200 ? 'TREND_PULLBACK' : 'BREAKOUT_CONTINUATION';
  }
  if (rsiVal < 30 || rsiVal > 70) return 'MEAN_REVERSION';
  if (adxVal < 20 && stochK > 20 && stochK < 80) return 'RANGE_FADE';
  if (Math.sign(macdVal - macdSig) !== Math.sign(direction === 'bearish' ? -1 : 1)) {
    return 'MOMENTUM_REVERSAL';
  }
  return 'MOMENTUM_REVERSAL';
}

/** Compute entry / stop / target from ATR and direction */
function computeTradeParams(price: number, atrVal: number | undefined, direction: string) {
  const atrSafe = Number.isFinite(atrVal) && atrVal! > 0 ? atrVal! : price * 0.02;
  const dirLabel = direction === 'bearish' ? 'SHORT' : 'LONG';
  const entry = price;
  const stop = dirLabel === 'LONG' ? price - atrSafe * 1.5 : price + atrSafe * 1.5;
  const target = dirLabel === 'LONG' ? price + atrSafe * 3 : price - atrSafe * 3;
  const risk = Math.abs(entry - stop);
  const rMultiple = risk > 0 ? Math.round((Math.abs(target - entry) / risk) * 10) / 10 : 0;
  return { entry, stop: Math.max(0, stop), target: Math.max(0, target), rMultiple };
}

/** Enrich a crypto pick with full CoinGecko OHLC-derived indicators */
function enrichCryptoPick(pick: any, enriched: any): any {
  const ind = enriched.indicators as Indicators;
  const setup = classifyStrategy(ind, enriched.direction);
  const trade = computeTradeParams(ind.price, ind.atr, enriched.direction);

  return {
    ...pick,
    score: enriched.score,
    direction: enriched.direction,
    signals: enriched.signals,
    change24h: enriched.change24h,
    indicators: {
      ...enriched.indicators,
      volume: pick.indicators.volume ?? enriched.indicators.volume,
    },
    setup,
    ...trade,
  };
}

/** Enrich a crypto pick with Alpha Vantage individual indicator values (fallback) */
function enrichCryptoPickFromAV(pick: any, avInd: Partial<Indicators>): any {
  const price = pick.indicators.price ?? 0;
  const merged: Indicators = {
    price,
    ...avInd,
    volume: pick.indicators.volume,
  };
  const direction = (avInd.rsi && avInd.rsi < 40) ? 'bearish'
    : (avInd.rsi && avInd.rsi > 60) ? 'bullish'
    : pick.direction;
  const setup = classifyStrategy(merged, direction);
  const trade = computeTradeParams(price, avInd.atr, direction);

  // Re-score based on available AV indicators
  let score = pick.score;
  if (Number.isFinite(avInd.rsi)) {
    const rsiDist = Math.abs((avInd.rsi ?? 50) - 50);
    score = Math.round(clamp(50 + (direction === 'bullish' ? rsiDist : -rsiDist), 5, 95));
  }

  return {
    ...pick,
    score,
    direction,
    indicators: merged,
    setup,
    ...trade,
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
    if (!symbol || STABLECOINS.has(symbol)) continue;
    if (!dedupedBySymbol.has(symbol)) {
      dedupedBySymbol.set(symbol, coin);
    }
  }

  const ranked = Array.from(dedupedBySymbol.values())
    .map((coin) => scoreLightCryptoCandidate(coin, timeframe))
    .filter((item): item is NonNullable<ReturnType<typeof scoreLightCryptoCandidate>> => item !== null)
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

  // ── Enrichment phase: fetch OHLC + compute real indicators for top 10 ──
  // The light scan uses market-data only (price change, volume, market cap)
  // which produces identical "—" columns for RSI/ADX/ATR/etc.  Enrichment
  // fills in real indicators via CoinGecko OHLC first, then AV fallback.
  const top10 = ranked.slice(0, 10);
  const ENRICH_BATCH = 5;
  const ENRICH_DELAY = 200;
  const enrichedPicks: any[] = [];

  for (let i = 0; i < top10.length; i += ENRICH_BATCH) {
    if (Date.now() - startTime > 50000) {
      console.log('[bulk-scan/light] Enrichment time limit — returning remaining picks un-enriched');
      enrichedPicks.push(...top10.slice(i));
      break;
    }
    const batch = top10.slice(i, i + ENRICH_BATCH);
    const batchResults = await Promise.all(batch.map(async (pick) => {
      try {
        // ── Strategy 1: CoinGecko OHLC → full local indicator computation ──
        const ohlcv = await fetchCoinGeckoData(pick.symbol, timeframe);
        if (ohlcv && ohlcv.length >= 20) {
          apiCallsUsed += 1;
          const enriched = analyzeAssetByTimeframe(pick.symbol, ohlcv, timeframe);
          if (enriched) {
            const result = enrichCryptoPick(pick, enriched);
            // CoinGecko OHLC has no volume data → MFI/OBV/VWAP are empty.
            // Supplement with AV MFI call to fill the gap.
            if (!result.indicators?.mfi) {
              try {
                const avInd = await fetchAVCryptoIndicators(pick.symbol, timeframe);
                if (avInd) {
                  apiCallsUsed += 7;
                  if (Number.isFinite(avInd.mfi)) result.indicators.mfi = avInd.mfi;
                  // Also grab OBV proxy: not available from AV, but MACD/Stoch may be
                  // more accurate from AV than local CG computation. Leave existing values.
                }
              } catch { /* non-critical — CG indicators already populated */ }
            }
            return result;
          }
        }

        // ── Strategy 2: Alpha Vantage individual indicators (fallback) ──
        console.log(`[bulk-scan/light] CoinGecko OHLC unavailable for ${pick.symbol}, trying AV fallback`);
        const avInd = await fetchAVCryptoIndicators(pick.symbol, timeframe);
        if (avInd) {
          apiCallsUsed += 7; // 7 parallel AV calls
          return enrichCryptoPickFromAV(pick, avInd);
        }

        // No enrichment available — keep original light-scored pick
        return pick;
      } catch (err: any) {
        console.warn(`[bulk-scan/light] Enrichment failed for ${pick.symbol}:`, err.message);
        return pick;
      }
    }));
    enrichedPicks.push(...batchResults);
    if (i + ENRICH_BATCH < top10.length) {
      await new Promise(r => setTimeout(r, ENRICH_DELAY));
    }
  }

  return {
    scanned: ranked.length,
    topPicks: enrichedPicks,
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
    await avTakeToken();
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
  let bulkUnavailable = false;

  for (let index = 0; index < symbols.length; index += batchSize) {
    if (apiCallsUsed >= maxApiCalls) break;
    const batch = symbols.slice(index, index + batchSize);
    const symbolList = batch.join(',');
    const url = `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(symbolList)}&entitlement=realtime&apikey=${ALPHA_KEY}`;

    try {
      await avTakeToken();
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      apiCallsUsed += 1;

      if (data?.Note || data?.Information || data?.['Error Message']) {
        bulkUnavailable = true;
        break;
      }

      const rows = Array.isArray(data?.data) ? data.data : [];
      if (rows.length === 0) {
        bulkUnavailable = true;
        break;
      }

      for (const row of rows) {
        const ticker = normalizeTicker(row?.['01. symbol'] || row?.symbol);
        if (!ticker) continue;
        priceMap.set(ticker, row);
      }
    } catch {
      apiCallsUsed += 1;
      bulkUnavailable = true;
      break;
    }
  }

  if (priceMap.size === 0 && bulkUnavailable && apiCallsUsed < maxApiCalls) {
    const maxFallbackSymbols = Math.min(symbols.length, 40);
    for (let i = 0; i < maxFallbackSymbols && apiCallsUsed < maxApiCalls; i += 1) {
      const symbol = symbols[i];
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&entitlement=realtime&apikey=${ALPHA_KEY}`;
      try {
        const response = await fetch(url, { cache: 'no-store' });
        const data = await response.json();
        apiCallsUsed += 1;

        if (data?.Note || data?.Information || data?.['Error Message']) {
          continue;
        }

        const quote = data?.['Global Quote'];
        const ticker = normalizeTicker(quote?.['01. symbol'] || symbol);
        if (!ticker) continue;
        if (quote && Object.keys(quote).length > 0) {
          priceMap.set(ticker, quote);
        }
      } catch {
        apiCallsUsed += 1;
      }
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
  indicators: { price: number; volume?: number };
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
    indicators: { price, volume: Number.isFinite(volume) && volume > 0 ? volume : undefined },
  };
}

// ─── Cache-first equity scan ─────────────────────────────────────────────────
// Uses the worker-populated quotes_latest + indicators_latest tables.
// Zero AV API calls — reads pre-cached data with full 9-signal scoring.
// Falls back to light (AV bulk quotes) if cache has < 10 symbols.
// ─────────────────────────────────────────────────────────────────────────────
function computeFullScore(data: CachedScanData): {
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signals: { bullish: number; bearish: number; neutral: number };
  indicators: Partial<Indicators>;
} {
  const { price, rsi: rsiVal, macdLine, macdSignal, macdHist, ema200, atr, adx: adxVal, stochK, cci: cciVal } = data;
  let bullish = 0, bearish = 0, neutral = 0;

  // ADX trend multiplier (same logic as /api/scanner/run)
  let tm = 1.0;
  if (Number.isFinite(adxVal)) {
    if (adxVal >= 40) tm = 1.4;
    else if (adxVal >= 25) tm = 1.25;
    else if (adxVal >= 20) tm = 1.0;
    else tm = 0.7;
  }

  // 1. EMA200 trend (weight 2 × tm)
  if (Number.isFinite(ema200) && Number.isFinite(price)) {
    const w = 2 * tm;
    if (price > ema200 * 1.01) bullish += w;
    else if (price < ema200 * 0.99) bearish += w;
    else neutral += 1;
  }
  // 2. MACD histogram (weight 1 × tm)
  if (Number.isFinite(macdHist)) {
    const w = 1 * tm;
    if (macdHist > 0) bullish += w; else bearish += w;
  }
  // 3. MACD vs signal (weight 1 × tm)
  if (Number.isFinite(macdLine) && Number.isFinite(macdSignal)) {
    const w = 1 * tm;
    if (macdLine > macdSignal) bullish += w; else bearish += w;
  }
  // 4. Aroon (from cache — may be NaN)
  if (Number.isFinite(data.aroonUp) && Number.isFinite(data.aroonDown)) {
    const w = 1 * tm;
    if (data.aroonUp > data.aroonDown && data.aroonUp > 70) bullish += w;
    else if (data.aroonDown > data.aroonUp && data.aroonDown > 70) bearish += w;
    else neutral += 0.5;
  }
  // 5. RSI
  if (Number.isFinite(rsiVal)) {
    if (rsiVal >= 55 && rsiVal <= 70) bullish += 1;
    else if (rsiVal > 70) bearish += 1;
    else if (rsiVal <= 45 && rsiVal >= 30) bearish += 1;
    else if (rsiVal < 30) bullish += 1;
    else neutral += 1;
  }
  // 6. Stochastic
  if (Number.isFinite(stochK)) {
    if (stochK > 80) bearish += 1;
    else if (stochK < 20) bullish += 1;
    else if (stochK >= 50) bullish += 0.5;
    else bearish += 0.5;
  }
  // 7. CCI
  if (Number.isFinite(cciVal)) {
    if (cciVal > 100) bullish += 1;
    else if (cciVal > 0) bullish += 0.5;
    else if (cciVal < -100) bearish += 1;
    else bearish += 0.5;
  }
  // 8. ATR volatility caution
  const atrPercent = Number.isFinite(atr) && Number.isFinite(price) && price > 0 ? (atr / price) * 100 : 0;
  if (atrPercent > 5) neutral += 1;

  const total = bullish + bearish + neutral;
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bullish > bearish * 1.15) direction = 'bullish';
  else if (bearish > bullish * 1.15) direction = 'bearish';

  const diff = bullish - bearish;
  const maxSig = 10 * tm;
  const score = Math.max(0, Math.min(100, Math.round(50 + (diff / maxSig) * 50)));

  return {
    score,
    direction,
    signals: {
      bullish: Math.round(bullish * 10) / 10,
      bearish: Math.round(bearish * 10) / 10,
      neutral: Math.round(neutral * 10) / 10,
    },
    indicators: {
      price: Number.isFinite(price) ? price : undefined,
      rsi: Number.isFinite(rsiVal) ? Math.round(rsiVal * 10) / 10 : undefined,
      adx: Number.isFinite(adxVal) ? Math.round(adxVal * 10) / 10 : undefined,
      atr: Number.isFinite(atr) ? atr : undefined,
      ema200: Number.isFinite(ema200) ? ema200 : undefined,
      macd: Number.isFinite(macdLine) ? macdLine : undefined,
      macdSignal: Number.isFinite(macdSignal) ? macdSignal : undefined,
      stochK: Number.isFinite(stochK) ? stochK : undefined,
      cci: Number.isFinite(cciVal) ? cciVal : undefined,
      aroonUp: Number.isFinite(data.aroonUp) ? data.aroonUp : undefined,
      aroonDown: Number.isFinite(data.aroonDown) ? data.aroonDown : undefined,
      atr_percent: Number.isFinite(atrPercent) ? Math.round(atrPercent * 100) / 100 : (Number.isFinite(data.atrPercent) ? data.atrPercent : undefined),
      volume: Number.isFinite(data.volume) && (data.volume ?? 0) > 0 ? data.volume : undefined,
      obv: data.obv != null && Number.isFinite(data.obv) ? data.obv : undefined,
      vwap: data.vwap != null && Number.isFinite(data.vwap) ? data.vwap : undefined,
      mfi: data.mfi != null && Number.isFinite(data.mfi) ? data.mfi : undefined,
    },
  };
}

async function runCachedEquityScan(startTime: number, timeframe: string, universeSize: number) {
  console.log(`[bulk-scan/cached] Scanning equities from worker cache (0 AV calls)...`);

  // Read pre-cached indicators for the full equity universe
  const symbolsToScan = EQUITY_UNIVERSE.slice(0, Math.max(30, universeSize));
  const cacheMap = await getBulkCachedScanData(symbolsToScan);

  // Also grab AV top movers to enrich bias (1 API call — worth it for fresh context)
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

  // Any top-mover symbols not in EQUITY_UNIVERSE get added
  for (const ticker of moverBiasMap.keys()) {
    if (!symbolsToScan.includes(ticker)) symbolsToScan.push(ticker);
  }

  // If cache didn't have enough data, fall back to light scan
  if (cacheMap.size < 10) {
    console.warn(`[bulk-scan/cached] Only ${cacheMap.size} symbols in cache, falling back to light scan`);
    return null; // Caller will use runLightEquityScan
  }

  // Score every cached symbol with full 9-signal scoring
  const scored: Array<ReturnType<typeof computeFullScore> & { symbol: string; change24h: number }> = [];
  for (const [symbol, cached] of cacheMap.entries()) {
    const result = computeFullScore(cached);
    // Try to get daily change from quotes_latest
    let change24h = 0;
    try {
      const rows = await dbQuery<{ change_percent: string }>(
        `SELECT change_percent FROM quotes_latest WHERE symbol = $1`,
        [symbol]
      );
      if (rows.length > 0) change24h = parseFloat(rows[0].change_percent) || 0;
    } catch { /* non-fatal */ }

    scored.push({ ...result, symbol, change24h });
  }

  // Also score movers that weren't in cache using bulk quotes fallback
  const uncachedMovers = Array.from(moverBiasMap.keys()).filter(t => !cacheMap.has(t));
  if (uncachedMovers.length > 0) {
    const quoteResult = await fetchAlphaBulkQuotes(uncachedMovers, Math.max(0, 3));
    for (const [sym, quote] of quoteResult.priceMap.entries()) {
      const light = scoreLightEquityCandidate(sym, quote, timeframe, moverBiasMap.get(sym) ?? 0);
      if (light) scored.push({ ...light, indicators: { ...light.indicators } });
    }
  }

  // Fetch chartData from ohlcv_bars for each scored result
  for (const item of scored) {
    try {
      const barRows = await dbQuery<{ ts: string; open: number; high: number; low: number; close: number; volume: number }>(
        `SELECT ts, open, high, low, close, volume FROM ohlcv_bars WHERE symbol = $1 AND timeframe = 'daily' ORDER BY ts DESC LIMIT 50`,
        [item.symbol]
      );
      if (barRows && barRows.length > 5) {
        const sorted = [...barRows].reverse();
        const bCloses = sorted.map(r => Number(r.close));
        const bHighs = sorted.map(r => Number(r.high));
        const bLows = sorted.map(r => Number(r.low));
        const bVolumes = sorted.map(r => Number(r.volume));
        const emaArr = (ema(bCloses, 200) ?? []) as number[];
        const rsiArr = (rsi(bCloses, 14) ?? []) as number[];
        // Build MACD arrays for chart (the imported macd() returns a single point, so we compute inline)
        const ema12Arr = (ema(bCloses, 12) ?? []) as number[];
        const ema26Arr = (ema(bCloses, 26) ?? []) as number[];
        const macdLineArr = ema12Arr.map((v: number, i: number) => (Number.isFinite(v) && Number.isFinite(ema26Arr[i])) ? v - ema26Arr[i] : NaN);
        const validMacd = macdLineArr.filter((v: number) => Number.isFinite(v));
        const signalArr = validMacd.length >= 9 ? ((ema(validMacd, 9) ?? []) as number[]) : [] as number[];
        const macdChartArr = macdLineArr.map((m: number, i: number) => {
          const si = i - (macdLineArr.length - (signalArr as number[]).length);
          const sig = si >= 0 && si < (signalArr as number[]).length ? (signalArr as number[])[si] : NaN;
          return { macd: m, signal: sig, hist: Number.isFinite(m) && Number.isFinite(sig) ? m - sig : NaN };
        });

        // Compute MFI, OBV, VWAP from OHLCV bars
        const hasBarVolume = bVolumes.some(v => v > 0);
        if (hasBarVolume) {
          // MFI
          const mfiPeriod = 14;
          if (sorted.length > mfiPeriod) {
            const tp = sorted.map(r => (Number(r.high) + Number(r.low) + Number(r.close)) / 3);
            let posFlow = 0, negFlow = 0;
            for (let j = sorted.length - mfiPeriod; j < sorted.length; j++) {
              const flow = tp[j] * bVolumes[j];
              if (j > 0 && tp[j] > tp[j - 1]) posFlow += flow;
              else negFlow += flow;
            }
            (item as any).indicators.mfi = negFlow > 0
              ? Math.round((100 - (100 / (1 + posFlow / negFlow))) * 10) / 10
              : 100;
          }
          // OBV
          let obv = 0;
          for (let j = 1; j < bCloses.length; j++) {
            if (bCloses[j] > bCloses[j - 1]) obv += bVolumes[j];
            else if (bCloses[j] < bCloses[j - 1]) obv -= bVolumes[j];
          }
          (item as any).indicators.obv = obv;
          // VWAP
          let cumTPV = 0, cumVol = 0;
          for (let j = 0; j < sorted.length; j++) {
            const tp = (bHighs[j] + bLows[j] + bCloses[j]) / 3;
            cumTPV += tp * bVolumes[j];
            cumVol += bVolumes[j];
          }
          if (cumVol > 0) (item as any).indicators.vwap = Math.round((cumTPV / cumVol) * 100) / 100;
        }

        (item as any).chartData = {
          candles: sorted.map(r => ({
            t: typeof r.ts === 'string' ? r.ts.slice(0, 10) : new Date(r.ts).toISOString().slice(0, 10),
            o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close),
          })),
          ema200: emaArr,
          rsi: rsiArr,
          macd: macdChartArr,
        };
      }
    } catch { /* non-fatal — chart will fall back on client */ }
  }

  // Rank by conviction strength
  const ranked = scored.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

  return {
    scanned: scored.length,
    topPicks: ranked.slice(0, 10),
    sourceSymbols: symbolsToScan.length,
    apiCallsUsed: moverData.apiCallsUsed,
    apiCallsCap: LIGHT_EQUITY_MAX_API_CALLS,
    effectiveUniverseSize: symbolsToScan.length,
    cacheHitRate: `${cacheMap.size}/${symbolsToScan.length}`,
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
    .sort((left, right) => Math.abs(right.score - 50) - Math.abs(left.score - 50));

  // \u2500\u2500 Enrichment phase: fetch AV indicators for top 10 equity picks \u2500\u2500
  // Light scan only has price/volume. Enrich with RSI, ADX, MACD, Stoch, CCI, MFI, ATR.
  const top10Equity = ranked.slice(0, 10);
  const EQ_ENRICH_BATCH = 3; // Fewer parallel batches for equity (7 AV calls per symbol)
  const EQ_ENRICH_DELAY = 300;
  const enrichedEquity: any[] = [];

  for (let i = 0; i < top10Equity.length; i += EQ_ENRICH_BATCH) {
    if (Date.now() - startTime > 50000) {
      console.log('[bulk-scan/light-eq] Enrichment time limit \u2014 returning remaining picks un-enriched');
      enrichedEquity.push(...top10Equity.slice(i));
      break;
    }
    const batch = top10Equity.slice(i, i + EQ_ENRICH_BATCH);
    const batchResults = await Promise.all(batch.map(async (pick) => {
      try {
        const avInd = await fetchAVIndicators(pick.symbol, timeframe, 'equity');
        if (!avInd) return pick;

        const price = pick.indicators.price ?? 0;
        const merged: Indicators = { price, ...avInd, volume: pick.indicators.volume };
        const direction = (avInd.rsi && avInd.rsi < 40) ? 'bearish'
          : (avInd.rsi && avInd.rsi > 60) ? 'bullish'
          : pick.direction;
        const setup = classifyStrategy(merged, direction);
        const trade = computeTradeParams(price, avInd.atr, direction);

        // Compute ATR%
        if (Number.isFinite(avInd.atr) && price > 0) {
          merged.atr_percent = Math.round(((avInd.atr! / price) * 100) * 100) / 100;
        }

        return { ...pick, direction, indicators: merged, setup, ...trade };
      } catch (err: any) {
        console.warn(`[bulk-scan/light-eq] Enrichment failed for ${pick.symbol}:`, err.message);
        return pick;
      }
    }));
    enrichedEquity.push(...batchResults);
    if (i + EQ_ENRICH_BATCH < top10Equity.length) {
      await new Promise(r => setTimeout(r, EQ_ENRICH_DELAY));
    }
  }

  return {
    scanned: ranked.length,
    topPicks: enrichedEquity,
    sourceSymbols: candidates.length,
    apiCallsUsed: moverData.apiCallsUsed + quoteResult.apiCallsUsed,
    apiCallsCap: LIGHT_EQUITY_MAX_API_CALLS,
    effectiveUniverseSize: candidates.length,
  };
}

function applyInstitutionalFilterToTopPicks(
  topPicks: any[],
  params: {
    type: 'equity' | 'crypto';
    timeframe: string;
    mode: BulkScanMode;
    traderRiskDNA?: 'aggressive' | 'balanced' | 'defensive';
  }
) {
  const withFilter = topPicks.map((pick) => {
    const scoreV2 = buildInstitutionalPickScoreV2(pick, {
      type: params.type,
      timeframe: params.timeframe,
      mode: params.mode,
      engine: params.mode === 'deep'
        ? 'deepScoreV2'
        : params.type === 'crypto'
        ? 'lightCryptoV2'
        : 'lightEquityV2',
    });

    const atrPercent = Number.isFinite(pick?.indicators?.atr) && Number.isFinite(pick?.indicators?.price) && pick.indicators.price > 0
      ? (pick.indicators.atr / pick.indicators.price) * 100
      : undefined;

    const neutralSignals = Number(pick?.signals?.neutral || 0);
    const bullishSignals = Number(pick?.signals?.bullish || 0);
    const bearishSignals = Number(pick?.signals?.bearish || 0);
    const regime = neutralSignals >= Math.max(bullishSignals, bearishSignals)
      ? 'ranging'
      : (pick?.score ?? 0) >= 70
        ? 'trending'
        : 'unknown';

    const institutionalFilter = computeInstitutionalFilter({
      baseScore: Number(scoreV2.final.confidence),
      strategy: inferStrategyFromText(`${params.type} ${pick?.direction || 'neutral'} ${params.timeframe}`),
      regime,
      liquidity: {
        session: 'regular',
      },
      volatility: {
        atrPercent,
        state: typeof atrPercent === 'number'
          ? (atrPercent > 7 ? 'extreme' : atrPercent > 4 ? 'expanded' : atrPercent < 1 ? 'compressed' : 'normal')
          : 'normal',
      },
      dataHealth: {
        freshness: params.type === 'crypto' ? 'LIVE' : 'DELAYED',
      },
      riskEnvironment: {
        traderRiskDNA: params.traderRiskDNA,
        stressLevel: typeof atrPercent === 'number' && atrPercent > 6 ? 'high' : 'medium',
      },
    });

    // ------- Universal entry/stop/target enrichment -------
    // If the pick doesn't already have trade parameters, derive them from ATR + direction
    const pickPrice = Number(pick?.indicators?.price ?? pick?.price ?? 0);
    const pickAtr   = Number(pick?.indicators?.atr ?? 0);
    const pickDir   = pick?.direction === 'bearish' ? 'bearish' : pick?.direction === 'bullish' ? 'bullish' : 'neutral';
    const hasEntry  = Number.isFinite(pick?.entry) && (pick?.entry ?? 0) > 0;

    let enrichedEntry  = pick?.entry;
    let enrichedStop   = pick?.stop;
    let enrichedTarget = pick?.target;
    let enrichedRMultiple = pick?.rMultiple;
    let enrichedSetup  = pick?.setup;
    let enrichedConfidence = pick?.confidence;

    if (!hasEntry && pickPrice > 0) {
      const atrSafe = Number.isFinite(pickAtr) && pickAtr > 0
        ? pickAtr
        : pickPrice * 0.02; // fallback 2% of price
      if (pickDir === 'bullish') {
        enrichedEntry  = Math.round(pickPrice * 100) / 100;
        enrichedStop   = Math.round((pickPrice - 1.5 * atrSafe) * 100) / 100;
        enrichedTarget = Math.round((pickPrice + 3 * atrSafe) * 100) / 100;
      } else if (pickDir === 'bearish') {
        enrichedEntry  = Math.round(pickPrice * 100) / 100;
        enrichedStop   = Math.round((pickPrice + 1.5 * atrSafe) * 100) / 100;
        enrichedTarget = Math.round((pickPrice - 3 * atrSafe) * 100) / 100;
      } else {
        // neutral — still provide levels based on range expectation
        enrichedEntry  = Math.round(pickPrice * 100) / 100;
        enrichedStop   = Math.round((pickPrice - 1.0 * atrSafe) * 100) / 100;
        enrichedTarget = Math.round((pickPrice + 1.5 * atrSafe) * 100) / 100;
      }
      const risk = Math.abs(enrichedEntry - enrichedStop);
      const reward = Math.abs(enrichedTarget - enrichedEntry);
      enrichedRMultiple = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
    }

    // Derive a setup label from indicator signature if missing
    if (!enrichedSetup) {
      const adxVal = Number(pick?.indicators?.adx ?? 0);
      const rsiVal = Number(pick?.indicators?.rsi ?? 50);
      const arUp   = Number(pick?.indicators?.aroonUp ?? pick?.indicators?.aroon_up ?? 0);
      const arDn   = Number(pick?.indicators?.aroonDown ?? pick?.indicators?.aroon_down ?? 0);
      if (adxVal >= 25 && (arUp > 70 || arDn > 70)) {
        enrichedSetup = pickDir === 'bullish' ? 'trend_pullback_long' : 'trend_pullback_short';
      } else if (adxVal >= 25 && Math.abs(arUp - arDn) > 40) {
        enrichedSetup = 'breakout';
      } else if (rsiVal > 70 || rsiVal < 30) {
        enrichedSetup = 'mean_reversion';
      } else if (adxVal < 20) {
        enrichedSetup = 'range_fade';
      } else {
        enrichedSetup = 'momentum_reversal';
      }
    }

    if (!Number.isFinite(enrichedConfidence) || enrichedConfidence == null) {
      enrichedConfidence = scoreV2.final.confidence;
    }

    return {
      ...pick,
      scoreV2,
      score: scoreV2.final.confidence,
      institutionalFilter,
      entry: enrichedEntry,
      stop: enrichedStop,
      target: enrichedTarget,
      rMultiple: enrichedRMultiple,
      setup: enrichedSetup,
      confidence: enrichedConfidence,
    };
  });

  // Don't remove results from discovery — tag them with warnings but keep them visible.
  // Users need to SEE what's out there, then the institutional filter badge guides decisions.
  const blockedCount = withFilter.filter((pick) => pick.institutionalFilter.noTrade || pick.scoreV2?.execution?.permission === 'blocked').length;
  const ranked = [...withFilter].sort((a, b) => {
    // Sort trade-ready results first, then by rank score
    const aBlocked = a.institutionalFilter.noTrade || a.scoreV2?.execution?.permission === 'blocked' ? 1 : 0;
    const bBlocked = b.institutionalFilter.noTrade || b.scoreV2?.execution?.permission === 'blocked' ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    const left = Number(a?.scoreV2?.final?.rankScore ?? a?.score ?? 0);
    const right = Number(b?.scoreV2?.final?.rankScore ?? b?.score ?? 0);
    return right - left;
  });
  return {
    topPicks: ranked,
    blockedCount,
  };
}

async function fetchCryptoDerivatives(symbol: string): Promise<DerivativesData | null> {
  try {
    const tickers = await getDerivativesForSymbols([symbol]);
    if (!tickers.length) return null;

    const openInterestUsd = tickers.reduce((sum, t) => sum + (Number(t.open_interest) || 0), 0);
    const avgIndex = tickers.length
      ? tickers.reduce((sum, t) => sum + (Number(t.index) || 0), 0) / tickers.length
      : 0;
    const openInterestCoin = avgIndex > 0 ? openInterestUsd / avgIndex : 0;
    if (!Number.isFinite(openInterestCoin) || openInterestCoin <= 0) return null;

    const fundingRates = tickers
      .map((t) => Number(t.funding_rate))
      .filter((v) => Number.isFinite(v));
    const fundingRate = fundingRates.length
      ? (fundingRates.reduce((sum, v) => sum + v, 0) / fundingRates.length) * 100
      : undefined;

    const longShortRatio = typeof fundingRate === 'number'
      ? Math.max(0.5, Math.min(1.5, 1 + fundingRate / 0.05))
      : undefined;

    return {
      openInterest: openInterestUsd,
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
    const session = await getSessionFromCookie();
    const adaptive = session?.workspaceId
      ? await getAdaptiveLayer(session.workspaceId, { skill: 'scanner' }, 50)
      : null;

    const body = await req.json();
    const { type, timeframe = '1d' } = body; // 'equity' or 'crypto', timeframe: '15m', '30m', '1h', '1d'
    const requestedMode = String(body?.mode || '').toLowerCase();
    const mode: BulkScanMode = requestedMode === 'hybrid'
      ? 'hybrid'
      : requestedMode === 'light'
        ? 'light'
        : 'deep';
    const isLightMode = mode === 'light' || mode === 'hybrid';
    const universeSizeRaw = Number(body?.universeSize ?? body?.maxCoins ?? 0);
    const universeSize = Number.isFinite(universeSizeRaw) && universeSizeRaw > 0
      ? Math.floor(universeSizeRaw)
      : 500;
    
    if (!type || !['equity', 'crypto'].includes(type)) {
      return NextResponse.json({ error: "Type must be 'equity' or 'crypto'" }, { status: 400 });
    }
    
    const validTimeframes = ['15m', '30m', '1h', '1d'];
    const selectedTimeframe = validTimeframes.includes(timeframe) ? timeframe : '1d';

    if (type === 'crypto' && isLightMode) {
      console.log(`[bulk-scan/light] Scanning up to ${universeSize} crypto assets using market-data ranking...`);
      const lightResult = await runLightCryptoScan(universeSize, startTime, selectedTimeframe);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const institutional = applyInstitutionalFilterToTopPicks(lightResult.topPicks, {
        type,
        timeframe: selectedTimeframe,
        mode,
        traderRiskDNA: adaptive?.profile?.riskDNA,
      });

      return NextResponse.json({
        success: true,
        type,
        timeframe: selectedTimeframe,
        mode,
        scanned: lightResult.scanned,
        duration: `${duration}s`,
        topPicks: institutional.topPicks,
        sourceCoinsFetched: lightResult.sourceCoinsFetched,
        blockedByInstitutionalFilter: institutional.blockedCount,
        apiCallsUsed: lightResult.apiCallsUsed,
        apiCallsCap: lightResult.apiCallsCap,
        effectiveUniverseSize: lightResult.effectiveUniverseSize,
        errors: [],
      });
    }

    if (type === 'equity') {
      // Try cache-first scan (reads worker-populated DB, 0–1 AV calls)
      const cachedResult = await runCachedEquityScan(startTime, selectedTimeframe, universeSize);
      const equityResult = cachedResult ?? await runLightEquityScan(startTime, selectedTimeframe, universeSize);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const institutional = applyInstitutionalFilterToTopPicks(equityResult.topPicks, {
        type,
        timeframe: selectedTimeframe,
        mode: cachedResult ? 'deep' : (isLightMode ? 'hybrid' : mode),
        traderRiskDNA: adaptive?.profile?.riskDNA,
      });

      return NextResponse.json({
        success: true,
        type,
        timeframe: selectedTimeframe,
        mode: cachedResult ? 'cached' : (isLightMode ? 'hybrid' : mode),
        scanned: equityResult.scanned,
        duration: `${duration}s`,
        topPicks: institutional.topPicks,
        sourceSymbols: equityResult.sourceSymbols,
        blockedByInstitutionalFilter: institutional.blockedCount,
        apiCallsUsed: equityResult.apiCallsUsed,
        apiCallsCap: equityResult.apiCallsCap,
        effectiveUniverseSize: equityResult.effectiveUniverseSize,
        cacheHitRate: (equityResult as any).cacheHitRate,
        errors: [],
      });
    }
    
    const universe = type === 'equity' ? EQUITY_UNIVERSE : CRYPTO_UNIVERSE;
    const results: any[] = [];
    const errors: string[] = [];
    
    console.log(`[bulk-scan] Scanning ${universe.length} ${type} on ${selectedTimeframe} timeframe...`);
    
    // For crypto, pre-fetch all derivatives data AND market volumes in parallel
    const derivativesMap = new Map<string, DerivativesData>();
    const marketVolumeMap = new Map<string, number>();
    if (type === 'crypto') {
      const [, marketDataPage] = await Promise.all([
        (async () => {
          const derivPromises = CRYPTO_UNIVERSE.map(async (symbol) => {
            const data = await fetchCryptoDerivatives(symbol);
            if (data) derivativesMap.set(symbol, data);
          });
          await Promise.all(derivPromises);
        })(),
        getMarketData({
          order: 'market_cap_desc',
          per_page: 250,
          page: 1,
          sparkline: false,
          price_change_percentage: ['24h'],
        }),
      ]);
      if (marketDataPage && Array.isArray(marketDataPage)) {
        for (const coin of marketDataPage) {
          const sym = String(coin.symbol || '').toUpperCase();
          const vol = Number(coin.total_volume);
          if (sym && Number.isFinite(vol) && vol > 0) marketVolumeMap.set(sym, vol);
        }
      }
      console.log(`[bulk-scan] Fetched derivatives for ${derivativesMap.size} coins, market volumes for ${marketVolumeMap.size} coins`);
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
            // Inject 24h volume from market data (CoinGecko OHLC lacks volume)
            const mktVol = marketVolumeMap.get(id.toUpperCase());
            if (Number.isFinite(mktVol) && mktVol! > 0 && (!result.indicators.volume || result.indicators.volume <= 0)) {
              result.indicators.volume = mktVol;
            }
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
    
    // Sort by conviction strength — distance from 50 — so both bullish AND bearish setups rank high
    const topPicks = results
      .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
      .slice(0, 10);
    const institutional = applyInstitutionalFilterToTopPicks(topPicks, {
      type,
      timeframe: selectedTimeframe,
      mode,
      traderRiskDNA: adaptive?.profile?.riskDNA,
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[bulk-scan] Complete in ${duration}s. Top: ${topPicks.map(p => `${p.symbol}:${p.score}`).join(', ')}`);
    
    return NextResponse.json({
      success: true,
      type,
      timeframe: selectedTimeframe,
      mode,
      scanned: results.length,
      duration: `${duration}s`,
      topPicks: institutional.topPicks,
      blockedByInstitutionalFilter: institutional.blockedCount,
      errors: errors.slice(0, 5)
    });
    
  } catch (error: any) {
    console.error("[bulk-scan] Error:", error);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
