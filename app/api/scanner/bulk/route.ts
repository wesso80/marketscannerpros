/**
 * Bulk Scanner API - Client-triggered universe scan
 * 
 * @route POST /api/scanner/bulk
 * @description Scans top stocks or crypto to find educational research observations
 *              - Crypto: CoinGecko Commercial API (licensed, 500 calls/min)
 *              - Equity: Alpha Vantage Premium (licensed, 300 calls/min)
 * 
 * Pro/Pro Trader access required for client-triggered bulk scans.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDerivativesForSymbols, getOHLC, getMarketData, COINGECKO_ID_MAP, resolveSymbolToId } from '@/lib/coingecko';
import { proTimeframe } from '@/lib/scanner/timeframes';
import { summarizeDerivativeSnapshot } from '@/lib/scanner/derivativeSnapshot';
import { boundedBatch } from '@/lib/scanner/boundedBatch';
import { fetchCryptoSeries, type CryptoScanTimeframe } from '@/lib/scanner/cryptoBars';
import { evaluateDataTrust } from '@/lib/scanner/dataTrust';
import { detectPriceDiscontinuity } from '@/lib/scanner/barAggregation';
import { adx, atr as atrFn, atrPercent as atrPctFn, cci, ema, getIndicatorWarmupStatus, macd, OHLCVBar, rsi, stochastic, detectSqueeze, detectMomentumAcceleration } from '@/lib/indicators';
import { getSectorETF, SECTOR_ETFS } from '@/lib/sectorMap';
import { getSessionFromCookie } from '@/lib/auth';
import {
  OHLCV,
  calculateSMA, calculateEMA, calculateRSI, calculateMACD,
  calculateADX, calculateStochastic, calculateAroon, calculateCCI,
} from '@/lib/scanner-indicators';
import { getAdaptiveLayer } from '@/lib/adaptiveTrader';
import { computeInstitutionalFilter, inferStrategyFromText } from '@/lib/institutionalFilter';
import { avTakeToken } from '@/lib/avRateGovernor';
import { getBulkCachedScanData, getBulkCachedScanDataFast, CachedScanData } from '@/lib/scannerCache';
import { crossSectionalPercentiles } from '@/lib/analysis';
import { scoreProSnapshot, type ProHardBlockContext } from '@/lib/scanner/proScore';
import { macroEventFlags } from '@/lib/scanner/hardBlocks';
import { peekEarningsMap, warmEarningsMap } from '@/lib/scanner/earningsCalendar';
import { compareScannerScores, dollarVolume, synchronizeScannerScenario } from '@/lib/scanner/scoreContract';
import { applyCanonicalToScannerRow, canonicalFeaturesFromCandles, canonicalFeaturesFromRow, compareCanonicalRows, dataWatchFrom, evaluateCanonical, evaluateRegimeOverlay, hardBlocksFrom, overlayForDirection, type CanonicalFeatures, type RegimeOverlayInputs } from '@/lib/scoring/canonical';
import { loadRegimeOverlayInputs } from '@/lib/scoring/canonical/regimeOverlayData';
import { q as dbQuery } from '@/lib/db';
import { getEffectiveTier } from '@/lib/entitlements';
import { scannerComplianceMetadata, scannerDataQualityMetadata } from '@/lib/scanner/compliance';
import { atrResearchLevels } from '@/lib/scanner/atrResearchLevels';
import { parseProFilters, selectProCandidates, type ProScanFilters, type ProScanSort } from '@/lib/scanner/proSelection';
import { isAsciiCryptoTicker } from '@/lib/scanner/cryptoTicker';

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds max for client requests

// Alpha Vantage API Key
const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY;

// =============================================================================
// UNIVERSES TO SCAN — DB-backed with hardcoded fallbacks
// =============================================================================

const FALLBACK_EQUITY_UNIVERSE = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK",
  "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK",
  "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "HD",
  "CAT", "DE", "UPS", "BA", "HON", "GE",
  "XOM", "CVX", "COP", "SLB",
  "AMD", "INTC", "QCOM", "MU", "AMAT",
  "NFLX", "UBER", "ABNB", "SQ", "SHOP", "SNOW", "PLTR", "CRWD",
  "DIS", "PYPL", "ADBE", "NOW", "INTU"
];

const FALLBACK_CRYPTO_UNIVERSE = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK", "DOT",
  "MATIC", "SHIB", "LTC", "BCH", "UNI", "XLM", "NEAR", "ATOM", "ETC", "APT",
  "ARB", "OP", "FIL", "VET", "HBAR", "INJ", "AAVE", "GRT", "ALGO", "FTM",
  "SAND", "MANA", "AXS", "MKR", "RNDR", "FET", "SUI", "SEI", "TIA", "IMX",
  "RUNE", "THETA", "STX", "EGLD", "FLOW", "KAVA", "NEO", "XTZ", "EOS", "CFX",
  "GALA", "ROSE", "ZIL", "1INCH", "COMP", "SNX", "ENJ", "CRV", "LDO", "RPL",
  "BLUR", "PENDLE", "JUP", "WLD", "STRK", "ONDO", "PYTH", "JTO", "BONK", "WIF",
  "PEPE", "FLOKI", "ORDI", "SATS", "TRX", "TON", "KAS", "KLAY", "MINA", "ZEC",
  "DASH", "XMR", "BAT", "ZRX", "ANKR", "STORJ", "CELO", "ONE", "ICX", "QTUM",
  "ONT", "WAVES", "IOTA", "SC", "RVN", "BTT", "HOT", "CELR", "DENT", "CHZ"
];

const FALLBACK_FOREX_UNIVERSE = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "EURAUD", "EURCHF", "GBPAUD",
  "CADJPY", "NZDJPY", "AUDCAD", "GBPCAD", "AUDNZD", "EURNZD"
];

/** Query symbol_universe DB table for enabled symbols, fall back to hardcoded */
async function getUniverseFromDB(assetType: 'equity' | 'crypto' | 'forex'): Promise<string[]> {
  try {
    const rows = await dbQuery<{ symbol: string }>(
      `SELECT symbol FROM symbol_universe WHERE enabled = TRUE AND COALESCE(asset_type, 'equity') = $1 ORDER BY tier ASC, symbol ASC`,
      [assetType]
    );
    if (rows && rows.length > 0) {
      const symbols = rows
        .map(r => r.symbol.toUpperCase())
        .filter(s => assetType !== 'crypto' || isAsciiCryptoTicker(s.replace(/[-]?(USD|USDT)$/i, '')));
      console.log(`[bulk-scan] Loaded ${symbols.length} ${assetType} symbols from symbol_universe`);
      return symbols;
    }
  } catch (err: any) {
    console.warn(`[bulk-scan] Failed to query symbol_universe for ${assetType}, using fallback:`, err.message);
  }
  const fallback = assetType === 'equity' ? FALLBACK_EQUITY_UNIVERSE : assetType === 'forex' ? FALLBACK_FOREX_UNIVERSE : FALLBACK_CRYPTO_UNIVERSE;
  console.log(`[bulk-scan] Using fallback ${assetType} universe (${fallback.length} symbols)`);
  return fallback;
}

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
  squeeze?: boolean;
  squeezeStrength?: number;
  momentumAccel?: boolean;
  momentumAccelScore?: number;
  momentumAccelDir?: 'bullish' | 'bearish' | 'neutral';
  sectorETF?: string;
  sectorRelStr?: number;     // stock% - sectorETF% → positive = outperforming
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

// Fetch crypto OHLCV data from CoinGecko (Commercial licensed - 500 calls/min).
// Genuine-timeframe bars via lib/scanner/cryptoBars (1d = daily OHLC, 1h = hourly OHLC, 30m/15m = fine candles);
// completed bars only. Unknown symbols resolve dynamically instead of relying on the hardcoded map.
const PRO_TF_TO_SERIES: Record<string, CryptoScanTimeframe> = { '1d': 'daily', '1h': '1h', '30m': '30m', '15m': '15m' };
type CryptoFetchOutcome = { ohlcv: OHLCV[] | null; excludedReason?: 'stablecoin' | 'no_provider_mapping' | 'provider_no_data' | 'insufficient_history'; basis?: { barInterval: string; lastCompletedBarAt: string | null; historyBars: number; volumeBasis: string; coinId: string } };
async function fetchCoinGeckoSeries(symbol: string, timeframe: string = '1d', opts: { coinId?: string; requestOptions?: { retries?: number; timeoutMs?: number } } = {}): Promise<CryptoFetchOutcome> {
  const upper = symbol.toUpperCase();
  if (STABLECOINS.has(upper)) return { ohlcv: null, excludedReason: 'stablecoin' };
  const coinId = opts.coinId ?? SYMBOL_TO_COINGECKO[upper] ?? (await resolveSymbolToId(upper));
  if (!coinId) return { ohlcv: null, excludedReason: 'no_provider_mapping' };
  try {
    const series = await fetchCryptoSeries(upper, PRO_TF_TO_SERIES[timeframe] ?? 'daily', Date.now(), { coinId, requestOptions: opts.requestOptions });
    if (series.bars.length < 20) return { ohlcv: null, excludedReason: 'insufficient_history' };
    const ohlcv: OHLCV[] = series.bars.map((b) => ({ date: b.t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));
    return { ohlcv, basis: { barInterval: series.barInterval, lastCompletedBarAt: series.lastCompletedBarAt, historyBars: series.bars.length, volumeBasis: series.volumeBasis, coinId: series.coinId } };
  } catch (err) {
    console.warn(`[bulk-scan] CoinGecko series error for ${symbol}:`, (err as any)?.message);
    return { ohlcv: null, excludedReason: 'provider_no_data' };
  }
}
async function fetchCoinGeckoData(symbol: string, timeframe: string = '1d'): Promise<OHLCV[] | null> {
  return (await fetchCoinGeckoSeries(symbol, timeframe)).ohlcv;
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

/** Fetch forex candle data from Alpha Vantage FX_DAILY / FX_INTRADAY */
async function fetchForexCandles(pair: string, timeframe: string = '1d'): Promise<OHLCV[] | null> {
  try {
    if (!ALPHA_KEY) return null;
    const fromCurrency = pair.substring(0, 3);
    const toCurrency = pair.substring(3, 6) || 'USD';
    const interval = AV_INTERVAL_MAP[timeframe] || 'daily';
    let url: string;
    let tsKey: string;

    if (interval === 'daily') {
      url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&outputsize=compact&apikey=${ALPHA_KEY}`;
      tsKey = 'Time Series FX (Daily)';
    } else {
      url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&interval=${interval}&outputsize=compact&apikey=${ALPHA_KEY}`;
      tsKey = `Time Series FX (${interval})`;
    }

    const res = await (async () => { await avTakeToken(); return fetch(url, { cache: 'no-store' }); })();
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Note || data.Information || data['Error Message']) {
      console.warn(`[bulk-scan] AV forex issue for ${pair}:`, data.Note || data.Information || data['Error Message']);
      return null;
    }

    const foundKey = Object.keys(data).find(k => k === tsKey || k.startsWith('Time Series FX ('));
    const ts = (foundKey ? data[foundKey] : undefined) || {};

    const ohlcv: OHLCV[] = Object.entries(ts).map(([date, v]: [string, any]) => ({
      date,
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      close: parseFloat(v['4. close']),
      volume: 0, // Forex has no volume
    }))
    .filter((c: OHLCV) => Number.isFinite(c.close))
    .sort((a, b) => a.date.localeCompare(b.date));

    return ohlcv.length >= 20 ? ohlcv : null;
  } catch (err) {
    console.error(`[bulk-scan] Forex fetch error for ${pair}:`, err);
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
  /** Canonical engine features from the full bar history (consumed and removed by applyInstitutionalFilterToTopPicks). */
  canonicalFeatures?: CanonicalFeatures | null;
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

  // Volatility compression / squeeze detection (BB inside KC)
  const squeezeResult = detectSqueeze(bars);
  if (squeezeResult) {
    indicators.squeeze = squeezeResult.inSqueeze;
    indicators.squeezeStrength = squeezeResult.squeezeStrength;
  }

  // Momentum acceleration detection
  const momAccel = detectMomentumAcceleration(bars);
  if (momAccel) {
    indicators.momentumAccel = momAccel.accelerating;
    indicators.momentumAccelScore = momAccel.score;
    indicators.momentumAccelDir = momAccel.direction;
  }
  
  const { score, direction, signals } = computeScore(indicators);
  const canonicalFeatures = canonicalFeaturesFromCandles(ohlcv.map((b) => ({ t: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })));
  return { symbol, score, direction, signals, indicators, change24h, canonicalFeatures };
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

function isLocalBulkDemoAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.LOCAL_DEMO_MARKET_DATA === 'true';
}

function localDemoBulkScanResponse(args: {
  type: 'equity' | 'crypto' | 'forex';
  timeframe: string;
  mode: BulkScanMode;
  requestedUniverseSize: number;
  filters: ProScanFilters;
  sort: ProScanSort;
  reason: string;
}) {
  const symbolsByType: Record<'equity' | 'crypto' | 'forex', string[]> = {
    equity: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AVGO', 'TSLA'],
    crypto: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'LINK', 'AVAX', 'DOGE'],
    forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURJPY'],
  };
  const pricesByType: Record<'equity' | 'crypto' | 'forex', Record<string, number>> = {
    equity: { AAPL: 520, MSFT: 473, NVDA: 426, GOOGL: 379, AMZN: 332, META: 510, AVGO: 1280, TSLA: 285 },
    crypto: { BTC: 65000, ETH: 3250, SOL: 145, BNB: 580, XRP: 0.52, LINK: 15.5, AVAX: 36, DOGE: 0.15 },
    forex: { EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 156.4, AUDUSD: 0.65, NZDUSD: 0.59, USDCAD: 1.36, USDCHF: 0.91, EURJPY: 168.9 },
  };

  const topPicks = symbolsByType[args.type].map((symbol, index) => {
    const bullish = index % 4 !== 2;
    const neutral = index === 5;
    const direction = neutral ? 'neutral' : bullish ? 'bullish' : 'bearish';
    const price = pricesByType[args.type][symbol];
    const atr = price * (0.018 + index * 0.0025);
    const rsiValue = direction === 'bullish' ? 58 + index : direction === 'bearish' ? 43 - index : 50;
    const adxValue = 18 + index * 2;
    const confidence = Math.max(48, 82 - index * 5);
    const signalStrength = Math.max(2, 8 - index);
    const score = direction === 'bearish' ? Math.max(8, 100 - confidence) : confidence;
    const setup = adxValue < 20
      ? 'range_break_watch'
      : direction === 'bullish'
      ? 'trend_continuation_watch'
      : direction === 'bearish'
      ? 'downside_pressure_watch'
      : 'mixed_structure_watch';
    const trade = computeTradeParams(price, atr, direction);

    return {
      symbol,
      score,
      direction,
      confidence,
      setup,
      signals: direction === 'bullish'
        ? { bullish: signalStrength, bearish: 2, neutral: 1 }
        : direction === 'bearish'
        ? { bullish: 2, bearish: signalStrength, neutral: 1 }
        : { bullish: 2, bearish: 2, neutral: signalStrength },
      indicators: {
        price: Number(price.toFixed(args.type === 'forex' ? 4 : 2)),
        rsi: rsiValue,
        adx: adxValue,
        atr: Number(atr.toFixed(args.type === 'forex' ? 4 : 2)),
        atr_percent: Number(((atr / price) * 100).toFixed(2)),
        volume: args.type === 'forex' ? undefined : Math.round(1_500_000 * (index + 1)),
        squeeze: index === 0,
        squeezeStrength: index === 0 ? 72 : 0,
        momentumAccel: index === 1,
        momentumAccelScore: index === 1 ? 68 : 0,
        sectorRelStr: args.type === 'equity' ? Number((1.4 - index * 0.3).toFixed(1)) : undefined,
      },
      change24h: direction === 'bearish' ? -1.2 - index * 0.2 : direction === 'bullish' ? 1.1 + index * 0.25 : 0.2,
      ...trade,
    };
  });

  const institutional = applyInstitutionalFilterToTopPicks(topPicks, {
    type: args.type === 'crypto' ? 'crypto' : 'equity',
    timeframe: args.timeframe,
    mode: args.mode,
  });

  return NextResponse.json({
    success: true,
    compliance: scannerComplianceMetadata(),
    type: args.type,
    timeframe: args.timeframe,
    mode: args.mode,
    scanned: topPicks.length,
    duration: '0.1s',
    ...selectProCandidates(institutional.topPicks, args.filters, args.sort),
    blockedByInstitutionalFilter: institutional.blockedCount,
    apiCallsUsed: 0,
    apiCallsCap: 0,
    effectiveUniverseSize: Math.min(args.requestedUniverseSize, topPicks.length),
    dataQuality: scannerDataQualityMetadata({
      source: 'local_demo',
      computedAt: new Date(),
      stale: true,
      coverageScore: 0,
      warnings: [
        'Development-only Pro Scanner sample rows for workflow testing. Not live market data.',
        args.reason,
      ],
    }),
    errors: [`Local demo data is shown because live ${args.type} bulk scanner data is unavailable locally.`],
  });
}

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
  return atrResearchLevels(price, atrVal, direction);
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
  const cappedCoins = clamp(maxCoins, 1, Math.min(15000, maxCoinsByApiCap));
  const pageCount = Math.ceil(cappedCoins / LIGHT_SCAN_PER_PAGE);
  const markets: any[] = [];
  let apiCallsUsed = 0;

  for (let page = 1; page <= pageCount; page++) {
    if (Date.now() - startTime > 15_000) {
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
    }, { retries: 0, timeoutMs: 5_000 });
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
  let droppedNonAscii = 0;
  let droppedStable = 0;
  for (const coin of markets) {
    const symbol = String(coin.symbol || '').toUpperCase();
    if (!symbol) continue;
    if (STABLECOINS.has(symbol)) { droppedStable += 1; continue; }
    if (!isAsciiCryptoTicker(symbol)) {
      droppedNonAscii += 1;
      continue;
    }
    if (!dedupedBySymbol.has(symbol)) {
      dedupedBySymbol.set(symbol, coin);
    }
  }
  if (droppedNonAscii > 0) {
    console.info(`[bulk-scan/light] dropped ${droppedNonAscii} non-ASCII ticker(s) from CoinGecko universe`);
  }

  const ranked = Array.from(dedupedBySymbol.values())
    .map((coin) => scoreLightCryptoCandidate(coin, timeframe))
    .filter((item): item is NonNullable<ReturnType<typeof scoreLightCryptoCandidate>> => item !== null)
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

  // Enrich ten leaders with bounded genuine-timeframe histories. Do not make
  // seven more AV calls to fill a missing MFI: those inputs can have a different
  // venue/interval and must not silently replace the CoinGecko candle evidence.
  const top10 = ranked.slice(0, 10);
  const reads = await boundedBatch(top10, async pick => {
    const coinId = dedupedBySymbol.get(pick.symbol)?.id;
    const outcome = await fetchCoinGeckoSeries(pick.symbol, timeframe, {
      coinId, requestOptions: { retries: 0, timeoutMs: 4_000 },
    });
    const enriched = outcome.ohlcv ? analyzeAssetByTimeframe(pick.symbol, outcome.ohlcv, timeframe) : null;
    if (!enriched) throw new Error(outcome.excludedReason ?? 'insufficient_history');
    const result = enrichCryptoPick(pick, enriched);
    if (outcome.basis) result.dataBasis = outcome.basis;
    return result;
  }, { concurrency: 5, budgetMs: Math.max(0, 35_000 - (Date.now() - startTime)) });
  const enrichedPicks = reads.map((read, index) => read.status === 'fulfilled' ? read.value : top10[index]);
  const enrichmentUnavailable = reads.filter(read => read.status === 'rejected').length;
  // Count the upper bound of requested OHLC/volume reads, including failures.
  apiCallsUsed += top10.length * (timeframe === '1d' ? 3 : 1);

  return {
    scanned: ranked.length,
    topPicks: ranked.map(pick => enrichedPicks.find(enriched => enriched.symbol === pick.symbol) ?? pick),
    sourceCoinsFetched: markets.length,
    apiCallsUsed,
    apiCallsCap: LIGHT_SCAN_MAX_API_CALLS,
    effectiveUniverseSize: cappedCoins,
    universe: {
      mode: 'light' as const,
      source: 'coingecko /coins/markets (top by market cap)',
      input: markets.length,
      valid: ranked.length,
      enrichment: { attempted: top10.length, completed: top10.length - enrichmentUnavailable, unavailable: enrichmentUnavailable },
      excludedCounts: { stablecoin: droppedStable, nonAsciiTicker: droppedNonAscii, duplicateSymbol: markets.length - droppedStable - droppedNonAscii - dedupedBySymbol.size, unscorable: dedupedBySymbol.size - ranked.length },
      note: `${top10.length - enrichmentUnavailable}/${top10.length} technical enrichments completed. Fast ranks the whole market-cap universe on market data (price change, turnover, rank) and enriches the top 10 with genuine-timeframe indicators. Deep scans the curated symbol_universe list with full indicators for every symbol.`,
    },
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
      squeeze: typeof data.inSqueeze === 'boolean' ? data.inSqueeze : undefined,
      squeezeStrength: data.squeezeStrength != null && Number.isFinite(data.squeezeStrength) ? data.squeezeStrength : undefined,
    },
  };
}

async function runCachedEquityScan(startTime: number, timeframe: string, universeSize: number) {
  console.log(`[bulk-scan/cached] Scanning equities from worker cache (0 AV calls)...`);

  // Read pre-cached indicators for the full equity universe (DB-backed)
  const equityUniverse = await getUniverseFromDB('equity');
  const symbolsToScan = equityUniverse.slice(0, Math.max(1, universeSize));
  // FAST bulk read: whole universe from the worker cache in TWO DB queries
  // (no per-symbol round-trips, no live AV fallback).
  const cacheMap = await getBulkCachedScanDataFast(symbolsToScan);

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

  // Movers can fill a short universe without exceeding the requested or tier cap.
  for (const ticker of moverBiasMap.keys()) {
    if (symbolsToScan.length >= universeSize) break;
    if (!symbolsToScan.includes(ticker)) symbolsToScan.push(ticker);
  }

  // If cache didn't have enough data, fall back to light scan
  if (cacheMap.size < Math.min(10, symbolsToScan.length)) {
    console.warn(`[bulk-scan/cached] Only ${cacheMap.size} symbols in cache, falling back to light scan`);
    return null; // Caller will use runLightEquityScan
  }

  // EMA200 + volume history from the worker bar store in ONE query (the indicators_latest row stores EMA200 = null).
  // Never 0 for a missing EMA200: symbols with < 200 bars keep NaN and are labelled DEGRADED downstream.
  const barStats = new Map<string, { ema200: number; bars: number; lastBar: string; avgVol: number | null; lastVol: number | null; discontinuity: { date: string | null; ratio: number } | null }>();
  try {
    const cachedSymbols = Array.from(cacheMap.keys());
    const rows = await dbQuery<{ symbol: string; ts: string; close: string; volume: string | null }>(
      `SELECT symbol, ts, close, volume FROM ohlcv_bars WHERE symbol = ANY($1) AND timeframe = 'daily' AND ts >= NOW() - INTERVAL '400 days' ORDER BY symbol, ts ASC`,
      [cachedSymbols],
    );
    const bySymbol = new Map<string, Array<{ ts: string; close: number; volume: number | null }>>();
    for (const r of rows) {
      const arr = bySymbol.get(r.symbol.toUpperCase()) ?? [];
      arr.push({ ts: typeof r.ts === 'string' ? r.ts : new Date(r.ts).toISOString(), close: Number(r.close), volume: r.volume != null && Number(r.volume) > 0 ? Number(r.volume) : null });
      bySymbol.set(r.symbol.toUpperCase(), arr);
    }
    for (const [sym, arr] of bySymbol) {
      const closes = arr.map((b) => b.close).filter((c) => Number.isFinite(c));
      const emaVal = closes.length >= 200 ? ema(closes, 200) : null;
      const vols = arr.slice(-20).map((b) => b.volume).filter((v): v is number => v !== null);
      const disc = detectPriceDiscontinuity(arr.map((b) => b.close), arr.map((b) => b.ts));
      barStats.set(sym, {
        ema200: typeof emaVal === 'number' && Number.isFinite(emaVal) && !disc ? emaVal : NaN,
        bars: closes.length,
        lastBar: arr[arr.length - 1].ts.slice(0, 10),
        avgVol: vols.length >= 5 ? vols.reduce((s, v) => s + v, 0) / vols.length : null,
        lastVol: arr[arr.length - 1].volume,
        discontinuity: disc ? { date: disc.date, ratio: disc.ratio } : null,
      });
    }
  } catch (barErr) {
    console.warn('[bulk-scan/cached] ohlcv_bars EMA200 pass failed (non-fatal):', (barErr as any)?.message);
  }

  // Score every cached symbol with full 9-signal scoring
  const scored: Array<ReturnType<typeof computeFullScore> & { symbol: string; change24h: number; dataBasis?: Record<string, unknown> }> = [];
  for (const [symbol, cached] of cacheMap.entries()) {
    const stats = barStats.get(symbol.toUpperCase());
    // A split-contaminated series must not lend its EMA200 (from either store) to the score.
    const withEma = stats?.discontinuity
      ? { ...cached, ema200: NaN }
      : stats && Number.isFinite(stats.ema200) && !Number.isFinite(cached.ema200) ? { ...cached, ema200: stats.ema200 } : cached;
    const result = computeFullScore(withEma);
    // Daily change comes straight from the cached quote (no extra query).
    const change24h = typeof cached.changePct === 'number' && Number.isFinite(cached.changePct) ? cached.changePct : 0;
    const dataBasis = {
      barInterval: '1d',
      lastCompletedBarAt: cached.latestTradingDay ?? stats?.lastBar ?? null,
      historyBars: stats?.bars ?? null,
      volumeBasis: stats?.avgVol ? `exchange_volume_${Math.min(20, stats.bars)}_bars` : cached.volume ? 'session_volume_only' : 'unavailable',
      volumeRatio: stats?.avgVol && cached.volume ? Math.round((cached.volume / stats.avgVol) * 100) / 100 : null,
      source: 'ohlcv_bars + quotes_latest + indicators_latest',
      priceDiscontinuity: stats?.discontinuity ?? null,
    };
    scored.push({ ...result, symbol, change24h, dataBasis });
  }

  // Also score movers that weren't in cache using bulk quotes fallback
  let apiCallsUsed = moverData.apiCallsUsed;
  const uncachedMovers = Array.from(moverBiasMap.keys()).filter(t => symbolsToScan.includes(t) && !cacheMap.has(t));
  if (uncachedMovers.length > 0) {
    const quoteResult = await fetchAlphaBulkQuotes(uncachedMovers, Math.max(0, 3));
    apiCallsUsed += quoteResult.apiCallsUsed;
    for (const [sym, quote] of quoteResult.priceMap.entries()) {
      const light = scoreLightEquityCandidate(sym, quote, timeframe, moverBiasMap.get(sym) ?? 0);
      if (light) scored.push({ ...light, indicators: { ...light.indicators } });
    }
  }

  // Sector relative strength + SPY benchmark (one DB query, 0 API calls).
  let benchmarkChange: number | undefined;
  try {
    const sectorRows = await dbQuery<{ symbol: string; change_percent: string }>(
      `SELECT symbol, change_percent FROM quotes_latest WHERE symbol = ANY($1)`,
      [Array.from(SECTOR_ETFS)]
    );
    const sectorChanges = new Map<string, number>();
    for (const r of sectorRows) { const change = parseFloat(r.change_percent); if (Number.isFinite(change)) sectorChanges.set(r.symbol.toUpperCase(), change); }
    benchmarkChange = sectorChanges.get('SPY');
    for (const item of scored) {
      const etf = getSectorETF(item.symbol);
      if (etf && sectorChanges.has(etf)) {
        (item as any).indicators.sectorETF = etf;
        (item as any).indicators.sectorRelStr = Math.round((item.change24h - sectorChanges.get(etf)!) * 100) / 100;
      }
    }
  } catch { /* non-fatal — sector data may not be cached */ }

  // Preserve observed benchmark inputs; missing SPY is never a zero-return benchmark.
  for (const item of scored) {
    const ind = item.indicators as any;
    if (benchmarkChange !== undefined && benchmarkChange > -100) ind.rsIndexRatio = (1 + item.change24h / 100) / (1 + benchmarkChange / 100);
    if (Number.isFinite(ind.sectorRelStr)) {
      const sectorChange = item.change24h - ind.sectorRelStr;
      if (sectorChange > -100) ind.rsSectorRatio = (1 + item.change24h / 100) / (1 + sectorChange / 100);
    }
  }
  const context = proScoreUniverse(scored, 'equity');
  warmEarningsMap();
  const hardCtx: ProHardBlockContext = { earningsMap: peekEarningsMap(), macroFlags: macroEventFlags() };
  for (const item of scored) Object.assign(item, scoreProSnapshot(item, 'equity', timeframe, context, false, hardCtx));

  // Fetch chartData from ohlcv_bars — ONLY for the top candidates (bounded I/O).
  // Scoring already ranks from the cached snapshot, so we enrich the leaders
  // rather than issuing a per-symbol bar query for the whole universe.
  const enrichSet = new Set(
    [...scored].sort(compareScannerScores).slice(0, 12).map((s) => s.symbol),
  );
  for (const item of scored) {
    if (!enrichSet.has(item.symbol)) continue;
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

        // Squeeze, momentum acceleration, and volume from bars (top candidates
        // only) so the displayed rows show these columns even when the cached
        // snapshot lacks them.
        const barsForSignals: OHLCVBar[] = sorted.map((r) => ({
          timestamp: typeof r.ts === 'string' ? r.ts : new Date(r.ts).toISOString(),
          open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
          volume: Number(r.volume) || 0,
        }));
        const sqRes = detectSqueeze(barsForSignals);
        if (sqRes) {
          (item as any).indicators.squeeze = sqRes.inSqueeze;
          (item as any).indicators.squeezeStrength = sqRes.squeezeStrength;
        }
        const accRes = detectMomentumAcceleration(barsForSignals);
        if (accRes) {
          (item as any).indicators.momentumAccel = accRes.accelerating;
          (item as any).indicators.momentumAccelScore = accRes.score;
          (item as any).indicators.momentumAccelDir = accRes.direction;
        }
        const lastBarVol = bVolumes[bVolumes.length - 1];
        if (Number.isFinite(lastBarVol) && lastBarVol > 0) (item as any).indicators.volume = lastBarVol;
      }
    } catch { /* non-fatal — chart will fall back on client */ }
  }

  // Rank by the MSP Composite v2 (falls back to conviction distance).
  const rankByComposite = (x: any) => x.compositeV2?.composite ?? Math.abs(x.score - 50);
  const ranked = [...scored].sort((a, b) => rankByComposite(b) - rankByComposite(a));

  return {
    scanned: scored.length,
    topPicks: ranked,
    sourceSymbols: symbolsToScan.length,
    apiCallsUsed,
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

  const equityUniverse = await getUniverseFromDB('equity');
  const candidateSymbols = new Set<string>(equityUniverse);
  for (const ticker of moverBiasMap.keys()) candidateSymbols.add(ticker);
  const maxCandidates = Math.max(1, Math.floor(universeSize || 200));
  const prioritized = [
    ...Array.from(moverBiasMap.keys()),
    ...equityUniverse.filter((symbol) => !moverBiasMap.has(symbol)),
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
    topPicks: ranked.map(pick => enrichedEquity.find(enriched => enriched.symbol === pick.symbol) ?? pick),
    sourceSymbols: candidates.length,
    apiCallsUsed: moverData.apiCallsUsed + quoteResult.apiCallsUsed,
    apiCallsCap: LIGHT_EQUITY_MAX_API_CALLS,
    effectiveUniverseSize: candidates.length,
  };
}

/**
 * Forex bulk scan — fetches FX candles from Alpha Vantage, computes indicators locally,
 * scores via analyzeAssetByTimeframe (same 9-signal scoring as equity).
 * 1 AV call per pair (FX_DAILY/FX_INTRADAY) — very API-efficient.
 */
async function runForexBulkScan(startTime: number, timeframe: string) {
  const forexUniverse = await getUniverseFromDB('forex');
  // If DB returned short codes (e.g. "EUR"), convert to pairs vs USD
  const pairs = forexUniverse.map(s => s.length === 3 ? `${s}USD` : s);
  const maxPairs = Math.min(pairs.length, 20); // Cap at 20 pairs (20 AV calls)
  const symbolsToScan = pairs.slice(0, maxPairs);

  console.log(`[bulk-scan/forex] Scanning ${symbolsToScan.length} forex pairs on ${timeframe}...`);

  const scored: Array<{
    symbol: string;
    score: number;
    direction: 'bullish' | 'bearish' | 'neutral';
    signals: { bullish: number; bearish: number; neutral: number };
    indicators: Indicators;
    change24h: number;
  }> = [];
  let apiCallsUsed = 0;

  for (const pair of symbolsToScan) {
    if (Date.now() - startTime > 50000) {
      console.log(`[bulk-scan/forex] Time limit reached after ${scored.length} pairs`);
      break;
    }
    const candles = await fetchForexCandles(pair, timeframe);
    apiCallsUsed++;
    if (!candles) continue;

    const result = analyzeAssetByTimeframe(pair, candles, timeframe);
    if (result) {
      scored.push(result);
    }
  }

  // Sort by signal strength (distance from 50)
  scored.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

  return {
    scanned: scored.length,
    topPicks: scored,
    sourceSymbols: symbolsToScan.length,
    apiCallsUsed,
    apiCallsCap: maxPairs,
    effectiveUniverseSize: symbolsToScan.length,
  };
}

function proScoreUniverse(picks: any[], asset: string) {
  return {
    rsIndexRatios: picks.map(p => p.indicators?.rsIndexRatio).filter(Number.isFinite),
    rsSectorRatios: picks.map(p => p.indicators?.rsSectorRatio).filter(Number.isFinite),
    dollarVolumes: picks.map(p => dollarVolume(p.indicators?.price ?? p.price, p.indicators?.volume, asset)).filter((v): v is number => v !== undefined),
  };
}

function applyInstitutionalFilterToTopPicks(
  topPicks: any[],
  params: {
    type: 'equity' | 'crypto';
    timeframe: string;
    mode: BulkScanMode;
    traderRiskDNA?: 'aggressive' | 'balanced' | 'defensive';
    /** Asset class for the canonical engine (forex rides the equity institutional filter). */
    canonicalAssetClass?: 'equity' | 'crypto' | 'forex';
    regimeOverlayInputs?: RegimeOverlayInputs | null;
  }
) {
  const universe = proScoreUniverse(topPicks, params.type);
  const canonicalAssetClass = params.canonicalAssetClass ?? params.type;
  const regimeOverlay = params.regimeOverlayInputs ? overlayForDirection(evaluateRegimeOverlay(params.regimeOverlayInputs, canonicalAssetClass)) : undefined;
  if (params.type === 'equity') warmEarningsMap();
  const hardCtx: ProHardBlockContext = { earningsMap: params.type === 'equity' ? peekEarningsMap() : undefined, macroFlags: macroEventFlags() };
  const withFilter = topPicks.map((original) => {
    const initial = scoreProSnapshot(original, params.type, params.timeframe, universe);
    const pick = {...original, ...initial, price: original.indicators?.price ?? original.price, atr: original.indicators?.atr ?? original.atr};
    synchronizeScannerScenario(pick, initial.compositeV2.direction);
    pick.score = initial.compositeV2.composite;
    pick.confidence = pick.score;
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
    // Regime from market structure (ADX), never from this pick's own score (was `score >= 70 → trending`, which let
    // the score decide the regime that then filtered the score).
    const pickAdx = Number(pick?.indicators?.adx ?? Number.NaN);
    const regime = neutralSignals >= Math.max(bullishSignals, bearishSignals)
      ? 'ranging'
      : Number.isFinite(pickAdx) && pickAdx >= 25
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
        freshness: initial.dataTrust.freshness === 'fresh' ? 'LIVE' : initial.dataTrust.freshness === 'delayed' ? 'DELAYED' : initial.dataTrust.freshness === 'stale' ? 'STALE' : 'NONE',
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

    const hasObservedAtr = Number.isFinite(pickAtr) && pickAtr > 0;
    if (!hasEntry || !hasObservedAtr || pickDir === 'neutral') {
      const levels = atrResearchLevels(pickPrice, pickAtr, pickDir);
      enrichedEntry = levels.entry;
      enrichedStop = levels.stop;
      enrichedTarget = levels.target;
      enrichedRMultiple = levels.rMultiple;
    }

    // Derive a setup label from indicator signature if missing
    if (!enrichedSetup) {
      const adxVal = Number(pick?.indicators?.adx ?? NaN);
      const rsiVal = Number(pick?.indicators?.rsi ?? NaN);
      const arUp   = Number(pick?.indicators?.aroonUp ?? pick?.indicators?.aroon_up ?? 0);
      const arDn   = Number(pick?.indicators?.aroonDown ?? pick?.indicators?.aroon_down ?? 0);
      if (!Number.isFinite(adxVal) || !Number.isFinite(rsiVal) || pickDir === 'neutral') {
        enrichedSetup = 'insufficient_evidence';
      } else if (adxVal >= 25 && (arUp > 70 || arDn > 70)) {
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

    // Gate on institutional HARD blocks only. `noTrade` also fires on baseScore × weights < 40 and the legacy
    // scoreV2.execution permission is a threshold on a second blend of the same indicators — both made the permission
    // depend on the score being gated. They stay in the response (institutionalFilter / scoreV2) as diagnostics.
    const final = scoreProSnapshot(pick, params.type, params.timeframe, universe, institutionalFilter.hardBlockReasons, hardCtx);
    const {dataTrust, compositeV2, hardBlockDetail} = final;
    const matchConfidence = initial.compositeV2.composite;
    const confidence = compositeV2.composite;
    // Legacy container remains for diagnostics; every headline uses the same final result.
    scoreV2.final.confidence = confidence;
    scoreV2.final.rankScore = confidence;
    scoreV2.final.qualityTier = compositeV2.permission === 'PASS' && confidence >= 70 ? 'high' : confidence >= 50 ? 'medium' : 'low';

    // Canonical verdict (primary): bars mode when the pick carries features from its OHLCV, snapshot mode otherwise.
    const { canonicalFeatures, ...pickOut } = pick as typeof pick & { canonicalFeatures?: CanonicalFeatures | null };
    const features = canonicalFeatures ?? canonicalFeaturesFromRow(pick);
    const canonical = features
      ? evaluateCanonical({
          symbol: pick.symbol, assetClass: canonicalAssetClass, timeframe: params.timeframe, features,
          hardBlocks: hardBlocksFrom(compositeV2.blockReasons), dataWatchReasons: dataWatchFrom(compositeV2.watchReasons),
          flags: compositeV2.flags, trust: dataTrust?.level ?? null, regimeOverlay,
        })
      : null;
    const row = {
      ...pickOut,
      scoreV2,
      score: confidence,
      compositeV2,
      permission: compositeV2.permission,
      blockReasons: compositeV2.blockReasons,
      watchReasons: compositeV2.watchReasons,
      coverage: compositeV2.coverage,
      missingFactors: compositeV2.missingFactors,
      flags: compositeV2.flags,
      hardBlockDetail,
      institutionalFilter,
      entry: enrichedEntry,
      stop: enrichedStop,
      target: enrichedTarget,
      rMultiple: enrichedRMultiple,
      setup: enrichedSetup,
      matchConfidence,
      dataTrust,
      confidence,
    };
    return canonical ? applyCanonicalToScannerRow(row, canonical) : row;
  });

  // Don't remove results from discovery — tag them with warnings but keep them visible.
  // Users need to SEE what's out there, then the institutional filter badge guides decisions.
  const blockedCount = withFilter.filter(pick => ((pick as any).canonical?.permission ?? pick.compositeV2.permission) === 'BLOCK').length;
  const percentiles = crossSectionalPercentiles(withFilter.map(p => ({composite: p.compositeV2.composite})));
  withFilter.forEach((p, i) => { p.compositeV2.percentileRank = percentiles[i].percentileRank; });
  const ranked = [...withFilter].sort((a: any, b: any) => compareCanonicalRows(a, b) || compareScannerScores(a, b));
  return {
    topPicks: ranked,
    blockedCount,
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let localFallbackArgs: { type: 'equity' | 'crypto' | 'forex'; timeframe: string; mode: BulkScanMode; requestedUniverseSize: number; filters: ProScanFilters; sort: ProScanSort } | null = null;
  
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    let filters: ProScanFilters;
    const sort = body.sort ?? 'rank';
    try {
      filters = parseProFilters(body.filters);
      if (!['rank', 'confidence', 'volatility', 'trend'].includes(sort)) throw new Error('Invalid sort');
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid filters' }, { status: 400 });
    }
    const { type } = body;
    let timeframe: '15m' | '30m' | '1h' | '1d';
    try { timeframe = proTimeframe(body.timeframe); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); } // 'equity', 'crypto', or 'forex'
    const validTimeframes = ['15m', '30m', '1h', '1d'];
    const requestedMode = String(body?.mode || '').toLowerCase();
    const mode: BulkScanMode = requestedMode === 'hybrid'
      ? 'hybrid'
      : requestedMode === 'light'
        ? 'light'
        : 'deep';
    const isLightMode = mode === 'light' || mode === 'hybrid';
    const universeSizeRaw = Number(body?.universeSize ?? body?.maxCoins ?? 0);
    const requestedUniverseSize = Number.isFinite(universeSizeRaw) && universeSizeRaw > 0
      ? Math.floor(universeSizeRaw)
      : 500;
    localFallbackArgs = {
      type: ['equity', 'crypto', 'forex'].includes(type) ? type : 'crypto',
      timeframe: validTimeframes.includes(timeframe) ? timeframe : '1d',
      mode,
      requestedUniverseSize, filters, sort,
    };

    const effectiveTier = await getEffectiveTier(session.workspaceId, session.tier, session.cid, dbQuery);
    if (effectiveTier !== 'pro' && effectiveTier !== 'pro_trader') {
      return NextResponse.json({
        error: 'Advanced research scanner requires Pro access.',
        compliance: scannerComplianceMetadata(),
      }, { status: 403 });
    }

    const adaptive = session?.workspaceId
      ? await getAdaptiveLayer(session.workspaceId, { skill: 'scanner' }, 50)
      : null;

    const maxUniverseSize = effectiveTier === 'pro_trader' ? 500 : 250;
    const universeSize = Math.min(requestedUniverseSize, maxUniverseSize);
    
    if (!type || !['equity', 'crypto', 'forex'].includes(type)) {
      return NextResponse.json({ error: "Type must be 'equity', 'crypto', or 'forex'" }, { status: 400 });
    }
    
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
        regimeOverlayInputs: await loadRegimeOverlayInputs().catch(() => null),
      });

      return NextResponse.json({
        success: true,
        compliance: scannerComplianceMetadata(),
        type,
        timeframe: selectedTimeframe,
        mode,
        scanned: lightResult.scanned,
        duration: `${duration}s`,
        ...selectProCandidates(institutional.topPicks, filters, sort),
        sourceCoinsFetched: lightResult.sourceCoinsFetched,
        blockedByInstitutionalFilter: institutional.blockedCount,
        apiCallsUsed: lightResult.apiCallsUsed,
        apiCallsCap: lightResult.apiCallsCap,
        effectiveUniverseSize: lightResult.effectiveUniverseSize,
        universe: lightResult.universe,
        dataQuality: scannerDataQualityMetadata({
          source: 'coingecko_market_data',
          computedAt: new Date(),
          stale: false,
          coverageScore: lightResult.scanned ? Math.min(100, Math.round((lightResult.scanned / Math.max(1, lightResult.effectiveUniverseSize)) * 100)) : 0,
          warnings: universeSize < requestedUniverseSize ? [`Universe capped at ${universeSize} for ${effectiveTier}.`] : [],
        }),
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
        regimeOverlayInputs: await loadRegimeOverlayInputs().catch(() => null),
      });

      return NextResponse.json({
        success: true,
        compliance: scannerComplianceMetadata(),
        type,
        timeframe: selectedTimeframe,
        mode: cachedResult ? 'cached' : (isLightMode ? 'hybrid' : mode),
        scanned: equityResult.scanned,
        duration: `${duration}s`,
        ...selectProCandidates(institutional.topPicks, filters, sort),
        sourceSymbols: equityResult.sourceSymbols,
        blockedByInstitutionalFilter: institutional.blockedCount,
        apiCallsUsed: equityResult.apiCallsUsed,
        apiCallsCap: equityResult.apiCallsCap,
        effectiveUniverseSize: equityResult.effectiveUniverseSize,
        cacheHitRate: (equityResult as any).cacheHitRate,
        universe: {
          mode: cachedResult ? 'cached' : 'light',
          source: cachedResult ? 'worker cache (quotes_latest + indicators_latest + ohlcv_bars)' : 'alpha_vantage light scan',
          input: equityResult.effectiveUniverseSize,
          valid: equityResult.scanned,
          excludedCounts: { noCachedRow: Math.max(0, equityResult.effectiveUniverseSize - equityResult.scanned) },
          note: cachedResult
            ? 'Rows come from the worker cache; symbols without a cached quote/indicator row are excluded and counted, not scored.'
            : 'Light scan enriched a capped slice of the universe with Alpha Vantage calls.',
        },
        dataQuality: scannerDataQualityMetadata({
          source: cachedResult ? 'worker_cache' : 'alpha_vantage_light_scan',
          computedAt: new Date(),
          stale: false,
          coverageScore: equityResult.scanned ? Math.min(100, Math.round((equityResult.scanned / Math.max(1, equityResult.effectiveUniverseSize)) * 100)) : 0,
          warnings: universeSize < requestedUniverseSize ? [`Universe capped at ${universeSize} for ${effectiveTier}.`] : [],
        }),
        errors: [],
      });
    }

    if (type === 'forex') {
      const forexResult = await runForexBulkScan(startTime, selectedTimeframe);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      // Use 'equity' type for institutional filter since forex is similar
      const institutional = applyInstitutionalFilterToTopPicks(forexResult.topPicks, {
        type: 'equity',
        timeframe: selectedTimeframe,
        mode: 'hybrid',
        traderRiskDNA: adaptive?.profile?.riskDNA,
        canonicalAssetClass: 'forex',
        regimeOverlayInputs: await loadRegimeOverlayInputs().catch(() => null),
      });

      return NextResponse.json({
        success: true,
        compliance: scannerComplianceMetadata(),
        type,
        timeframe: selectedTimeframe,
        mode: 'hybrid',
        scanned: forexResult.scanned,
        duration: `${duration}s`,
        ...selectProCandidates(institutional.topPicks, filters, sort),
        sourceSymbols: forexResult.sourceSymbols,
        blockedByInstitutionalFilter: institutional.blockedCount,
        apiCallsUsed: forexResult.apiCallsUsed,
        apiCallsCap: forexResult.apiCallsCap,
        effectiveUniverseSize: forexResult.effectiveUniverseSize,
        dataQuality: scannerDataQualityMetadata({
          source: 'alpha_vantage_forex',
          computedAt: new Date(),
          stale: false,
          coverageScore: forexResult.scanned ? Math.min(100, Math.round((forexResult.scanned / Math.max(1, forexResult.effectiveUniverseSize)) * 100)) : 0,
          warnings: universeSize < requestedUniverseSize ? [`Universe capped at ${universeSize} for ${effectiveTier}.`] : [],
        }),
        errors: [],
      });
    }
    
    const universe = (await getUniverseFromDB(type as 'equity' | 'crypto')).slice(0, universeSize);
    const results: any[] = [];
    const errors: string[] = [];
    
    console.log(`[bulk-scan] Scanning ${universe.length} ${type} on ${selectedTimeframe} timeframe...`);
    
    const excluded: Array<{ symbol: string; reason: string }> = [];
    const budgetMs = Math.max(0, 45_000 - (Date.now() - startTime));
    // Histories and optional context run together; none can hold all results past
    // the 60-second client deadline. Every requested symbol is accounted for.
    const [histories, derivativeReads, marketReads] = await Promise.all([
      boundedBatch(universe, id => fetchCoinGeckoSeries(id, selectedTimeframe, {
        requestOptions: { retries: 0, timeoutMs: 4_000 },
      }), { concurrency: 5, budgetMs }),
      boundedBatch([universe], symbols => getDerivativesForSymbols(symbols), { concurrency: 1, budgetMs: Math.min(budgetMs, 15_000) }),
      boundedBatch([0], () => getMarketData({ order: 'market_cap_desc', per_page: 250, page: 1, sparkline: false },
        { retries: 0, timeoutMs: 4_000 }), { concurrency: 1, budgetMs: Math.min(budgetMs, 5_000) }),
    ]);
    const derivatives = derivativeReads[0]?.status === 'fulfilled' ? derivativeReads[0].value : [];
    const markets = marketReads[0]?.status === 'fulfilled' ? marketReads[0].value ?? [] : [];
    const marketById = new Map(markets.map(coin => [coin.id, coin]));
    histories.forEach((read, index) => {
      const symbol = universe[index];
      if (read.status === 'rejected') {
        excluded.push({ symbol, reason: 'time_budget_or_provider_failure' });
        return;
      }
      const outcome = read.value;
      if (!outcome.ohlcv) { excluded.push({ symbol, reason: outcome.excludedReason ?? 'provider_no_data' }); return; }
      const result = analyzeAssetByTimeframe(symbol, outcome.ohlcv, selectedTimeframe);
      if (!result) { excluded.push({ symbol, reason: 'indicator_warmup_incomplete' }); return; }
      if (outcome.basis) (result as any).dataBasis = outcome.basis;
      // A current 24h market volume is separate from candle volume. It cannot
      // fill missing hourly/15m volume or make volume-dependent factors valid.
      const market = outcome.basis?.coinId ? marketById.get(outcome.basis.coinId) : undefined;
      if (market) (result as any).marketSnapshot = {
        volume24hUsd: market.total_volume, observedAt: market.last_updated, coinId: market.id,
      };
      const derivative = summarizeDerivativeSnapshot(symbol, derivatives);
      if (derivative) result.derivatives = derivative;
      results.push(result);
    });
    if (excluded.length) errors.push(`${excluded.length}/${universe.length} symbols unavailable; inspect exclusion reasons.`);
    if (!derivatives.length) errors.push('Derivatives unavailable; dependent evidence omitted.');

    // Sort by conviction strength — distance from 50 — so both bullish AND bearish setups rank high
    const topPicks = results
      .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));
    const institutional = applyInstitutionalFilterToTopPicks(topPicks, {
      type,
      timeframe: selectedTimeframe,
      mode,
      traderRiskDNA: adaptive?.profile?.riskDNA,
      regimeOverlayInputs: await loadRegimeOverlayInputs().catch(() => null),
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[bulk-scan] Complete in ${duration}s. Top: ${topPicks.map(p => `${p.symbol}:${p.score}`).join(', ')}`);
    
    return NextResponse.json({
      success: true,
      compliance: scannerComplianceMetadata(),
      type,
      timeframe: selectedTimeframe,
      mode,
      scanned: results.length,
      duration: `${duration}s`,
      ...selectProCandidates(institutional.topPicks, filters, sort),
      blockedByInstitutionalFilter: institutional.blockedCount,
      effectiveUniverseSize: universe.length,
      universe: {
        mode: 'deep',
        source: type === 'crypto' ? 'symbol_universe (curated crypto list)' : 'symbol_universe (equity list)',
        input: universe.length,
        valid: results.length,
        providerMisses: excluded.filter((x) => x.reason === 'provider_no_data').length,
        excluded,
        note: type === 'crypto' ? 'Deep scans the curated symbol_universe list with full OHLC indicators; Fast ranks the CoinGecko top-N by market data. Different universes by design.' : undefined,
      },
      dataQuality: scannerDataQualityMetadata({
        source: type === 'crypto' ? 'coingecko_ohlc' : 'alpha_vantage',
        computedAt: new Date(),
        stale: false,
        coverageScore: Math.round(results.length / Math.max(1, universe.length) * 100),
        warnings: [
          ...(universeSize < requestedUniverseSize ? [`Universe capped at ${universeSize} for ${effectiveTier}.`] : []),
          ...errors.slice(0, 5),
        ],
      }),
      errors: errors.slice(0, 5)
    });
    
  } catch (error: any) {
    console.error("[bulk-scan] Error:", error);
    if (isLocalBulkDemoAllowed() && localFallbackArgs) {
      return localDemoBulkScanResponse({
        ...localFallbackArgs,
        reason: error?.message || 'Bulk scanner live data failed.',
      });
    }
    return NextResponse.json({
      error: error.message || "Scan failed",
      compliance: scannerComplianceMetadata(),
      dataQuality: scannerDataQualityMetadata({
        source: 'error',
        stale: true,
        coverageScore: 0,
        warnings: ['Unable to complete the advanced research scan.'],
      }),
    }, { status: 500 });
  }
}
