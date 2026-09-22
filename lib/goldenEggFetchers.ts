/**
 * Shared data fetchers extracted from golden-egg route.
 * Used by: app/api/golden-egg/route.ts, app/api/dve/route.ts
 */

import { avFetch, avTakeToken } from '@/lib/avRateGovernor';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';
import { calculateAllIndicators, detectSqueeze, type OHLCVBar } from '@/lib/indicators';
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
import { getAggregatedFundingRates, getAggregatedOpenInterest, resolveSymbolToId, getCoinDetail, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { fetchCryptoSeries, type CryptoScanTimeframe } from '@/lib/scanner/cryptoBars';
import * as scannerMath from '@/lib/scanner/indicatorMath';
import { summarizeChain, type CanonicalOptionsSnapshot, type RawContract } from '@/lib/goldenEgg/optionsChain';

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

export function detectAssetClass(symbol: string, typeOverride?: string): 'equity' | 'crypto' | 'forex' {
  if (typeOverride === 'equity') return 'equity';
  if (typeOverride === 'crypto') return 'crypto';
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
  avgVolume?: number;
  historicalCloses: number[];
  historicalHighs?: number[];
  historicalLows?: number[];
  /** Provenance — the bar interval indicators are computed on and the last COMPLETED bar time. */
  barInterval?: string;
  lastCompletedBarAt?: string | null;
  historicalDates?: string[];
  priceTs?: string;
  source?: string;
  volumeBasis?: string;
  /** CoinGecko coin detail (market cap, supply, ATH…) when the symbol is crypto. */
  coinDetail?: any | null;
  coinId?: string;
}

export interface Indicators {
  rsi: number | null; macd: number | null; macdHist: number | null; macdSignal: number | null;
  sma20: number | null; sma50: number | null; adx: number | null; atr: number | null;
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null;
  stochK: number | null; stochD: number | null;
  inSqueeze?: boolean; squeezeStrength?: number;
  ema20?: number | null; ema50?: number | null; ema200?: number | null;
  /** Where the numbers came from: local computation on canonical bars, or the worker indicator cache. */
  source?: 'local_canonical_bars' | 'worker_cache';
  barsUsed?: number;
}

export interface OptionsSnapshot {
  putCallRatio: number; ivRank: number; maxPain: number;
  unusualActivity: string; sentiment: string;
  highestOICallStrike: number | null; highestOIPutStrike: number | null;
  totalCallOI: number; totalPutOI: number;
  dealerGamma: string;
  /** Canonical, expiry-scoped snapshot with quality flags — the ONLY options object Deep Analyst may read. */
  canonical: CanonicalOptionsSnapshot;
}

export interface MPEData {
  composite: number;
  time: number;
  volatility: number;
  liquidity: number;
  options: number;
}

function buildLocalBars(
  closes: number[],
  highs?: number[],
  lows?: number[],
): OHLCVBar[] {
  return closes
    .map((close, index) => {
      const prevClose = index > 0 ? closes[index - 1] : close;
      const high = highs?.[index] ?? Math.max(close, prevClose);
      const low = lows?.[index] ?? Math.min(close, prevClose);
      return {
        timestamp: String(index),
        open: prevClose,
        // Use provider highs/lows as-is (true range already accounts for gaps via prevClose); only guard against bad data.
        high: Math.max(high, close),
        low: Math.min(low, close),
        close,
        volume: 0,
      };
    })
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0);
}

function mapLocalIndicators(
  closes: number[],
  highs?: number[],
  lows?: number[],
): Indicators | null {
  const bars = buildLocalBars(closes, highs, lows);
  if (bars.length < 20) return null;

  const ind = calculateAllIndicators(bars);
  const squeeze = detectSqueeze(bars);

  // Market statistics use the Scanner's exact functions on the same bars (parity rule); Bollinger/squeeze stay on lib/indicators.
  const c = bars.map((b) => b.close), h = bars.map((b) => b.high), l = bars.map((b) => b.low);
  const last = (arr: number[]) => { const v = arr[arr.length - 1]; return Number.isFinite(v) ? v : null; };
  const rsiArr = scannerMath.rsi(c, 14);
  const atrArr = scannerMath.atr(h, l, c, 14);
  const adxObj = scannerMath.adx(h, l, c, 14);
  const macdObj = scannerMath.macd(c);
  const stochObj = scannerMath.stochastic(h, l, c);
  const emaLast = (n: number) => (c.length >= n ? last(scannerMath.ema(c, n)) : null);
  const finite = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : null);

  return {
    rsi: last(rsiArr) ?? ind.rsi14 ?? null,
    macd: last(macdObj.macdLine) ?? ind.macdLine ?? null,
    macdHist: last(macdObj.hist) ?? ind.macdHist ?? null,
    macdSignal: last(macdObj.signalLine) ?? ind.macdSignal ?? null,
    sma20: ind.sma20 ?? null,
    sma50: ind.sma50 ?? null,
    adx: finite(adxObj.adx) ?? ind.adx14 ?? null,
    atr: last(atrArr) ?? ind.atr14 ?? null,
    bbUpper: ind.bbUpper ?? null,
    bbMiddle: ind.bbMiddle ?? null,
    bbLower: ind.bbLower ?? null,
    stochK: finite(stochObj.k) ?? ind.stochK ?? null,
    stochD: finite(stochObj.d) ?? ind.stochD ?? null,
    inSqueeze: squeeze?.inSqueeze ?? (ind.bbWidthPercent20 != null ? ind.bbWidthPercent20 < 6 : false),
    squeezeStrength: squeeze?.squeezeStrength ?? (ind.bbWidthPercent20 != null && ind.bbWidthPercent20 < 6 ? Math.max(0, (6 - ind.bbWidthPercent20) / 6) : 0),
    // EMA200 only when 200 bars exist; never substitute 0.
    ema20: emaLast(20),
    ema50: emaLast(50),
    ema200: bars.length >= 200 ? emaLast(200) : null,
    source: 'local_canonical_bars',
    barsUsed: bars.length,
  };
}

// ── Helper: fetch price ─────────────────────────────────────────────────
export async function fetchPrice(
  symbol: string,
  assetClass: string,
  opts?: { requireHistoricals?: boolean; avInterval?: string },
): Promise<PriceData | null> {
  try {
    const interval = opts?.avInterval || 'daily';
    const isIntraday = interval !== 'daily' && interval !== 'weekly';

    if (assetClass === 'crypto') {
      // Canonical crypto bars (lib/scanner/cryptoBars): the SAME completed-bar series the Scanner uses — true daily /
      // hourly OHLC from CoinGecko, Monday-anchored weekly aggregates, 5-minute samples for 15m. The old path built
      // "daily" bars from 4-day OHLC candles with interpolated highs/lows, inflating ATR ~2–2.6× and every level built on it.
      const tfMap: Record<string, CryptoScanTimeframe> = { '15min': '15m', '30min': '30m', '60min': '1h', daily: 'daily', weekly: 'weekly' };
      const seriesTf = tfMap[interval] ?? 'daily';
      const base = symbol.replace(/[-/]?(USDT|USD)$/i, '').toUpperCase();
      const coinId = COINGECKO_ID_MAP[base] || (await resolveSymbolToId(base));
      if (!coinId) return null;
      const [series, detail] = await Promise.all([
        fetchCryptoSeries(base, seriesTf, Date.now(), { coinId }),
        getCoinDetail(coinId).catch(() => null),
      ]);
      const bars = series.bars;
      if (bars.length < 2) return null;
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      const md = detail?.market_data;
      const livePrice = Number.isFinite(md?.current_price?.usd) && md.current_price.usd > 0 ? md.current_price.usd : series.currentPrice ?? last.close;
      const changeBase = series.partialBar || livePrice !== last.close ? last.close : prev.close;
      const histLen = opts?.requireHistoricals ? 360 : 60;
      const tail = bars.slice(-histLen);
      const vols = tail.slice(-20).map((b) => b.volume).filter((v): v is number => v != null && v > 0);
      return {
        price: livePrice,
        change: livePrice - changeBase,
        changePct: changeBase > 0 ? ((livePrice - changeBase) / changeBase) * 100 : 0,
        high: series.partialBar?.high ?? last.high,
        low: series.partialBar?.low ?? last.low,
        volume: last.volume ?? md?.total_volume?.usd ?? 0,
        avgVolume: vols.length >= 5 ? vols.reduce((a, b) => a + b, 0) / vols.length : undefined,
        historicalCloses: tail.map((b) => b.close),
        historicalHighs: tail.map((b) => b.high),
        historicalLows: tail.map((b) => b.low),
        historicalDates: tail.map((b) => b.t),
        barInterval: series.barInterval,
        lastCompletedBarAt: series.lastCompletedBarAt,
        priceTs: detail?.last_updated || md?.last_updated || series.partialBar?.t || series.lastCompletedBarAt || undefined,
        source: series.source,
        volumeBasis: series.volumeBasis,
        coinDetail: detail ?? null,
        coinId: series.coinId,
      };
    }


    // Equity: try getQuote cache cascade first (skip if historicals required)
    const cached = await getQuote(symbol);
    if (cached?.price && !opts?.requireHistoricals && !isIntraday) {
      return {
        price: cached.price,
        change: cached.changeAmt ?? 0,
        changePct: cached.changePct ?? 0,
        high: cached.price, low: cached.price, volume: 0,
        historicalCloses: [],
        priceTs: cached.latestDay,
        source: `alpha_vantage ${cached.source} quote; observation date only`,
      };
    }

    // Choose AV function based on interval
    let url: string;
    if (isIntraday) {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${opts?.requireHistoricals ? 'full' : 'compact'}&entitlement=realtime&apikey=${AV_KEY}`;
    } else if (interval === 'weekly') {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`;
    } else {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=${opts?.requireHistoricals ? 'full' : 'compact'}&apikey=${AV_KEY}`;
    }
    const data = await avFetch<Record<string, any>>(url, `${interval.toUpperCase()} ${symbol}`);
    if (!data) {
      // Fallback to cached price when AV unavailable
      if (cached?.price) {
        return {
          price: cached.price,
          change: cached.changeAmt ?? 0,
          changePct: cached.changePct ?? 0,
          high: cached.price, low: cached.price, volume: 0,
          historicalCloses: [],
        priceTs: cached.latestDay,
        source: `alpha_vantage ${cached.source} quote; observation date only`,
        };
      }
      return null;
    }

    const tsKey = Object.keys(data).find(k => k.includes('Time Series'));
    if (!tsKey) return null;
    const ts = data[tsKey];
    const dates = Object.keys(ts).sort().reverse(); // newest first
    const latest = ts[dates[0]];
    const prev = ts[dates[1]];
    const price = parseFloat(latest['4. close']);
    const prevClose = parseFloat(prev['4. close']);
    // AV DAILY_ADJUSTED uses '6. volume', plain DAILY uses '5. volume'
    const latestVol = parseFloat(latest['6. volume'] || latest['5. volume'] || '0');
    const dailyVols = dates.slice(0, 20).map(d => parseFloat(ts[d]['6. volume'] || ts[d]['5. volume'] || '0'));
    const avgVol = dailyVols.length > 0 ? dailyVols.reduce((a, b) => a + b, 0) / dailyVols.length : undefined;
    // DVE needs 252+ bars oldest-first for BBWP; take up to 300 when historicals required
    const histLen = opts?.requireHistoricals ? 300 : 50;
    const histDates = dates.slice(0, histLen).reverse(); // oldest-first
    const barInterval = isIntraday ? (interval === '60min' ? '1h' : interval.replace('min', 'm')) : interval === 'weekly' ? '1w' : '1d';
    // AV *_ADJUSTED only adjusts '5. adjusted close'; raw O/H/L/C keep pre-split prices. Walk newest→oldest and divide
    // older bars by the cumulative '8. split coefficient' so highs/lows/closes are on today's share basis (NFLX 10:1 etc.).
    const splitFactor = new Map<string, number>();
    let splitsApplied = 0;
    if (!isIntraday) {
      let f = 1;
      for (const d of dates) {
        splitFactor.set(d, f);
        const coef = parseFloat(ts[d]['8. split coefficient'] ?? '1');
        if (Number.isFinite(coef) && coef > 0 && Math.abs(coef - 1) > 1e-9) { f *= coef; splitsApplied++; }
      }
    }
    const adj = (d: string, field: string) => { const v = parseFloat(ts[d][field]); const f = splitFactor.get(d) ?? 1; return f !== 1 ? v / f : v; };
    // Intraday keys are 'YYYY-MM-DD HH:MM:SS' in US/Eastern; daily/weekly keys are session dates.
    const lastKey = dates[0];
    return {
      price,
      change: price - prevClose,
      changePct: ((price - prevClose) / prevClose) * 100,
      high: parseFloat(latest['2. high']),
      low: parseFloat(latest['3. low']),
      volume: latestVol,
      avgVolume: avgVol,
      historicalCloses: histDates.map(d => adj(d, '4. close')),
      historicalHighs: histDates.map(d => adj(d, '2. high')),
      historicalLows: histDates.map(d => adj(d, '3. low')),
      historicalDates: histDates,
      barInterval,
      lastCompletedBarAt: lastKey ?? null,
      priceTs: lastKey,
      source: isIntraday ? `alpha_vantage TIME_SERIES_INTRADAY ${interval}` : `alpha_vantage TIME_SERIES_${interval === 'weekly' ? 'WEEKLY' : 'DAILY'}_ADJUSTED (O/H/L/C split-adjusted via coefficients${splitsApplied ? `, ${splitsApplied} split${splitsApplied === 1 ? '' : 's'} applied` : ''})`,
      volumeBasis: avgVol && avgVol > 0 ? 'exchange_volume_20_bars' : 'unavailable',
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
  avInterval: string = 'daily',
): Promise<Indicators | null> {
  try {
    const isIntraday = avInterval !== 'daily' && avInterval !== 'weekly';

    const local = mapLocalIndicators(closes, highs, lows);

    // Canonical rule: indicators are computed locally on the SAME bars the packet reports (crypto canonical series,
    // AV split-adjusted daily/weekly, AV intraday). The worker cache is only a fallback when bars are too short.
    if (local && local.barsUsed && local.barsUsed >= 50) {
      return local;
    }
    if (local && (assetClass === 'crypto' || isIntraday || avInterval === 'weekly')) {
      return local;
    }

    // Equity daily: prefer cached worker indicators, then local computation from fetched bars.
    if (!isIntraday && avInterval !== 'weekly') {
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
          inSqueeze: ind.inSqueeze ?? false,
          squeezeStrength: ind.squeezeStrength ?? 0,
          ema20: (ind as any).ema20 ?? null,
          ema50: (ind as any).ema50 ?? null,
          ema200: typeof ind.ema200 === 'number' && ind.ema200 > 0 ? ind.ema200 : null,
          source: 'worker_cache',
        };
      }
    }

    return local;
  } catch { return null; }
}

// ── Helper: fetch options data (equities only) ──────────────────────────
export async function fetchOptionsSnapshot(
  symbol: string,
  price: number,
  ctx: { recentCloses?: number[]; recentDates?: string[] } = {},
): Promise<OptionsSnapshot | null> {
  if (!AV_KEY) return null;
  try {
    const realtimeUrl = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS_FMV&symbol=${encodeURIComponent(symbol)}&require_greeks=true&apikey=${AV_KEY}`;
    let optData = await avFetch<any>(realtimeUrl, `OPTIONS_FMV ${symbol}`);
    let provider = 'alpha_vantage REALTIME_OPTIONS_FMV';
    if (!optData?.data?.length) {
      const documentedRealtimeUrl = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS&symbol=${encodeURIComponent(symbol)}&require_greeks=true&apikey=${AV_KEY}`;
      optData = await avFetch<any>(documentedRealtimeUrl, `REALTIME_OPTIONS ${symbol}`);
      provider = 'alpha_vantage REALTIME_OPTIONS';
    }
    if (!optData?.data?.length) {
      const histUrl = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${encodeURIComponent(symbol)}&require_greeks=true&apikey=${AV_KEY}`;
      optData = await avFetch<any>(histUrl, `HISTORICAL_OPTIONS ${symbol}`);
      provider = 'alpha_vantage HISTORICAL_OPTIONS (previous session)';
    }
    const rawData: RawContract[] | undefined = optData?.data;
    if (!rawData?.length) return null;

    // ONE expiry, ONE timestamp. All P/C, walls, max pain and IV below refer to this chain only.
    const snapshotTs = rawData[0]?.date ? String(rawData[0].date).slice(0, 10) : '';
    const canonical = summarizeChain(rawData, price, { snapshotTs, recentCloses: ctx.recentCloses, recentDates: ctx.recentDates });
    if (!canonical) return null;
    canonical.notes.push(`Source: ${provider}.`);

    return {
      putCallRatio: canonical.putCallOi,
      // No IV history is available from the chain alone; ivRank is intentionally not fabricated (50 = "unknown" placeholder for legacy math).
      ivRank: 50,
      maxPain: canonical.maxPain ?? price,
      unusualActivity: canonical.unusualActivity,
      sentiment: canonical.sentiment,
      highestOICallStrike: canonical.callWall?.strike ?? null,
      highestOIPutStrike: canonical.putWall?.strike ?? null,
      totalCallOI: canonical.totalCallOi,
      totalPutOI: canonical.totalPutOi,
      dealerGamma: canonical.dealerGamma,
      canonical,
    };
  } catch { return null; }
}


// ── Helper: fetch crypto derivatives (funding rates + OI via CoinGecko) ─
export interface CryptoDerivatives {
  fundingRate: number;
  fundingRatePercent: number;
  annualizedFunding: number;
  totalOpenInterest: number;
  volume24h: number;
  exchanges: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
}

export async function fetchCryptoDerivatives(symbol: string): Promise<CryptoDerivatives | null> {
  try {
    // Extract base symbol: BTC-USD → BTC, ETHUSDT → ETH
    const base = symbol.toUpperCase().replace(/-?USD[T]?$/, '');
    const [fundingArr, oiArr] = await Promise.all([
      getAggregatedFundingRates([base]),
      getAggregatedOpenInterest([base]),
    ]);
    const funding = fundingArr?.[0];
    const oi = oiArr?.[0];
    if (!funding || !Number.isFinite(funding.fundingRatePercent)) return null;

    return {
      fundingRate: funding?.avgFundingRate ?? 0,
      fundingRatePercent: funding?.fundingRatePercent ?? 0,
      annualizedFunding: funding?.annualized ?? 0,
      totalOpenInterest: oi?.totalOpenInterest ?? 0,
      volume24h: oi?.avgVolume24h ?? 0,
      exchanges: Math.max(funding?.exchanges ?? 0, oi?.exchanges ?? 0),
      sentiment: funding?.sentiment ?? 'Neutral',
    };
  } catch { return null; }
}

// ── Helper: fetch MPE pressures ─────────────────────────────────────────
export async function fetchMPE(symbol: string, assetClass: string, tcData?: TimeConfluenceData | null): Promise<MPEData | null> {
  try {
    const timePressure: Partial<TimePressureInput> = {};
    // Use pre-fetched time confluence data if available (avoids duplicate scanHierarchical call)
    if (tcData) {
      timePressure.confluenceScore = tcData.confidence ?? 0;
      timePressure.activeTFCount = tcData.scoreBreakdown?.activeTFs ?? 0;
      timePressure.decompressionActiveCount = tcData.decompression?.activeCount ?? 0;
      timePressure.midpointDebtCount = tcData.mid50Levels?.length ?? 0;
      timePressure.hotZoneActive = (timePressure.activeTFCount ?? 0) >= 3;
    } else {
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
    }

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

// ── Helper: fetch full Time Confluence scan ─────────────────────────────
export interface TimeConfluenceData {
  confidence: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  banners: string[];
  scoreBreakdown: {
    directionScore: number;
    clusterScore: number;
    decompressionScore: number;
    activeTFs: number;
    hasHigherTF: boolean;
  };
  decompression: {
    activeCount: number;
    clusteredCount: number;
    clusteringRatio: number;
    netPullDirection: 'bullish' | 'bearish' | 'neutral';
    reasoning: string;
    pulls: Array<{ tf: string; minsToClose: number; mid50Level: number; pullDirection: 'up' | 'down' | 'none'; pullStrength: number; distanceToMid50: number }>;
  };
  candleCloseConfluence: {
    confluenceScore: number;
    confluenceRating: string;
    closingNowCount: number;
    closingNowTFs: string[];
    closingSoonCount: number;
    peakConfluenceIn: number;
    bestEntryWindow: { startMins: number; endMins: number; reason: string };
    isMonthEnd: boolean;
    isWeekEnd: boolean;
  };
  mid50Levels: Array<{ tf: string; level: number; distance: number; isDecompressing: boolean }>;
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reasoning: string;
    targetLevel: number;
    expectedMoveTime: string;
  };
  closeSchedule: Array<{
    tf: string;
    tfMinutes: number;
    nextCloseAt: string;
    minsToClose: number;
    weight: number;
    mid50Level: number | null;
    distanceToMid50: number | null;
    pullDirection: 'up' | 'down' | 'none' | null;
    category: 'intraday' | 'daily' | 'weekly' | 'monthly';
  }>;
  decompressionTarget: {
    price: number;
    direction: 'up' | 'down' | 'flat';
    totalWeight: number;
    contributingTFs: string[];
  } | null;
}

export async function fetchTimeConfluence(symbol: string): Promise<TimeConfluenceData | null> {
  try {
    const scan = await confluenceLearningAgent.scanHierarchical(symbol, 'intraday_1h' as ScanMode, 'extended' as SessionMode);
    if (!scan) return null;

    const activePulls = scan.decompression.decompressions
      .filter(d => d.isDecompressing)
      .map(d => ({
        tf: d.tf,
        minsToClose: d.minsToClose,
        mid50Level: d.mid50Level,
        pullDirection: d.pullDirection,
        pullStrength: d.pullStrength,
        distanceToMid50: d.distanceToMid50,
      }));

    // ── Build close schedule from ALL TFs (not limited by scan mode) ──
    const categorizeTF = (tfMins: number): 'intraday' | 'daily' | 'weekly' | 'monthly' => {
      if (tfMins < 1440) return 'intraday';
      if (tfMins < 10080) return 'daily';
      if (tfMins < 43200) return 'weekly';
      return 'monthly';
    };

    // Include ALL TFs from the close schedule — filter to those closing within 24h
    const MAX_MINS = 1440; // 24 hours
    const closeSchedule = scan.candleCloseConfluence.closes
      .filter(row => row.minsToClose <= MAX_MINS && row.minsToClose >= 0)
      .map(row => ({
        tf: row.tf,
        tfMinutes: row.tfMinutes,
        nextCloseAt: row.nextCloseAt,
        minsToClose: row.minsToClose,
        weight: row.weight,
        mid50Level: row.mid50Level ?? null,
        distanceToMid50: row.distanceToMid50 ?? null,
        pullDirection: row.pullDirection ?? null,
        category: categorizeTF(row.tfMinutes),
      }));

    // ── Compute weighted decompression target from ALL mid-50 levels ──
    const withMid50 = closeSchedule.filter(r => r.mid50Level && r.mid50Level > 0);
    let decompressionTarget: TimeConfluenceData['decompressionTarget'] = null;
    if (withMid50.length >= 1) {
      let weightedSum = 0;
      let totalWeight = 0;
      let bullWeight = 0;
      let bearWeight = 0;
      const contributingTFs: string[] = [];
      for (const row of withMid50) {
        weightedSum += row.mid50Level! * row.weight;
        totalWeight += row.weight;
        contributingTFs.push(row.tf);
        if (row.pullDirection === 'up') bullWeight += row.weight;
        else if (row.pullDirection === 'down') bearWeight += row.weight;
      }
      const targetPrice = totalWeight > 0 ? weightedSum / totalWeight : 0;
      decompressionTarget = {
        price: targetPrice,
        direction: bullWeight > bearWeight * 1.2 ? 'up' : bearWeight > bullWeight * 1.2 ? 'down' : 'flat',
        totalWeight,
        contributingTFs,
      };
    }

    return {
      confidence: scan.prediction.confidence,
      direction: scan.prediction.direction,
      signalStrength: scan.signalStrength,
      banners: scan.scoreBreakdown.banners,
      scoreBreakdown: {
        directionScore: scan.scoreBreakdown.directionScore,
        clusterScore: scan.scoreBreakdown.clusterScore,
        decompressionScore: scan.scoreBreakdown.decompressionScore,
        activeTFs: scan.scoreBreakdown.activeTFs,
        hasHigherTF: scan.scoreBreakdown.hasHigherTF,
      },
      decompression: {
        activeCount: scan.decompression.activeCount,
        clusteredCount: scan.decompression.clusteredCount,
        clusteringRatio: scan.decompression.clusteringRatio,
        netPullDirection: scan.decompression.netPullDirection,
        reasoning: scan.decompression.reasoning,
        pulls: activePulls,
      },
      candleCloseConfluence: {
        confluenceScore: scan.candleCloseConfluence.confluenceScore,
        confluenceRating: scan.candleCloseConfluence.confluenceRating,
        closingNowCount: scan.candleCloseConfluence.closingNow.count,
        closingNowTFs: scan.candleCloseConfluence.closingNow.timeframes,
        closingSoonCount: scan.candleCloseConfluence.closingSoon.count,
        peakConfluenceIn: scan.candleCloseConfluence.closingSoon.peakConfluenceIn,
        bestEntryWindow: scan.candleCloseConfluence.bestEntryWindow,
        isMonthEnd: scan.candleCloseConfluence.specialEvents.isMonthEnd,
        isWeekEnd: scan.candleCloseConfluence.specialEvents.isWeekEnd,
      },
      mid50Levels: scan.mid50Levels.slice(0, 8),
      prediction: scan.prediction,
      closeSchedule,
      decompressionTarget,
    };
  } catch { return null; }
}

// ── Macro regime fetch (reuses /api/economic-indicators logic) ───────
export interface MacroRegime {
  riskState: 'risk_on' | 'neutral' | 'risk_off';
  riskLevel: 'low' | 'medium' | 'high';
  concerns: string[];
}

const macroCache: { data: MacroRegime | null; ts: number } = { data: null, ts: 0 };
const MACRO_CACHE_TTL = 60 * 60 * 1000; // 1 hour (macro data is slow-moving)

export async function fetchMacroRegime(): Promise<MacroRegime | null> {
  const now = Date.now();
  if (macroCache.data && now - macroCache.ts < MACRO_CACHE_TTL) return macroCache.data;

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  try {
    // Fetch two key signals: 10Y yield + Fed Funds + Inflation
    const indicators = [
      { func: 'TREASURY_YIELD', maturity: '10year' },
      { func: 'TREASURY_YIELD', maturity: '2year' },
      { func: 'INFLATION' },
    ];

    const values: Record<string, number | null> = {};
    for (const ind of indicators) {
      let url = `https://www.alphavantage.co/query?function=${ind.func}&apikey=${apiKey}`;
      if (ind.maturity) url += `&maturity=${ind.maturity}`;
      await avTakeToken();
      const res = await fetch(url);
      const json = await res.json();
      const val = json?.data?.[0]?.value ? parseFloat(json.data[0].value) : null;
      values[ind.func + (ind.maturity || '')] = val;
      await new Promise(r => setTimeout(r, 250));
    }

    const t10y = values['TREASURY_YIELD10year'];
    const t2y = values['TREASURY_YIELD2year'];
    const inflation = values['INFLATION'];
    const yieldCurve = t10y != null && t2y != null ? t10y - t2y : null;

    const concerns: string[] = [];
    if (yieldCurve != null && yieldCurve < 0) concerns.push('Inverted yield curve');
    if (inflation != null && inflation > 4) concerns.push('Elevated inflation');
    if (t10y != null && t10y > 5) concerns.push('High interest rates');

    let riskLevel: MacroRegime['riskLevel'] = 'medium';
    let riskState: MacroRegime['riskState'] = 'neutral';
    if (concerns.length >= 3) { riskLevel = 'high'; riskState = 'risk_off'; }
    else if (concerns.length === 0 && inflation != null && inflation < 3) { riskLevel = 'low'; riskState = 'risk_on'; }

    const result: MacroRegime = { riskState, riskLevel, concerns };
    macroCache.data = result;
    macroCache.ts = now;
    return result;
  } catch (err) {
    console.warn('[fetchMacroRegime] Error:', err instanceof Error ? err.message : err);
    return null;
  }
}
