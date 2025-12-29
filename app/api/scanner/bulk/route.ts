/**
 * Bulk Scanner API - Client-triggered universe scan
 * 
 * @route POST /api/scanner/bulk
 * @description Scans top stocks or crypto to find best opportunities
 *              Uses Yahoo Finance for both (free, no API key needed)
 * 
 * No auth required - rate limited by normal request throttling
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds max for client requests

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

// Yahoo Finance crypto symbols (free, no API key, no commercial restrictions)
const CRYPTO_UNIVERSE = [
  "BTC-USD", "ETH-USD", "BNB-USD", "SOL-USD", "XRP-USD",
  "ADA-USD", "DOGE-USD", "AVAX-USD", "LINK-USD", "DOT-USD",
  "MATIC-USD", "SHIB-USD", "LTC-USD", "BCH-USD", "UNI-USD",
  "XLM-USD", "NEAR-USD", "ATOM-USD", "XMR-USD", "ETC-USD",
  "APT-USD", "ARB-USD", "OP-USD", "FIL-USD", "VET-USD",
  "HBAR-USD", "INJ-USD", "AAVE-USD", "GRT-USD", "ALGO-USD",
  "FTM-USD", "SAND-USD", "MANA-USD", "AXS-USD", "MKR-USD",
  "RNDR-USD", "FET-USD", "SUI-USD", "SEI-USD", "TIA-USD"
];

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
  return adx.length > 0 ? adx[adx.length - 1] : NaN;
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

  // 1. Trend vs EMA200 (2 pts)
  if (price && ema200) {
    if (price > ema200 * 1.01) bullish += 2;
    else if (price < ema200 * 0.99) bearish += 2;
    else neutral += 1;
  }
  
  // 2. RSI (1 pt)
  if (rsi !== undefined && !isNaN(rsi)) {
    if (rsi >= 55 && rsi <= 70) bullish += 1;
    else if (rsi > 70) bearish += 1;
    else if (rsi <= 45 && rsi >= 30) bearish += 1;
    else if (rsi < 30) bullish += 1;
    else neutral += 1;
  }

  // 3. MACD (1.5 pts)
  if (macd !== undefined && macdSignal !== undefined && !isNaN(macd) && !isNaN(macdSignal)) {
    if (macd > macdSignal) bullish += 1; else bearish += 1;
    if (macd > 0) bullish += 0.5; else bearish += 0.5;
  }

  // 4. ADX (1 pt)
  if (adx !== undefined && !isNaN(adx)) {
    if (adx > 25) {
      if (bullish > bearish) bullish += 1;
      else if (bearish > bullish) bearish += 1;
    } else neutral += 1;
  }

  // 5. Stochastic (1 pt)
  if (stochK !== undefined && !isNaN(stochK)) {
    if (stochK > 80) bearish += 1;
    else if (stochK < 20) bullish += 1;
    else if (stochK >= 50) bullish += 0.5;
    else bearish += 0.5;
  }

  // 6. Aroon (1 pt)
  if (aroonUp !== undefined && aroonDown !== undefined && !isNaN(aroonUp) && !isNaN(aroonDown)) {
    if (aroonUp > aroonDown && aroonUp > 70) bullish += 1;
    else if (aroonDown > aroonUp && aroonDown > 70) bearish += 1;
    else neutral += 0.5;
  }

  // 7. CCI (1 pt)
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

  // Score 0-100 (max possible signals is ~8.5 each way)
  const maxSignals = 8.5;
  let score = 50 + ((bullish - bearish) / maxSignals) * 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, direction, signals: { bullish, bearish, neutral } };
}

// =============================================================================
// DATA FETCHERS
// =============================================================================

// Yahoo Finance interval mapping
const INTERVAL_CONFIG: Record<string, { interval: string; rangeDays: number; minBars: number }> = {
  '15m': { interval: '15m', rangeDays: 7, minBars: 50 },     // 7 days of 15min data
  '30m': { interval: '30m', rangeDays: 14, minBars: 50 },    // 14 days of 30min data
  '1h': { interval: '60m', rangeDays: 30, minBars: 50 },     // 30 days of 1h data
  '1d': { interval: '1d', rangeDays: 180, minBars: 50 }      // 180 days of daily data
};

async function fetchYahooData(symbol: string, timeframe: string = '1d'): Promise<OHLCV[] | null> {
  try {
    const config = INTERVAL_CONFIG[timeframe] || INTERVAL_CONFIG['1d'];
    const period1 = Math.floor(Date.now() / 1000) - (config.rangeDays * 24 * 60 * 60);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${config.interval}`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) return null;
    
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return null;
    
    const { timestamp } = result;
    const quote = result.indicators.quote[0];
    
    const ohlcv: OHLCV[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      if (quote.open[i] && quote.high[i] && quote.low[i] && quote.close[i]) {
        ohlcv.push({
          date: new Date(timestamp[i] * 1000).toISOString(),
          open: quote.open[i], high: quote.high[i], low: quote.low[i],
          close: quote.close[i], volume: quote.volume[i] || 0
        });
      }
    }
    const config = INTERVAL_CONFIG[timeframe] || INTERVAL_CONFIG['1d'];
    return ohlcv.length >= config.minBars ? ohlcv : null;
  } catch { return null; }
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
  if (!ohlcv || ohlcv.length < 50) return null;
  
  const closes = ohlcv.map(d => d.close);
  const price = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2];
  const change24h = ((price - prevPrice) / prevPrice) * 100;
  
  const ema200Arr = calculateEMA(closes, 200);
  const macdData = calculateMACD(closes);
  const stoch = calculateStochastic(ohlcv);
  const aroon = calculateAroon(ohlcv);
  
  const indicators: Indicators = {
    price,
    ema200: ema200Arr[ema200Arr.length - 1],
    rsi: calculateRSI(closes),
    macd: macdData.macd,
    macdSignal: macdData.signal,
    adx: calculateADX(ohlcv),
    stochK: stoch.k,
    aroonUp: aroon.up,
    aroonDown: aroon.down,
    cci: calculateCCI(ohlcv),
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
    
    if (!type || !['equity', 'crypto'].includes(type)) {
      return NextResponse.json({ error: "Type must be 'equity' or 'crypto'" }, { status: 400 });
    }
    
    const validTimeframes = ['15m', '30m', '1h', '1d'];
    const selectedTimeframe = validTimeframes.includes(timeframe) ? timeframe : '1d';
    
    const universe = type === 'equity' ? EQUITY_UNIVERSE : CRYPTO_UNIVERSE;
    const results: any[] = [];
    const errors: string[] = [];
    
    console.log(`[bulk-scan] Scanning ${universe.length} ${type} on ${selectedTimeframe} timeframe...`);
    
    // For crypto, pre-fetch all derivatives data in parallel
    const derivativesMap = new Map<string, DerivativesData>();
    if (type === 'crypto') {
      const derivSymbols = CRYPTO_UNIVERSE.map(s => s.replace(/-USD$/, ''));
      const derivPromises = derivSymbols.map(async (symbol) => {
        const data = await fetchCryptoDerivatives(symbol);
        if (data) derivativesMap.set(symbol, data);
      });
      await Promise.all(derivPromises);
      console.log(`[bulk-scan] Fetched derivatives for ${derivativesMap.size} coins`);
    }
    
    // Process in parallel batches - Yahoo Finance for both equity and crypto
    const BATCH_SIZE = 10;
    const DELAY = 100; // Yahoo Finance has generous rate limits
    
    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (id) => {
        try {
          // Both equity and crypto use Yahoo Finance
          const ohlcv = await fetchYahooData(id, selectedTimeframe);
          
          if (!ohlcv) {
            errors.push(`${id}: No data`);
            return null;
          }
          
          const result = analyzeAsset(id, ohlcv);
          if (result && type === 'crypto') {
            // Clean up crypto symbol: "BTC-USD" -> "BTC"
            const cleanSymbol = id.replace(/-USD$/, '');
            result.symbol = cleanSymbol;
            
            // Add derivatives data
            const derivData = derivativesMap.get(cleanSymbol);
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
