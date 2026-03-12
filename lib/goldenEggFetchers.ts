/**
 * Shared data fetchers extracted from golden-egg route.
 * Used by: app/api/golden-egg/route.ts, app/api/dve/route.ts
 */

import { avFetch } from '@/lib/avRateGovernor';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';
import { classifyRegime } from '@/lib/regime-classifier';
import {
  computeMarketPressure,
  type MarketPressureInput,
  type TimePressureInput,
  type VolatilityPressureInput,
  type LiquidityPressureInput,
  type OptionsPressureInput,
} from '@/lib/marketPressureEngine';
import { confluenceLearningAgent, type ScanMode, type SessionMode } from '@/lib/confluence-learning-agent';
import { getAggregatedFundingRates, getAggregatedOpenInterest, resolveSymbolToId, getCoinDetail, getOHLC } from '@/lib/coingecko';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// ── Asset type detection ────────────────────────────────────────────────
export const CRYPTO_LIST = [
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

export function detectAssetClass(symbol: string): 'equity' | 'crypto' | 'forex' {
  const s = symbol.toUpperCase();
  if (CRYPTO_LIST.includes(s) || s.endsWith('USDT') || s.endsWith('USD') && CRYPTO_LIST.some(c => s.startsWith(c))) return 'crypto';
  const fx = ['EUR','GBP','JPY','CHF','AUD','CAD','NZD'];
  if (s.length === 6 && fx.some(f => s.includes(f))) return 'forex';
  return 'equity';
}

// ── Types ───────────────────────────────────────────────────────────────

export interface PriceData {
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  historicalCloses: number[];
  historicalHighs?: number[];
  historicalLows?: number[];
}

export interface Indicators {
  rsi: number | null; macd: number | null; macdHist: number | null; macdSignal: number | null;
  sma20: number | null; sma50: number | null; adx: number | null; atr: number | null;
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null;
  stochK: number | null; stochD: number | null;
}

export interface OptionsSnapshot {
  putCallRatio: number; ivRank: number; maxPain: number;
  unusualActivity: string; sentiment: string;
  highestOICallStrike: number | null; highestOIPutStrike: number | null;
  totalCallOI: number; totalPutOI: number;
  dealerGamma: string;
}

export interface MPEData {
  composite: number;
  time: number;
  volatility: number;
  liquidity: number;
  options: number;
}

// ── Helper: fetch price ─────────────────────────────────────────────────
export async function fetchPrice(
  symbol: string,
  assetClass: string,
  opts?: { requireHistoricals?: boolean },
): Promise<PriceData | null> {
  try {
    if (assetClass === 'crypto') {
      // Use CoinGecko for crypto prices + OHLC history
      const coinId = await resolveSymbolToId(symbol);
      if (!coinId) return null;

      const [detail, ohlc] = await Promise.all([
        getCoinDetail(coinId),
        getOHLC(coinId, 90),   // 90 days of daily OHLC candles
      ]);

      const md = detail?.market_data;
      if (!md?.current_price?.usd) return null;

      const price = md.current_price.usd;
      const change = md.price_change_24h ?? 0;
      const changePct = md.price_change_percentage_24h ?? 0;
      const high = md.high_24h?.usd ?? price;
      const low = md.low_24h?.usd ?? price;
      const volume = md.total_volume?.usd ?? 0;

      // OHLC format: [timestamp, open, high, low, close]
      const candles = ohlc ?? [];
      return {
        price,
        change,
        changePct,
        high,
        low,
        volume,
        historicalCloses: candles.map((c: number[]) => c[4]),
        historicalHighs: candles.map((c: number[]) => c[2]),
        historicalLows: candles.map((c: number[]) => c[3]),
      };
    }

    // Equity: try getQuote cache cascade first (skip if historicals required)
    const cached = await getQuote(symbol);
    if (cached?.price && !opts?.requireHistoricals) {
      return {
        price: cached.price,
        change: cached.changeAmt ?? 0,
        changePct: cached.changePct ?? 0,
        high: cached.price, low: cached.price, volume: 0,
        historicalCloses: [],
      };
    }

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`;
    const data = await avFetch<Record<string, any>>(url, `DAILY ${symbol}`);
    if (!data) {
      // Fallback to cached price when AV unavailable
      if (cached?.price) {
        return {
          price: cached.price,
          change: cached.changeAmt ?? 0,
          changePct: cached.changePct ?? 0,
          high: cached.price, low: cached.price, volume: 0,
          historicalCloses: [],
        };
      }
      return null;
    }

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
      historicalHighs: dates.slice(0, 50).map(d => parseFloat(ts[d]['2. high'])),
      historicalLows: dates.slice(0, 50).map(d => parseFloat(ts[d]['3. low'])),
    };
  } catch { return null; }
}

// ── Helper: fetch indicators ────────────────────────────────────────────
export async function fetchIndicators(
  symbol: string,
  assetClass: string,
  closes: number[],
  highs?: number[],
  lows?: number[],
): Promise<Indicators | null> {
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
        rsi: ind.rsi14 ?? null,
        macd: ind.macdLine ?? null,
        macdHist: ind.macdHist ?? null,
        macdSignal: ind.macdSignal ?? null,
        sma20: ind.sma20 ?? null,
        sma50: ind.sma50 ?? null,
        adx: ind.adx14 ?? null,
        atr: ind.atr14 ?? null,
        bbUpper: ind.bbUpper ?? null,
        bbMiddle: ind.bbMiddle ?? null,
        bbLower: ind.bbLower ?? null,
        stochK: ind.stochK ?? null,
        stochD: ind.stochD ?? null,
      };
    }

    // AV fallback for key indicators (includes STOCH)
    const [rsiData, macdData, adxData, bbandsData, stochData] = await Promise.all([
      avFetch<any>(`https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(symbol)}&interval=daily&time_period=14&series_type=close&apikey=${AV_KEY}`, `RSI ${symbol}`),
      avFetch<any>(`https://www.alphavantage.co/query?function=MACD&symbol=${encodeURIComponent(symbol)}&interval=daily&series_type=close&apikey=${AV_KEY}`, `MACD ${symbol}`),
      avFetch<any>(`https://www.alphavantage.co/query?function=ADX&symbol=${encodeURIComponent(symbol)}&interval=daily&time_period=14&apikey=${AV_KEY}`, `ADX ${symbol}`),
      avFetch<any>(`https://www.alphavantage.co/query?function=BBANDS&symbol=${encodeURIComponent(symbol)}&interval=daily&time_period=20&series_type=close&apikey=${AV_KEY}`, `BBANDS ${symbol}`),
      avFetch<any>(`https://www.alphavantage.co/query?function=STOCH&symbol=${encodeURIComponent(symbol)}&interval=daily&fastkperiod=14&slowkperiod=3&slowdperiod=3&apikey=${AV_KEY}`, `STOCH ${symbol}`),
    ]);

    const rsiVal = rsiData?.['Technical Analysis: RSI'];
    const macdVal = macdData?.['Technical Analysis: MACD'];
    const adxVal = adxData?.['Technical Analysis: ADX'];
    const bbVal = bbandsData?.['Technical Analysis: BBANDS'];
    const stochVal = stochData?.['Technical Analysis: STOCH'];
    const latestMacd = macdVal ? Object.values(macdVal)[0] as any : null;
    const latestBb = bbVal ? Object.values(bbVal)[0] as any : null;
    const latestStoch = stochVal ? Object.values(stochVal)[0] as any : null;

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
      stochK: latestStoch?.SlowK ? parseFloat(latestStoch.SlowK) : null,
      stochD: latestStoch?.SlowD ? parseFloat(latestStoch.SlowD) : null,
    };
  } catch { return null; }
}

// ── Helper: fetch options data (equities only) ──────────────────────────
export async function fetchOptionsSnapshot(symbol: string, price: number): Promise<OptionsSnapshot | null> {
  if (!AV_KEY) return null;
  try {
    const realtimeUrl = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS_FMV&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`;
    let optData = await avFetch<any>(realtimeUrl, `OPTIONS_FMV ${symbol}`);
    if (!optData?.data?.length) {
      const histUrl = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`;
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
export async function fetchMPE(symbol: string, assetClass: string): Promise<MPEData | null> {
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
