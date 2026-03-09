/**
 * Golden Egg Live Data API
 *
 * GET /api/golden-egg?symbol=AAPL
 *
 * Fetches live market data from scanner/options/time/macro/MPE sources
 * and transforms it into the GoldenEggPayload format for the decision framework.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { avFetch } from '@/lib/avRateGovernor';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';
import { classifyRegime } from '@/lib/regime-classifier';
import { estimateGreeks } from '@/lib/options-confluence-analyzer';
import { getCoinDetail, getGlobalData, resolveSymbolToId } from '@/lib/coingecko';
import { computeMarketPressure, type MarketPressureInput, type TimePressureInput, type VolatilityPressureInput, type LiquidityPressureInput, type OptionsPressureInput } from '@/lib/marketPressureEngine';
import { confluenceLearningAgent, type ScanMode, type SessionMode } from '@/lib/confluence-learning-agent';
import { getAggregatedFundingRates, getAggregatedOpenInterest } from '@/lib/coingecko';
import type { GoldenEggPayload, Permission, Direction, Verdict } from '@/src/features/goldenEgg/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// ── Asset type detection ────────────────────────────────────────────────
const CRYPTO_LIST = [
  'BTC','ETH','XRP','SOL','ADA','DOGE','TRX','AVAX','LINK','DOT',
  'MATIC','SHIB','LTC','BCH','NEAR','UNI','ATOM','XLM','ICP','HBAR',
  'FIL','VET','IMX','APT','GRT','INJ','OP','THETA','FTM','RUNE',
  'LDO','ALGO','XMR','AAVE','MKR','STX','EGLD','FLOW','AXS','SAND',
  'EOS','XTZ','NEO','KAVA','CFX','MINA','SNX','CRV','DYDX','BLUR',
  'AR','SUI','SEI','TIA','JUP','WIF','PEPE','BONK','FLOKI',
  'PYTH','STRK','WLD','FET','RNDR','AGIX','OCEAN','TAO','ROSE',
  'ZIL','IOTA','ZEC','DASH','BAT','ZRX','ENJ','MANA','GALA','APE',
  'GMT','ARB','MAGIC','GMX','COMP','YFI','SUSHI','1INCH','BNB',
];

function detectAssetClass(symbol: string): 'equity' | 'crypto' | 'forex' {
  const s = symbol.toUpperCase();
  if (CRYPTO_LIST.includes(s) || s.endsWith('USDT') || s.endsWith('USD') && CRYPTO_LIST.some(c => s.startsWith(c))) return 'crypto';
  const fx = ['EUR','GBP','JPY','CHF','AUD','CAD','NZD'];
  if (s.length === 6 && fx.some(f => s.includes(f))) return 'forex';
  return 'equity';
}

// ── In-memory cache (3 min) ─────────────────────────────────────────────
const cache = new Map<string, { data: GoldenEggPayload; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000;

// ── Helper: fetch price ─────────────────────────────────────────────────
async function fetchPrice(symbol: string, assetClass: string): Promise<{ price: number; change: number; changePct: number; high: number; low: number; volume: number; historicalCloses: number[] } | null> {
  try {
    if (assetClass === 'crypto') {
      const pair = symbol.toUpperCase().replace(/[-\/]/g, '');
      const binanceSymbol = pair.endsWith('USDT') ? pair : `${pair}USDT`;
      const [tickerRes, klineRes] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`),
        fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1d&limit=50`),
      ]);
      if (!tickerRes.ok) return null;
      const ticker = await tickerRes.json();
      const klines = klineRes.ok ? await klineRes.json() : [];
      return {
        price: parseFloat(ticker.lastPrice),
        change: parseFloat(ticker.priceChange),
        changePct: parseFloat(ticker.priceChangePercent),
        high: parseFloat(ticker.highPrice),
        low: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.quoteVolume),
        historicalCloses: klines.map((k: any) => parseFloat(k[4])),
      };
    }
    // Equity: try getQuote cache cascade first, then AV daily
    const cached = await getQuote(symbol);
    if (cached?.price) {
      return {
        price: cached.price,
        change: cached.changeAmt ?? 0,
        changePct: cached.changePct ?? 0,
        high: cached.price, low: cached.price, volume: 0,
        historicalCloses: [],
      };
    }
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&apikey=${AV_KEY}`;
    const data = await avFetch<Record<string, any>>(url, `DAILY ${symbol}`);
    if (!data) return null;
    const tsKey = Object.keys(data).find(k => k.includes('Time Series'));
    if (!tsKey) return null;
    const ts = data[tsKey];
    const dates = Object.keys(ts).sort().reverse();
    const latest = ts[dates[0]];
    const prev = ts[dates[1]];
    const price = parseFloat(latest['4. close']);
    const prevClose = parseFloat(prev['4. close']);
    return {
      price,
      change: price - prevClose,
      changePct: ((price - prevClose) / prevClose) * 100,
      high: parseFloat(latest['2. high']),
      low: parseFloat(latest['3. low']),
      volume: parseFloat(latest['5. volume'] || '0'),
      historicalCloses: dates.slice(0, 50).map(d => parseFloat(ts[d]['4. close'])),
    };
  } catch { return null; }
}

// ── Helper: fetch indicators ────────────────────────────────────────────
interface Indicators {
  rsi: number | null; macd: number | null; macdHist: number | null; macdSignal: number | null;
  sma20: number | null; sma50: number | null; adx: number | null; atr: number | null;
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null;
  stochK: number | null; stochD: number | null;
}

async function fetchIndicators(symbol: string, assetClass: string, closes: number[], highs?: number[], lows?: number[]): Promise<Indicators | null> {
  try {
    if (assetClass === 'crypto' && closes.length >= 20) {
      const { calculateEMA, calculateRSI, calculateStochastic, calculateATR } = await import('@/lib/yahoo-finance');
      const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const rsi = calculateRSI(closes, 14);
      const stoch = calculateStochastic(highs || closes, lows || closes, closes, 14, 3);
      const atr = calculateATR(highs || closes, lows || closes, closes, 14);
      return { rsi, macd: ema12 - ema26, macdHist: null, macdSignal: null, sma20, sma50, adx: null, atr, bbUpper: null, bbMiddle: null, bbLower: null, stochK: stoch.k, stochD: stoch.d };
    }
    // Equity: use cached indicators
    const ind = await getIndicators(symbol, 'daily');
    if (ind) {
      return {
        rsi: ind.rsi14 ?? null, macd: ind.macdLine ?? null, macdHist: ind.macdHist ?? null, macdSignal: ind.macdSignal ?? null,
        sma20: ind.sma20 ?? null, sma50: ind.sma50 ?? null, adx: ind.adx14 ?? null, atr: ind.atr14 ?? null,
        bbUpper: ind.bbUpper ?? null, bbMiddle: ind.bbMiddle ?? null, bbLower: ind.bbLower ?? null,
        stochK: null, stochD: null,
      };
    }
    // AV fallback for key indicators
    const [rsiData, macdData, adxData, bbandsData] = await Promise.all([
      avFetch<any>(`https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${AV_KEY}`, `RSI ${symbol}`),
      avFetch<any>(`https://www.alphavantage.co/query?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${AV_KEY}`, `MACD ${symbol}`),
      avFetch<any>(`https://www.alphavantage.co/query?function=ADX&symbol=${symbol}&interval=daily&time_period=14&apikey=${AV_KEY}`, `ADX ${symbol}`),
      avFetch<any>(`https://www.alphavantage.co/query?function=BBANDS&symbol=${symbol}&interval=daily&time_period=20&series_type=close&apikey=${AV_KEY}`, `BBANDS ${symbol}`),
    ]);
    const rsiVal = rsiData?.['Technical Analysis: RSI'];
    const macdVal = macdData?.['Technical Analysis: MACD'];
    const adxVal = adxData?.['Technical Analysis: ADX'];
    const bbVal = bbandsData?.['Technical Analysis: BBANDS'];
    const latestMacd = macdVal ? Object.values(macdVal)[0] as any : null;
    const latestBb = bbVal ? Object.values(bbVal)[0] as any : null;
    return {
      rsi: rsiVal ? parseFloat((Object.values(rsiVal)[0] as any)?.RSI) || null : null,
      macd: latestMacd?.MACD ? parseFloat(latestMacd.MACD) : null,
      macdHist: latestMacd?.MACD_Hist ? parseFloat(latestMacd.MACD_Hist) : null,
      macdSignal: latestMacd?.MACD_Signal ? parseFloat(latestMacd.MACD_Signal) : null,
      sma20: null, sma50: null,
      adx: adxVal ? parseFloat((Object.values(adxVal)[0] as any)?.ADX) || null : null,
      atr: null,
      bbUpper: latestBb?.['Real Upper Band'] ? parseFloat(latestBb['Real Upper Band']) : null,
      bbMiddle: latestBb?.['Real Middle Band'] ? parseFloat(latestBb['Real Middle Band']) : null,
      bbLower: latestBb?.['Real Lower Band'] ? parseFloat(latestBb['Real Lower Band']) : null,
      stochK: null, stochD: null,
    };
  } catch { return null; }
}

// ── Helper: fetch options data (equities only) ──────────────────────────
interface OptionsSnapshot {
  putCallRatio: number; ivRank: number; maxPain: number;
  unusualActivity: string; sentiment: string;
  highestOICallStrike: number | null; highestOIPutStrike: number | null;
  totalCallOI: number; totalPutOI: number;
  dealerGamma: string;
}

async function fetchOptionsSnapshot(symbol: string, price: number): Promise<OptionsSnapshot | null> {
  if (!AV_KEY) return null;
  try {
    const realtimeUrl = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS_FMV&symbol=${symbol}&apikey=${AV_KEY}`;
    let optData = await avFetch<any>(realtimeUrl, `OPTIONS_FMV ${symbol}`);
    if (!optData?.data?.length) {
      const histUrl = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${symbol}&apikey=${AV_KEY}`;
      optData = await avFetch<any>(histUrl, `HISTORICAL_OPTIONS ${symbol}`);
    }
    const rawData = optData?.data;
    if (!rawData?.length) return null;

    const calls = rawData.filter((o: any) => o.type === 'call');
    const puts = rawData.filter((o: any) => o.type === 'put');
    const totalCallOI = calls.reduce((s: number, c: any) => s + (parseInt(c.open_interest || '0', 10)), 0);
    const totalPutOI = puts.reduce((s: number, p: any) => s + (parseInt(p.open_interest || '0', 10)), 0);
    const putCallRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

    const totalCallVol = calls.reduce((s: number, c: any) => s + (parseInt(c.volume || '0', 10)), 0);
    const totalPutVol = puts.reduce((s: number, p: any) => s + (parseInt(p.volume || '0', 10)), 0);
    const totalVol = totalCallVol + totalPutVol;
    const totalOI = totalCallOI + totalPutOI;
    const volOIRatio = totalOI > 0 ? totalVol / totalOI : 0;
    const unusualActivity = volOIRatio > 1 ? 'Very High' : volOIRatio > 0.5 ? 'Elevated' : 'Normal';

    const allIVs = rawData.map((o: any) => parseFloat(o.implied_volatility || '0')).filter((iv: number) => iv > 0 && iv < 5);
    const avgIV = allIVs.length > 0 ? allIVs.reduce((a: number, b: number) => a + b, 0) / allIVs.length : 0;
    const minIV = allIVs.length > 0 ? Math.min(...allIVs) : 0;
    const maxIV = allIVs.length > 0 ? Math.max(...allIVs) : 0;
    const ivRank = maxIV > minIV ? ((avgIV - minIV) / (maxIV - minIV)) * 100 : 50;

    // Max pain
    const strikes: number[] = [...new Set(rawData.map((o: any) => parseFloat(o.strike)) as Iterable<number>)].sort((a, b) => a - b);
    let minPain = Infinity; let maxPainStrike = price;
    for (const strike of strikes) {
      const callPain = calls.reduce((s: number, c: any) => { const k = parseFloat(c.strike); return s + Math.max(0, strike - k) * parseInt(c.open_interest || '0', 10); }, 0);
      const putPain = puts.reduce((s: number, p: any) => { const k = parseFloat(p.strike); return s + Math.max(0, k - strike) * parseInt(p.open_interest || '0', 10); }, 0);
      if (callPain + putPain < minPain) { minPain = callPain + putPain; maxPainStrike = strike; }
    }

    const callsByOI = [...calls].sort((a: any, b: any) => parseInt(b.open_interest || '0') - parseInt(a.open_interest || '0'));
    const putsByOI = [...puts].sort((a: any, b: any) => parseInt(b.open_interest || '0') - parseInt(a.open_interest || '0'));

    // Net gamma estimate
    const netGamma = calls.reduce((s: number, c: any) => s + parseFloat(c.gamma || '0') * parseInt(c.open_interest || '0', 10), 0)
      - puts.reduce((s: number, p: any) => s + parseFloat(p.gamma || '0') * parseInt(p.open_interest || '0', 10), 0);
    const dealerGamma = netGamma > 0 ? 'Long gamma (stabilizing)' : netGamma < 0 ? 'Short gamma (amplifying)' : 'Neutral';

    return {
      putCallRatio,
      ivRank,
      maxPain: maxPainStrike,
      unusualActivity,
      sentiment: putCallRatio > 1.2 ? 'Bearish' : putCallRatio < 0.8 ? 'Bullish' : 'Neutral',
      highestOICallStrike: callsByOI[0] ? parseFloat(callsByOI[0].strike) : null,
      highestOIPutStrike: putsByOI[0] ? parseFloat(putsByOI[0].strike) : null,
      totalCallOI, totalPutOI,
      dealerGamma,
    };
  } catch { return null; }
}

// ── Helper: fetch MPE pressures ─────────────────────────────────────────
async function fetchMPE(symbol: string, assetClass: string): Promise<{ composite: number; time: number; volatility: number; liquidity: number; options: number } | null> {
  try {
    const timePressure: Partial<TimePressureInput> = {};
    try {
      const scan = await confluenceLearningAgent.scanHierarchical(symbol, 'intraday_1h' as ScanMode, 'extended' as SessionMode);
      if (scan) {
        timePressure.confluenceScore = scan.prediction?.confidence ?? 0;
        timePressure.activeTFCount = scan.scoreBreakdown?.activeTFs ?? 0;
        timePressure.decompressionActiveCount = scan.decompression?.activeCount ?? 0;
        timePressure.midpointDebtCount = Array.isArray(scan.mid50Levels) ? scan.mid50Levels.length : 0;
        timePressure.hotZoneActive = (timePressure.activeTFCount ?? 0) >= 3;
      }
    } catch {}

    const volPressure: Partial<VolatilityPressureInput> = {};
    try {
      const ind = await getIndicators(symbol, 'daily');
      if (ind) {
        volPressure.atrPercent = ind.atrPercent14 ?? undefined;
        volPressure.adx = ind.adx14 ?? undefined;
        volPressure.inSqueeze = ind.inSqueeze ?? false;
        volPressure.squeezeStrength = ind.squeezeStrength ?? 0;
        if (ind.bbUpper && ind.bbLower && ind.bbMiddle && !ind.inSqueeze) {
          const bbW = ((ind.bbUpper - ind.bbLower) / ind.bbMiddle) * 100;
          volPressure.inSqueeze = bbW < 6;
          volPressure.squeezeStrength = bbW < 6 ? Math.max(0, (6 - bbW) / 6) : 0;
        }
      }
      const regime = classifyRegime({
        adx: ind?.adx14 ?? undefined,
        rsi: ind?.rsi14 ?? undefined,
        atrPercent: volPressure.atrPercent,
      });
      if (regime) {
        volPressure.regimeState = regime.label;
        volPressure.regimeConfidence = regime.confidence;
      }
    } catch {}

    const liqPressure: Partial<LiquidityPressureInput> = {};
    if (assetClass === 'crypto') {
      try {
        const sym = symbol.toUpperCase().replace(/USD[T]?$/, '');
        const [funding, oi] = await Promise.all([
          getAggregatedFundingRates([sym]),
          getAggregatedOpenInterest([sym]),
        ]);
        const fundEntry = funding?.find((f) => f.symbol?.toUpperCase()?.includes(sym));
        if (fundEntry) {
          liqPressure.fundingRatePercent = fundEntry.fundingRatePercent;
          liqPressure.fundingAnnualized = fundEntry.annualized;
          liqPressure.fundingSentiment = fundEntry.sentiment;
        }
        const oiEntry = oi?.find((o) => o.symbol?.toUpperCase()?.includes(sym));
        if (oiEntry) {
          liqPressure.oiTotalUsd = oiEntry.totalOpenInterest;
        }
      } catch {}
    }

    const optPressure: Partial<OptionsPressureInput> = {};

    const result = computeMarketPressure({
      time: timePressure as TimePressureInput,
      volatility: volPressure as VolatilityPressureInput,
      liquidity: liqPressure as LiquidityPressureInput,
      options: optPressure as OptionsPressureInput,
    } as MarketPressureInput);

    return {
      composite: result.composite,
      time: result.pressures.time.score,
      volatility: result.pressures.volatility.score,
      liquidity: result.pressures.liquidity.score,
      options: result.pressures.options.score,
    };
  } catch { return null; }
}

// ── Score → Grade ───────────────────────────────────────────────────────
function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// ── Build GoldenEggPayload from live data ───────────────────────────────
function buildPayload(
  symbol: string,
  assetClass: 'equity' | 'crypto' | 'forex',
  price: { price: number; change: number; changePct: number; high: number; low: number; volume: number; historicalCloses: number[] },
  ind: Indicators | null,
  opts: OptionsSnapshot | null,
  mpe: { composite: number; time: number; volatility: number; liquidity: number; options: number } | null,
): GoldenEggPayload {
  const p = price.price;
  const atr = ind?.atr ?? (price.high - price.low);
  const atrPct = p > 0 ? (atr / p) * 100 : 0;

  // ── Layer 1: Decision Permission ──────────────────────────────────
  // Score breakdown: Structure (30%), Flow (25%), Momentum (20%), Risk (25%)
  const structureScore = computeStructureScore(ind, price);
  const flowScore = computeFlowScore(opts, mpe);
  const momentumScore = computeMomentumScore(ind, price);
  const riskScore = computeRiskScore(ind, price, mpe);

  const weightedScore = structureScore * 0.30 + flowScore * 0.25 + momentumScore * 0.20 + riskScore * 0.25;
  const confidence = Math.max(1, Math.min(99, Math.round(weightedScore)));
  const grade = scoreToGrade(confidence);

  // Direction from momentum indicators
  let bullish = 0; let bearish = 0;
  if (ind?.rsi != null) { if (ind.rsi > 55) bullish++; else if (ind.rsi < 45) bearish++; }
  if (ind?.macd != null) { if (ind.macd > 0) bullish++; else bearish++; }
  if (ind?.macdHist != null) { if (ind.macdHist > 0) bullish++; else bearish++; }
  if (price.changePct > 1) bullish++; else if (price.changePct < -1) bearish++;
  if (opts) { if (opts.putCallRatio < 0.8) bullish++; else if (opts.putCallRatio > 1.2) bearish++; }

  const direction: Direction = bullish > bearish + 1 ? 'LONG' : bearish > bullish + 1 ? 'SHORT' : 'NEUTRAL';

  // Permission
  let permission: Permission = 'WATCH';
  if (confidence >= 70 && direction !== 'NEUTRAL') permission = 'TRADE';
  else if (confidence < 40) permission = 'NO_TRADE';

  // Flip conditions
  const flipConditions: GoldenEggPayload['layer1']['flipConditions'] = [];
  if (permission !== 'TRADE') {
    if (structureScore < 60) flipConditions.push({ id: 'f1', text: `Price needs to reclaim ${direction === 'SHORT' ? 'below' : 'above'} key moving averages`, severity: 'must' });
    if (flowScore < 50 && opts) flipConditions.push({ id: 'f2', text: `Options flow needs to confirm direction (P/C currently ${opts.putCallRatio.toFixed(2)})`, severity: 'should' });
    if (momentumScore < 50) flipConditions.push({ id: 'f3', text: `RSI needs to move ${direction === 'SHORT' ? 'below 45' : 'above 55'} to confirm momentum`, severity: 'must' });
    if (mpe && mpe.composite < 50) flipConditions.push({ id: 'f4', text: `Market pressure composite needs to reach 50+ (currently ${mpe.composite.toFixed(0)})`, severity: 'should' });
    if (flipConditions.length === 0) flipConditions.push({ id: 'f0', text: 'Overall score below threshold — waiting for improved confluence', severity: 'must' });
  }

  // Primary driver / blocker
  const sortedScores = [
    { key: 'Structure', val: structureScore },
    { key: 'Flow', val: flowScore },
    { key: 'Momentum', val: momentumScore },
    { key: 'Risk', val: riskScore },
  ].sort((a, b) => b.val - a.val);

  const primaryDriver = `${sortedScores[0].key} leads at ${sortedScores[0].val.toFixed(0)}/100 — ${describeScore(sortedScores[0].key, sortedScores[0].val, ind, opts, price)}`;
  const weakest = sortedScores[sortedScores.length - 1];
  const primaryBlocker = weakest.val < 55 ? `${weakest.key} holding back at ${weakest.val.toFixed(0)}/100` : undefined;

  // CTA
  const cta: GoldenEggPayload['layer1']['cta'] = permission === 'TRADE'
    ? { primary: 'OPEN_SCANNER', secondary: opts ? 'OPEN_OPTIONS' : 'OPEN_TIME' }
    : { primary: 'SET_ALERT', secondary: 'OPEN_TIME' };

  // ── Layer 2: Setup & Execution ────────────────────────────────────
  const setupType = determineSetupType(ind, price, atrPct);
  const keyLevels = buildKeyLevels(p, ind, opts, atr);

  // Entry / stop / targets
  const isLong = direction === 'LONG' || (direction === 'NEUTRAL' && bullish >= bearish);
  const stopDistance = atr * 1.5;
  const stopPrice = isLong ? p - stopDistance : p + stopDistance;
  const t1 = isLong ? p + atr : p - atr;
  const t2 = isLong ? p + atr * 2 : p - atr * 2;
  const t3 = isLong ? p + atr * 3 : p - atr * 3;
  const rr = stopDistance > 0 ? (atr * 2) / stopDistance : 0;

  // Timeframe alignment from MPE time pressure
  const tfScore = mpe ? Math.min(4, Math.round(mpe.time / 25)) : 2;
  const tfDetails: string[] = [];
  if (ind?.sma50 != null && ind.sma20 != null) {
    if ((isLong && p > ind.sma50) || (!isLong && p < ind.sma50)) tfDetails.push('Daily structure aligned');
    else tfDetails.push('Daily structure opposing');
  }
  if (ind?.macdHist != null) {
    tfDetails.push(ind.macdHist > 0 ? 'MACD histogram positive' : 'MACD histogram negative');
  }
  if (mpe) {
    if (mpe.time >= 50) tfDetails.push('Time confluence active');
    if (mpe.volatility >= 50) tfDetails.push('Volatility pressure building');
  }

  // ── Layer 3: Evidence Stack ───────────────────────────────────────
  // Structure verdict
  const structureVerdict: Verdict = structureScore >= 65 ? 'agree' : structureScore >= 45 ? 'neutral' : 'disagree';
  const trendHTF = ind?.sma50 != null ? (p > ind.sma50 ? 'Bullish' : 'Bearish') : 'Unknown';
  const trendMTF = ind?.sma20 != null ? (p > ind.sma20 ? 'Bullish' : 'Bearish') : 'Unknown';
  const trendLTF = price.changePct > 0.5 ? 'Bullish' : price.changePct < -0.5 ? 'Bearish' : 'Consolidating';

  const volRegime: 'compression' | 'expansion' | 'neutral' =
    ind?.bbUpper && ind?.bbLower && ind?.bbMiddle
      ? ((ind.bbUpper - ind.bbLower) / ind.bbMiddle * 100 < 8 ? 'compression' : 'expansion')
      : atrPct < 2 ? 'compression' : atrPct > 5 ? 'expansion' : 'neutral';

  // Options evidence
  const optionsEvidence: GoldenEggPayload['layer3']['options'] = opts ? {
    enabled: true,
    verdict: opts.sentiment === 'Bullish' && isLong ? 'agree' : opts.sentiment === 'Bearish' && !isLong ? 'agree' : opts.sentiment === 'Neutral' ? 'neutral' : 'disagree',
    highlights: [
      { label: 'Put/Call OI', value: opts.putCallRatio.toFixed(2) },
      { label: 'IV Rank', value: `${opts.ivRank.toFixed(0)}%` },
      { label: 'Dealer Gamma', value: opts.dealerGamma },
      { label: 'Unusual Activity', value: opts.unusualActivity },
      { label: 'Max Pain', value: `$${opts.maxPain.toFixed(2)}` },
    ],
    notes: [
      opts.unusualActivity !== 'Normal' ? `Unusual options activity detected (${opts.unusualActivity})` : 'Options flow appears normal',
    ],
  } : undefined;

  // Momentum evidence
  const momentumVerdict: Verdict = momentumScore >= 65 ? 'agree' : momentumScore >= 45 ? 'neutral' : 'disagree';
  const momentumIndicators: GoldenEggPayload['layer3']['momentum']['indicators'] = [];
  if (ind?.rsi != null) momentumIndicators.push({ name: 'RSI(14)', value: ind.rsi.toFixed(1), state: ind.rsi > 55 ? 'bull' : ind.rsi < 45 ? 'bear' : 'neutral' });
  if (ind?.adx != null) momentumIndicators.push({ name: 'ADX', value: ind.adx.toFixed(0), state: ind.adx > 25 ? 'bull' : 'neutral' });
  if (ind?.macdHist != null) momentumIndicators.push({ name: 'MACD Hist', value: ind.macdHist.toFixed(3), state: ind.macdHist > 0 ? 'bull' : 'bear' });
  if (ind?.stochK != null) momentumIndicators.push({ name: 'Stochastic', value: ind.stochK.toFixed(0), state: ind.stochK > 80 ? 'bear' : ind.stochK < 20 ? 'bull' : 'neutral' });

  // Internals (MPE pressures)
  const internals: GoldenEggPayload['layer3']['internals'] = mpe ? {
    enabled: true,
    verdict: mpe.composite >= 60 ? 'agree' : mpe.composite >= 40 ? 'neutral' : 'disagree',
    items: [
      { name: 'MPE Composite', value: `${mpe.composite.toFixed(0)}/100`, state: mpe.composite >= 60 ? 'bull' : mpe.composite < 40 ? 'bear' : 'neutral' },
      { name: 'Time Pressure', value: `${mpe.time.toFixed(0)}`, state: mpe.time >= 50 ? 'bull' : 'neutral' },
      { name: 'Vol Pressure', value: `${mpe.volatility.toFixed(0)}`, state: mpe.volatility >= 50 ? 'bull' : 'neutral' },
      { name: 'Liquidity Pressure', value: `${mpe.liquidity.toFixed(0)}`, state: mpe.liquidity >= 50 ? 'bull' : 'neutral' },
    ],
  } : undefined;

  // Narrative
  const narrativeBullets: string[] = [];
  if (permission === 'TRADE') narrativeBullets.push('Multiple factors aligned — conditions support trade entry.');
  if (structureScore >= 70) narrativeBullets.push('Price structure supports the directional thesis.');
  if (opts?.unusualActivity !== 'Normal' && opts) narrativeBullets.push('Options flow showing unusual activity — watch for institutional moves.');
  if (mpe && mpe.composite >= 60) narrativeBullets.push('Market pressure engine confirms building pressure.');
  if (narrativeBullets.length === 0) narrativeBullets.push('Confluence is building but not yet at actionable thresholds.');

  const narrativeRisks: string[] = [];
  if (atrPct > 4) narrativeRisks.push('Elevated volatility increases stop distance and position sizing risk.');
  if (opts && opts.ivRank > 70) narrativeRisks.push('IV Rank is elevated — options premium is expensive.');
  if (mpe && mpe.composite < 40) narrativeRisks.push('Low market pressure — range-bound conditions likely.');
  if (weakest.val < 40) narrativeRisks.push(`${weakest.key} score is weak — significant blocker to thesis.`);
  if (narrativeRisks.length === 0) narrativeRisks.push('No major risk flags at current levels.');

  return {
    meta: {
      symbol,
      assetClass,
      price: p,
      asOfTs: new Date().toISOString(),
      timeframe: '1D',
    },
    layer1: {
      permission,
      direction,
      confidence,
      grade,
      primaryDriver,
      primaryBlocker,
      flipConditions,
      scoreBreakdown: [
        { key: 'Structure', weight: 30, value: Math.round(structureScore), note: structureScore >= 65 ? 'Trend alignment supportive' : structureScore >= 45 ? 'Mixed structure' : 'Structure opposing' },
        { key: 'Flow', weight: 25, value: Math.round(flowScore), note: opts ? `P/C ${opts.putCallRatio.toFixed(2)}` : 'No options data' },
        { key: 'Momentum', weight: 20, value: Math.round(momentumScore), note: ind?.rsi ? `RSI ${ind.rsi.toFixed(0)}` : undefined },
        { key: 'Risk', weight: 25, value: Math.round(riskScore), note: atr ? `ATR ${atrPct.toFixed(1)}%` : undefined },
      ],
      cta,
    },
    layer2: {
      setup: {
        setupType,
        thesis: buildThesis(direction, setupType, ind, opts, mpe, symbol),
        timeframeAlignment: { score: tfScore, max: 4, details: tfDetails },
        keyLevels,
        invalidation: `Thesis invalid if price ${isLong ? 'closes below' : 'closes above'} $${stopPrice.toFixed(2)} with volume confirmation.`,
      },
      execution: {
        entryTrigger: permission === 'TRADE'
          ? `${isLong ? 'Buy' : 'Sell'} on pullback to $${(isLong ? p - atr * 0.3 : p + atr * 0.3).toFixed(2)} or breakout confirmation.`
          : 'Wait for flip conditions to be met before entry.',
        entry: { type: permission === 'TRADE' ? 'limit' : 'stop', price: permission === 'TRADE' ? p : undefined },
        stop: { price: Math.round(stopPrice * 100) / 100, logic: `${(1.5).toFixed(1)}x ATR from entry — beyond recent structure` },
        targets: [
          { price: Math.round(t1 * 100) / 100, rMultiple: 1, note: 'First scale' },
          { price: Math.round(t2 * 100) / 100, rMultiple: 2, note: 'Primary target' },
          { price: Math.round(t3 * 100) / 100, rMultiple: 3, note: 'Extension' },
        ],
        rr: { expectedR: Math.round(rr * 10) / 10, minR: 1.5 },
        sizingHint: { riskPct: confidence >= 70 ? 1.0 : confidence >= 55 ? 0.75 : 0.5 },
      },
    },
    layer3: {
      structure: {
        verdict: structureVerdict,
        trend: { htf: trendHTF, mtf: trendMTF, ltf: trendLTF },
        volatility: { regime: volRegime, atr: atr > 0 ? Math.round(atr * 100) / 100 : undefined },
        liquidity: {
          overhead: ind?.bbUpper ? `BB Upper $${ind.bbUpper.toFixed(2)}` : undefined,
          below: ind?.bbLower ? `BB Lower $${ind.bbLower.toFixed(2)}` : undefined,
          note: opts?.maxPain ? `Max pain at $${opts.maxPain.toFixed(2)} — settlement gravity` : undefined,
        },
      },
      options: optionsEvidence,
      momentum: { verdict: momentumVerdict, indicators: momentumIndicators },
      internals,
      narrative: {
        enabled: true,
        summary: permission === 'TRADE'
          ? `${symbol} shows ${direction.toLowerCase()} alignment with ${confidence}/100 confidence. Multiple factors support a ${setupType} entry.`
          : `${symbol} is in ${permission === 'NO_TRADE' ? 'no-trade' : 'watch'} mode. Confluence is insufficient — monitor flip conditions.`,
        bullets: narrativeBullets,
        risks: narrativeRisks,
      },
    },
  };
}

// ── Scoring functions ───────────────────────────────────────────────────
function computeStructureScore(ind: Indicators | null, price: { price: number; changePct: number; historicalCloses: number[] }): number {
  let score = 50; // base
  if (!ind) return score;
  const p = price.price;
  if (ind.sma20 != null) score += p > ind.sma20 ? 10 : -10;
  if (ind.sma50 != null) score += p > ind.sma50 ? 10 : -10;
  if (ind.sma20 != null && ind.sma50 != null) score += ind.sma20 > ind.sma50 ? 8 : -8;
  if (ind.bbMiddle != null) score += p > ind.bbMiddle ? 5 : -5;
  if (ind.adx != null) score += ind.adx > 25 ? 7 : -3;
  return Math.max(0, Math.min(100, score));
}

function computeFlowScore(opts: OptionsSnapshot | null, mpe: { composite: number; time: number; volatility: number; liquidity: number; options: number } | null): number {
  let score = 50;
  if (opts) {
    if (opts.putCallRatio < 0.7) score += 15;
    else if (opts.putCallRatio < 0.9) score += 5;
    else if (opts.putCallRatio > 1.3) score -= 15;
    else if (opts.putCallRatio > 1.1) score -= 5;

    if (opts.unusualActivity === 'Very High') score += 10;
    else if (opts.unusualActivity === 'Elevated') score += 5;

    if (opts.ivRank < 30) score += 5; // cheap options = opportunity
    else if (opts.ivRank > 70) score -= 5;

    if (opts.dealerGamma.includes('Long')) score += 5;
    else if (opts.dealerGamma.includes('Short')) score -= 3;
  }
  if (mpe) {
    score += (mpe.liquidity - 50) * 0.2;
    score += (mpe.options - 50) * 0.15;
  }
  return Math.max(0, Math.min(100, score));
}

function computeMomentumScore(ind: Indicators | null, price: { changePct: number }): number {
  let score = 50;
  if (!ind) return score + (price.changePct > 0 ? 5 : -5);
  if (ind.rsi != null) {
    if (ind.rsi > 55 && ind.rsi < 70) score += 12;
    else if (ind.rsi >= 70) score += 5; // overbought is still momentum
    else if (ind.rsi < 45 && ind.rsi > 30) score -= 10;
    else if (ind.rsi <= 30) score -= 5; // oversold = potential reversal
  }
  if (ind.macd != null) score += ind.macd > 0 ? 8 : -8;
  if (ind.macdHist != null) score += ind.macdHist > 0 ? 7 : -7;
  if (ind.stochK != null) {
    if (ind.stochK > 80) score += 3;
    else if (ind.stochK < 20) score -= 3;
  }
  score += price.changePct > 2 ? 8 : price.changePct > 0 ? 3 : price.changePct < -2 ? -8 : -3;
  return Math.max(0, Math.min(100, score));
}

function computeRiskScore(ind: Indicators | null, price: { price: number; high: number; low: number }, mpe: { composite: number } | null): number {
  let score = 60; // base risk is acceptable
  const atr = ind?.atr ?? (price.high - price.low);
  const atrPct = price.price > 0 ? (atr / price.price) * 100 : 0;
  // ATR-based volatility risk
  if (atrPct > 6) score -= 20;
  else if (atrPct > 4) score -= 10;
  else if (atrPct < 1.5) score += 5;
  // ADX confirms trend = lower risk
  if (ind?.adx != null && ind.adx > 25) score += 8;
  // BB squeeze = defined risk environment
  if (ind?.bbUpper && ind?.bbLower && ind?.bbMiddle) {
    const bbW = ((ind.bbUpper - ind.bbLower) / ind.bbMiddle) * 100;
    if (bbW < 8) score += 5;
  }
  // MPE composite
  if (mpe) score += (mpe.composite - 50) * 0.15;
  return Math.max(0, Math.min(100, score));
}

// ── Helpers ─────────────────────────────────────────────────────────────
function describeScore(key: string, val: number, ind: Indicators | null, opts: OptionsSnapshot | null, price: { changePct: number }): string {
  if (key === 'Structure') return ind?.sma50 ? 'price aligned with major moving averages' : 'trend structure evaluated';
  if (key === 'Flow') return opts ? `options P/C ${opts.putCallRatio.toFixed(2)}, ${opts.unusualActivity} activity` : 'no options data available';
  if (key === 'Momentum') return ind?.rsi ? `RSI ${ind.rsi.toFixed(0)}, today ${price.changePct > 0 ? '+' : ''}${price.changePct.toFixed(1)}%` : 'momentum indicators pending';
  if (key === 'Risk') return 'risk parameters within acceptable range';
  return '';
}

function determineSetupType(ind: Indicators | null, price: { changePct: number }, atrPct: number): GoldenEggPayload['layer2']['setup']['setupType'] {
  if (ind?.bbUpper && ind?.bbLower && ind?.bbMiddle) {
    const bbW = ((ind.bbUpper - ind.bbLower) / ind.bbMiddle) * 100;
    if (bbW < 6) return 'squeeze';
  }
  if (ind?.rsi != null) {
    if (ind.rsi > 70 || ind.rsi < 30) return 'mean_reversion';
  }
  if (ind?.adx != null && ind.adx > 30 && Math.abs(price.changePct) > 2) return 'breakout';
  if (ind?.adx != null && ind.adx > 25) return 'trend';
  if (atrPct < 1.5) return 'range';
  return 'trend';
}

function buildKeyLevels(p: number, ind: Indicators | null, opts: OptionsSnapshot | null, atr: number): GoldenEggPayload['layer2']['setup']['keyLevels'] {
  const levels: GoldenEggPayload['layer2']['setup']['keyLevels'] = [];
  if (ind?.sma20 != null) levels.push({ label: 'SMA 20', price: Math.round(ind.sma20 * 100) / 100, kind: 'pivot' });
  if (ind?.sma50 != null) levels.push({ label: 'SMA 50', price: Math.round(ind.sma50 * 100) / 100, kind: 'support' });
  if (ind?.bbUpper != null) levels.push({ label: 'BB Upper', price: Math.round(ind.bbUpper * 100) / 100, kind: 'resistance' });
  if (ind?.bbLower != null) levels.push({ label: 'BB Lower', price: Math.round(ind.bbLower * 100) / 100, kind: 'support' });
  if (opts?.maxPain) levels.push({ label: 'Max Pain', price: Math.round(opts.maxPain * 100) / 100, kind: 'value' });
  if (opts?.highestOICallStrike) levels.push({ label: 'Call Wall', price: opts.highestOICallStrike, kind: 'resistance' });
  if (opts?.highestOIPutStrike) levels.push({ label: 'Put Wall', price: opts.highestOIPutStrike, kind: 'support' });
  // Sort by distance from current price
  levels.sort((a, b) => Math.abs(a.price - p) - Math.abs(b.price - p));
  return levels.slice(0, 5);
}

function buildThesis(dir: Direction, setup: string, ind: Indicators | null, opts: OptionsSnapshot | null, mpe: { composite: number } | null, symbol: string): string {
  const dirWord = dir === 'LONG' ? 'bullish' : dir === 'SHORT' ? 'bearish' : 'neutral';
  const setupWord = setup === 'squeeze' ? 'volatility squeeze' : setup === 'mean_reversion' ? 'mean reversion' : setup === 'breakout' ? 'breakout' : setup === 'range' ? 'range-bound' : 'trend continuation';
  let thesis = `${symbol} shows a ${dirWord} ${setupWord} setup.`;
  if (ind?.adx != null && ind.adx > 25) thesis += ` ADX at ${ind.adx.toFixed(0)} confirms trending conditions.`;
  if (opts && opts.sentiment !== 'Neutral') thesis += ` Options flow is ${opts.sentiment.toLowerCase()} (P/C ${opts.putCallRatio.toFixed(2)}).`;
  if (mpe && mpe.composite >= 60) thesis += ` Market pressure at ${mpe.composite.toFixed(0)}/100 supports the thesis.`;
  return thesis;
}

// ── GET handler ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Please log in' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Missing symbol parameter' }, { status: 400 });
    }

    // Check cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data, cached: true });
    }

    const assetClass = detectAssetClass(symbol);

    // Fetch core data in parallel
    const [priceData, mpeData] = await Promise.all([
      fetchPrice(symbol, assetClass),
      fetchMPE(symbol, assetClass),
    ]);

    if (!priceData) {
      return NextResponse.json({ success: false, error: `Unable to fetch price data for ${symbol}` }, { status: 404 });
    }

    // Fetch indicators (may use AV — do after price to avoid burst)
    const indData = await fetchIndicators(symbol, assetClass, priceData.historicalCloses);

    // Fetch options (equities only, after indicators to space out AV calls)
    let optsData: OptionsSnapshot | null = null;
    if (assetClass === 'equity') {
      optsData = await fetchOptionsSnapshot(symbol, priceData.price);
    }

    const payload = buildPayload(symbol, assetClass, priceData, indData, optsData, mpeData);

    // Cache result
    cache.set(symbol, { data: payload, ts: Date.now() });

    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    console.error('[Golden Egg API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
