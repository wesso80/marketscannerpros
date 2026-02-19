/**
 * Universe Scanner - Bulk Opportunity Discovery
 * 
 * @route POST /api/jobs/scan-universe
 * @description Scans entire stock/crypto universe using Yahoo Finance
 *              to find top 10 opportunities in each asset class
 * 
 * Scoring Formula (7 Technical Indicators):
 * 1. Price vs EMA200 (Trend) - 2 pts bullish/bearish
 * 2. RSI (14) - Momentum oscillator - 1 pt
 * 3. MACD - Trend momentum - 1.5 pts total
 * 4. ADX (14) - Trend strength amplifier - 1 pt
 * 5. Stochastic (14,3) - Overbought/oversold - 1 pt
 * 6. Aroon (25) - Trend direction - 1 pt
 * 7. CCI (20) - Commodity channel index - 1 pt
 * 
 * Protected by CRON_SECRET - callable by Render cron (or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max

// =============================================================================
// STOCK UNIVERSE - Top 200 most traded US equities
// =============================================================================
const EQUITY_UNIVERSE = [
  // Mega-cap tech
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL",
  "CRM", "ADBE", "ACN", "CSCO", "IBM", "INTC", "AMD", "QCOM", "TXN", "NOW",
  // Finance
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP",
  "C", "USB", "PNC", "TFC", "COF", "BK", "AIG", "MET", "PRU", "ALL",
  // Healthcare
  "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
  "AMGN", "GILD", "VRTX", "REGN", "ISRG", "MDT", "SYK", "BDX", "ZTS", "CI",
  // Consumer
  "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "SBUX", "TGT", "HD",
  "LOW", "TJX", "EL", "CL", "GIS", "KHC", "MDLZ", "STZ", "KMB", "SYY",
  // Industrial
  "CAT", "DE", "UPS", "FDX", "BA", "HON", "GE", "LMT", "RTX", "MMM",
  "UNP", "CSX", "NSC", "WM", "EMR", "ETN", "ITW", "PH", "ROK", "CMI",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "VLO", "MPC", "KMI",
  "WMB", "EP", "HAL", "DVN", "HES", "FANG", "BKR", "TRGP", "OKE", "CTRA",
  // Semiconductors
  "MU", "AMAT", "LRCX", "KLAC", "ADI", "MRVL", "NXPI", "MCHP", "ON", "SWKS",
  // Growth/Tech
  "NFLX", "UBER", "ABNB", "SQ", "SHOP", "SNOW", "PLTR", "CRWD", "ZS", "DDOG",
  "NET", "TEAM", "WDAY", "OKTA", "ZM", "DOCU", "MDB", "COIN", "RBLX", "DASH",
  // Other notable
  "BRK-B", "DIS", "CMCSA", "VZ", "T", "PYPL", "INTU", "PANW", "FTNT", "ANET",
  // Retail & Consumer Discretionary
  "AMZN", "BKNG", "MAR", "HLT", "CMG", "DPZ", "YUM", "ROST", "DG", "DLTR",
  // Materials & Mining
  "LIN", "APD", "SHW", "ECL", "DD", "NEM", "FCX", "NUE", "STLD", "CF",
  // REITs & Real Estate
  "AMT", "PLD", "CCI", "EQIX", "PSA", "SPG", "O", "WELL", "DLR", "AVB",
  // Utilities
  "NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "XEL", "PEG", "ED",
  // Biotech & Pharma
  "MRNA", "BIIB", "ILMN", "DXCM", "ALGN", "IDXX", "IQV", "MTD", "A", "WAT"
];

// =============================================================================
// CRYPTO UNIVERSE - Top 100 cryptocurrencies (Yahoo Finance format: SYMBOL-USD)
// =============================================================================
const CRYPTO_UNIVERSE = [
  "BTC-USD", "ETH-USD", "USDT-USD", "BNB-USD", "SOL-USD", "XRP-USD", "USDC-USD",
  "ADA-USD", "DOGE-USD", "AVAX-USD", "TRX-USD", "LINK-USD", "DOT-USD", "MATIC-USD",
  "SHIB-USD", "LTC-USD", "BCH-USD", "UNI-USD", "XLM-USD", "NEAR-USD", "ATOM-USD",
  "XMR-USD", "ETC-USD", "APT-USD", "ARB-USD", "OP-USD", "FIL-USD", "VET-USD",
  "HBAR-USD", "INJ-USD", "AAVE-USD", "GRT-USD", "ALGO-USD", "FTM-USD", "SAND-USD",
  "MANA-USD", "AXS-USD", "THETA-USD", "XTZ-USD", "EOS-USD", "FLOW-USD", "CHZ-USD",
  "CRV-USD", "LDO-USD", "MKR-USD", "SNX-USD", "COMP-USD", "SUSHI-USD", "YFI-USD",
  "BAL-USD", "1INCH-USD", "ENS-USD", "LRC-USD", "IMX-USD", "FET-USD", "RNDR-USD",
  "OCEAN-USD", "AGIX-USD", "TAO-USD", "WLD-USD", "SEI-USD", "SUI-USD", "TIA-USD",
  "PYTH-USD", "JUP-USD", "BONK-USD", "PEPE-USD", "FLOKI-USD", "GALA-USD", "ENJ-USD",
  "ILV-USD", "GODS-USD", "GMT-USD", "MAGIC-USD", "RAY-USD", "ORCA-USD", "MNDE-USD",
  "JTO-USD", "TNSR-USD", "WH-USD", "ZRO-USD", "STRK-USD", "ZK-USD", "KAS-USD"
];

// =============================================================================
// TECHNICAL INDICATOR CALCULATIONS (Local - No External API Needed)
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
  
  // Start with SMA for first value
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
  
  let avgGain = 0;
  let avgLoss = 0;
  
  // First average
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  
  // Smoothed average
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
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(ema12[i]) || isNaN(ema26[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(ema12[i] - ema26[i]);
    }
  }
  
  // Signal line is 9-period EMA of MACD
  const validMacd = macdLine.filter(v => !isNaN(v));
  if (validMacd.length < 9) return { macd: NaN, signal: NaN, histogram: NaN };
  
  const signalLine = calculateEMA(validMacd, 9);
  
  const macd = validMacd[validMacd.length - 1];
  const signal = signalLine[signalLine.length - 1];
  
  return {
    macd,
    signal,
    histogram: macd - signal
  };
}

function calculateADX(ohlcv: OHLCV[], period: number = 14): number {
  if (ohlcv.length < period * 2) return NaN;
  
  const tr: number[] = [];
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  
  for (let i = 1; i < ohlcv.length; i++) {
    const high = ohlcv[i].high;
    const low = ohlcv[i].low;
    const prevHigh = ohlcv[i - 1].high;
    const prevLow = ohlcv[i - 1].low;
    const prevClose = ohlcv[i - 1].close;
    
    // True Range
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Smoothed averages
  const smoothTR = calculateEMA(tr, period);
  const smoothDMPlus = calculateEMA(dmPlus, period);
  const smoothDMMinus = calculateEMA(dmMinus, period);
  
  const diPlus: number[] = [];
  const diMinus: number[] = [];
  const dx: number[] = [];
  
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0 || isNaN(smoothTR[i])) {
      diPlus.push(0);
      diMinus.push(0);
      dx.push(0);
    } else {
      const dip = (smoothDMPlus[i] / smoothTR[i]) * 100;
      const dim = (smoothDMMinus[i] / smoothTR[i]) * 100;
      diPlus.push(dip);
      diMinus.push(dim);
      const diSum = dip + dim;
      dx.push(diSum === 0 ? 0 : (Math.abs(dip - dim) / diSum) * 100);
    }
  }
  
  const adx = calculateEMA(dx.filter(v => !isNaN(v)), period);
  const result = adx.length > 0 ? adx[adx.length - 1] : NaN;
  // Clamp to 0-100 range as ADX should never exceed 100
  return Number.isFinite(result) ? Math.min(100, Math.max(0, result)) : NaN;
}

function calculateStochastic(ohlcv: OHLCV[], period: number = 14, smoothK: number = 3): { k: number; d: number } {
  if (ohlcv.length < period + smoothK) return { k: NaN, d: NaN };
  
  const rawK: number[] = [];
  
  for (let i = period - 1; i < ohlcv.length; i++) {
    const slice = ohlcv.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(d => d.high));
    const low = Math.min(...slice.map(d => d.low));
    const close = ohlcv[i].close;
    
    if (high === low) {
      rawK.push(50);
    } else {
      rawK.push(((close - low) / (high - low)) * 100);
    }
  }
  
  // %K is smoothed with SMA
  const kSmoothed = calculateSMA(rawK, smoothK);
  // %D is SMA of %K
  const d = calculateSMA(kSmoothed.filter(v => !isNaN(v)), 3);
  
  return {
    k: kSmoothed[kSmoothed.length - 1] || NaN,
    d: d[d.length - 1] || NaN
  };
}

function calculateAroon(ohlcv: OHLCV[], period: number = 25): { up: number; down: number } {
  if (ohlcv.length < period) return { up: NaN, down: NaN };
  
  const slice = ohlcv.slice(-period);
  let highestIdx = 0;
  let lowestIdx = 0;
  let highestVal = slice[0].high;
  let lowestVal = slice[0].low;
  
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high >= highestVal) {
      highestVal = slice[i].high;
      highestIdx = i;
    }
    if (slice[i].low <= lowestVal) {
      lowestVal = slice[i].low;
      lowestIdx = i;
    }
  }
  
  const daysSinceHigh = period - 1 - highestIdx;
  const daysSinceLow = period - 1 - lowestIdx;
  
  return {
    up: ((period - daysSinceHigh) / period) * 100,
    down: ((period - daysSinceLow) / period) * 100
  };
}

function calculateCCI(ohlcv: OHLCV[], period: number = 20): number {
  if (ohlcv.length < period) return NaN;
  
  const typicalPrices: number[] = ohlcv.map(d => (d.high + d.low + d.close) / 3);
  const sma = calculateSMA(typicalPrices, period);
  const lastSMA = sma[sma.length - 1];
  
  if (isNaN(lastSMA)) return NaN;
  
  // Mean deviation
  const slice = typicalPrices.slice(-period);
  const meanDev = slice.reduce((sum, tp) => sum + Math.abs(tp - lastSMA), 0) / period;
  
  if (meanDev === 0) return 0;
  
  const lastTP = typicalPrices[typicalPrices.length - 1];
  return (lastTP - lastSMA) / (0.015 * meanDev);
}

// =============================================================================
// SCORING FORMULA - Same as main scanner
// =============================================================================

interface Indicators {
  price: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  adx?: number;
  stochK?: number;
  stochD?: number;
  aroonUp?: number;
  aroonDown?: number;
  cci?: number;
  change24h?: number;
  volume?: number;
}

function computeScore(indicators: Indicators): { 
  score: number; 
  direction: 'bullish' | 'bearish' | 'neutral'; 
  signals: { bullish: number; bearish: number; neutral: number } 
} {
  let bullishSignals = 0;
  let bearishSignals = 0;
  let neutralSignals = 0;
  
  const { price, ema200, rsi, macd, macdSignal, adx, stochK, stochD, aroonUp, aroonDown, cci } = indicators;

  // 1. Trend vs EMA200 (Weight: 2 points)
  if (price && ema200) {
    if (price > ema200 * 1.01) { bullishSignals += 2; }
    else if (price < ema200 * 0.99) { bearishSignals += 2; }
    else { neutralSignals += 1; }
  }
  
  // 2. RSI (Weight: 1 point)
  if (rsi !== undefined && !isNaN(rsi)) {
    if (rsi >= 55 && rsi <= 70) { bullishSignals += 1; }      // Strong but not overbought
    else if (rsi > 70) { bearishSignals += 1; }               // Overbought - reversal risk
    else if (rsi <= 45 && rsi >= 30) { bearishSignals += 1; } // Weak momentum
    else if (rsi < 30) { bullishSignals += 1; }               // Oversold - bounce potential
    else { neutralSignals += 1; }
  }

  // 3. MACD (Weight: 1.5 points total)
  if (macd !== undefined && macdSignal !== undefined && !isNaN(macd) && !isNaN(macdSignal)) {
    if (macd > macdSignal) { bullishSignals += 1; }           // MACD above signal
    else { bearishSignals += 1; }
    
    if (macd > 0) { bullishSignals += 0.5; }                  // MACD positive
    else { bearishSignals += 0.5; }
  }

  // 4. ADX - Trend Strength Amplifier (Weight: 1 point)
  if (adx !== undefined && !isNaN(adx)) {
    if (adx > 25) {
      // Strong trend - amplify the dominant direction
      if (bullishSignals > bearishSignals) bullishSignals += 1;
      else if (bearishSignals > bullishSignals) bearishSignals += 1;
    } else {
      neutralSignals += 1; // Weak trend
    }
  }

  // 5. Stochastic (Weight: 1 point)
  if (stochK !== undefined && !isNaN(stochK)) {
    if (stochK > 80) { bearishSignals += 1; }                 // Overbought
    else if (stochK < 20) { bullishSignals += 1; }            // Oversold
    else if (stochK >= 50) { bullishSignals += 0.5; }
    else { bearishSignals += 0.5; }
  }

  // 6. Aroon (Weight: 1 point)
  if (aroonUp !== undefined && aroonDown !== undefined && !isNaN(aroonUp) && !isNaN(aroonDown)) {
    if (aroonUp > aroonDown && aroonUp > 70) { bullishSignals += 1; }
    else if (aroonDown > aroonUp && aroonDown > 70) { bearishSignals += 1; }
    else { neutralSignals += 0.5; }
  }

  // 7. CCI (Weight: 1 point)
  if (cci !== undefined && !isNaN(cci)) {
    if (cci > 100) { bullishSignals += 1; }                   // Strong uptrend
    else if (cci > 0) { bullishSignals += 0.5; }
    else if (cci < -100) { bearishSignals += 1; }             // Strong downtrend
    else { bearishSignals += 0.5; }
  }

  // Calculate direction (need 30% more signals in one direction)
  let direction: 'bullish' | 'bearish' | 'neutral';
  if (bullishSignals > bearishSignals * 1.3) {
    direction = 'bullish';
  } else if (bearishSignals > bullishSignals * 1.3) {
    direction = 'bearish';
  } else {
    direction = 'neutral';
  }

  // Calculate score (0-100 scale)
  // Base score 50, add/subtract based on signal difference
  // Max possible ~8.5 bullish OR ~8.5 bearish signals
  let score = 50;
  const signalDiff = bullishSignals - bearishSignals;
  const maxSignals = 8.5;
  score += (signalDiff / maxSignals) * 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    direction,
    signals: {
      bullish: Math.round(bullishSignals * 10) / 10,
      bearish: Math.round(bearishSignals * 10) / 10,
      neutral: Math.round(neutralSignals * 10) / 10
    }
  };
}

// =============================================================================
// DATA FETCHERS
// =============================================================================

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Yahoo Finance - Get historical data for a symbol
async function fetchYahooData(symbol: string): Promise<OHLCV[] | null> {
  try {
    // Yahoo Finance chart API - 6 months of daily data
    const period1 = Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60);
    const period2 = Math.floor(Date.now() / 1000);
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
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
          date: new Date(timestamp[i] * 1000).toISOString().split('T')[0],
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume[i] || 0
        });
      }
    }
    
    return ohlcv.length > 50 ? ohlcv : null; // Need at least 50 data points
  } catch (e) {
    console.error(`[Yahoo] Error fetching ${symbol}:`, e);
    return null;
  }
}

// Yahoo Finance - Get market data for crypto (same method as equities)
async function fetchCryptoData(symbol: string): Promise<OHLCV[] | null> {
  try {
    // Yahoo Finance chart API - 6 months of daily data
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const result = data.chart?.result?.[0];
    
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return null;
    
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    
    const ohlcv: OHLCV[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] != null) {
        ohlcv.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: quote.open[i] || quote.close[i],
          high: quote.high[i] || quote.close[i],
          low: quote.low[i] || quote.close[i],
          close: quote.close[i],
          volume: quote.volume[i] || 0
        });
      }
    }
    
    return ohlcv.length > 50 ? ohlcv : null;
  } catch (e) {
    console.error(`[Yahoo Crypto] Error fetching ${symbol}:`, e);
    return null;
  }
}

// Analyze a single asset and return scored result
function analyzeAsset(symbol: string, ohlcv: OHLCV[]): {
  symbol: string;
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signals: { bullish: number; bearish: number; neutral: number };
  indicators: Indicators;
  change24h: number;
} | null {
  if (!ohlcv || ohlcv.length < 50) return null;
  
  const closes = ohlcv.map(d => d.close);
  const price = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2];
  const change24h = ((price - prevPrice) / prevPrice) * 100;
  
  // Calculate all indicators
  const ema200Arr = calculateEMA(closes, 200);
  const ema200 = ema200Arr[ema200Arr.length - 1];
  const rsi = calculateRSI(closes, 14);
  const macdData = calculateMACD(closes);
  const adx = calculateADX(ohlcv, 14);
  const stoch = calculateStochastic(ohlcv, 14, 3);
  const aroon = calculateAroon(ohlcv, 25);
  const cci = calculateCCI(ohlcv, 20);
  
  const indicators: Indicators = {
    price,
    ema200: isNaN(ema200) ? undefined : ema200,
    rsi: isNaN(rsi) ? undefined : rsi,
    macd: isNaN(macdData.macd) ? undefined : macdData.macd,
    macdSignal: isNaN(macdData.signal) ? undefined : macdData.signal,
    adx: isNaN(adx) ? undefined : adx,
    stochK: isNaN(stoch.k) ? undefined : stoch.k,
    stochD: isNaN(stoch.d) ? undefined : stoch.d,
    aroonUp: isNaN(aroon.up) ? undefined : aroon.up,
    aroonDown: isNaN(aroon.down) ? undefined : aroon.down,
    cci: isNaN(cci) ? undefined : cci,
    change24h
  };
  
  const { score, direction, signals } = computeScore(indicators);
  
  return {
    symbol,
    score,
    direction,
    signals,
    indicators,
    change24h
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  console.log("[scan-universe] Starting bulk scan...");
  
  const results: {
    equities: any[];
    crypto: any[];
  } = {
    equities: [],
    crypto: []
  };
  
  const errors: string[] = [];
  
  // ==========================================================================
  // SCAN EQUITIES (Yahoo Finance)
  // ==========================================================================
  console.log(`[scan-universe] Scanning ${EQUITY_UNIVERSE.length} equities...`);
  
  // Process in batches to avoid rate limits
  const EQUITY_BATCH_SIZE = 10;
  const EQUITY_DELAY = 100; // ms between requests
  
  for (let i = 0; i < EQUITY_UNIVERSE.length; i += EQUITY_BATCH_SIZE) {
    const batch = EQUITY_UNIVERSE.slice(i, i + EQUITY_BATCH_SIZE);
    
    const batchPromises = batch.map(async (symbol) => {
      try {
        const ohlcv = await fetchYahooData(symbol);
        if (!ohlcv) {
          errors.push(`${symbol}: No data`);
          return null;
        }
        return analyzeAsset(symbol, ohlcv);
      } catch (e: any) {
        errors.push(`${symbol}: ${e.message}`);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.equities.push(...batchResults.filter(r => r !== null));
    
    // Small delay between batches
    if (i + EQUITY_BATCH_SIZE < EQUITY_UNIVERSE.length) {
      await sleep(EQUITY_DELAY);
    }
    
    console.log(`[scan-universe] Equities progress: ${Math.min(i + EQUITY_BATCH_SIZE, EQUITY_UNIVERSE.length)}/${EQUITY_UNIVERSE.length}`);
  }
  
  // ==========================================================================
  // SCAN CRYPTO (Yahoo Finance)
  // ==========================================================================
  console.log(`[scan-universe] Scanning ${CRYPTO_UNIVERSE.length} cryptocurrencies...`);
  
  // Yahoo Finance can handle more requests per minute
  const CRYPTO_BATCH_SIZE = 10;
  const CRYPTO_DELAY = 1000; // 1s between batches
  
  for (let i = 0; i < CRYPTO_UNIVERSE.length; i += CRYPTO_BATCH_SIZE) {
    const batch = CRYPTO_UNIVERSE.slice(i, i + CRYPTO_BATCH_SIZE);
    
    const batchPromises = batch.map(async (symbol) => {
      try {
        const ohlcv = await fetchCryptoData(symbol);
        if (!ohlcv) {
          errors.push(`${symbol}: No data`);
          return null;
        }
        const result = analyzeAsset(symbol, ohlcv);
        if (result) {
          // Convert Yahoo format (BTC-USD) to display format (BTC)
          result.symbol = symbol.replace("-USD", "");
        }
        return result;
      } catch (e: any) {
        errors.push(`${symbol}: ${e.message}`);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.crypto.push(...batchResults.filter(r => r !== null));
    
    // Delay between batches for rate limiting
    if (i + CRYPTO_BATCH_SIZE < CRYPTO_UNIVERSE.length) {
      await sleep(CRYPTO_DELAY);
    }
    
    console.log(`[scan-universe] Crypto progress: ${Math.min(i + CRYPTO_BATCH_SIZE, CRYPTO_UNIVERSE.length)}/${CRYPTO_UNIVERSE.length}`);
  }
  
  // ==========================================================================
  // RANK AND SELECT TOP 10
  // ==========================================================================
  
  // Sort by score (highest first) and take top 10
  const topEquities = results.equities
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  
  const topCrypto = results.crypto
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  
  // Also get bottom 10 (bearish opportunities for shorts)
  const bottomEquities = results.equities
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);
  
  const bottomCrypto = results.crypto
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);
  
  console.log(`[scan-universe] Top equities:`, topEquities.map(e => `${e.symbol}:${e.score}`).join(', '));
  console.log(`[scan-universe] Top crypto:`, topCrypto.map(c => `${c.symbol}:${c.score}`).join(', '));
  
  // ==========================================================================
  // STORE IN DATABASE
  // ==========================================================================
  
  try {
    const scanDate = new Date().toISOString().split('T')[0];
    
    // Clear old picks for today
    await q(`DELETE FROM daily_picks WHERE scan_date = $1`, [scanDate]);
    
    // Helper to insert a pick
    const insertPick = async (pick: any, assetClass: string, rankType: string) => {
      await q(`
        INSERT INTO daily_picks (
          scan_date, asset_class, symbol, score, direction, 
          signals_bullish, signals_bearish, signals_neutral,
          price, change_percent, indicators, rank_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (asset_class, symbol, scan_date) DO UPDATE SET
          score = EXCLUDED.score,
          direction = EXCLUDED.direction,
          signals_bullish = EXCLUDED.signals_bullish,
          signals_bearish = EXCLUDED.signals_bearish,
          signals_neutral = EXCLUDED.signals_neutral,
          price = EXCLUDED.price,
          change_percent = EXCLUDED.change_percent,
          indicators = EXCLUDED.indicators,
          rank_type = EXCLUDED.rank_type
      `, [
        scanDate,
        assetClass,
        pick.symbol,
        pick.score,
        pick.direction,
        Math.round(pick.signals.bullish),
        Math.round(pick.signals.bearish),
        Math.round(pick.signals.neutral),
        pick.indicators.price || null,
        pick.change24h || null,
        JSON.stringify(pick.indicators),
        rankType
      ]);
    };
    
    // Insert top bullish equities
    for (const pick of topEquities) {
      await insertPick(pick, 'equity', 'top');
    }
    
    // Insert top bullish crypto
    for (const pick of topCrypto) {
      await insertPick(pick, 'crypto', 'top');
    }
    
    // Insert bottom bearish equities (only if not already in top - avoid duplicates)
    const topEquitySymbols = new Set(topEquities.map(p => p.symbol));
    for (const pick of bottomEquities) {
      if (!topEquitySymbols.has(pick.symbol)) {
        await insertPick(pick, 'equity', 'bottom');
      }
    }
    
    // Insert bottom bearish crypto (only if not already in top)
    const topCryptoSymbols = new Set(topCrypto.map(p => p.symbol));
    for (const pick of bottomCrypto) {
      if (!topCryptoSymbols.has(pick.symbol)) {
        await insertPick(pick, 'crypto', 'bottom');
      }
    }
    
    console.log(`[scan-universe] Stored picks in database`);
  } catch (dbError: any) {
    console.error("[scan-universe] Database error:", dbError);
    errors.push(`Database: ${dbError.message}`);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  return NextResponse.json({
    success: true,
    message: `Universe scan complete in ${duration}s`,
    summary: {
      equitiesScanned: results.equities.length,
      cryptoScanned: results.crypto.length,
      topEquities: topEquities.length,
      topCrypto: topCrypto.length,
      errors: errors.length
    },
    topPicks: {
      equities: topEquities,
      crypto: topCrypto
    },
    bottomPicks: {
      equities: bottomEquities,
      crypto: bottomCrypto
    },
    errors: errors.slice(0, 20) // Limit error output
  });
}

// GET handler for easy testing
export async function GET(req: NextRequest) {
  return POST(req);
}
