/**
 * Scalper API — 5/15min Intraday Scalping Scanner
 *
 * POST /api/scalper/run
 * Body: { symbols: string[], timeframe: '5min'|'15min', assetClass: 'crypto'|'equity' }
 *
 * Returns scored scalp setups with entry/stop/target levels and all 7 indicator signals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { avTryToken } from '@/lib/avRateGovernor';
import { avCircuit } from '@/lib/circuitBreaker';
import { getCachedBarsOnly, setCachedBars } from '@/lib/barCache';
import {
  calculateAllIndicators,
  rsi,
  ema,
  emaSeries,
  macd,
  bollingerBands,
  atr,
  vwap,
  detectSqueeze,
  type OHLCVBar,
  type IndicatorResult,
} from '@/lib/indicators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ScalpTimeframe = '5min' | '15min';
type AssetClass = 'crypto' | 'equity';

/* ─── Default Watchlists ─── */
const DEFAULT_CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'MATIC', 'DOT'];
const DEFAULT_EQUITY = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'SPY', 'QQQ'];

const AV_KEY = () => process.env.ALPHA_VANTAGE_API_KEY || '';

/* ─────────────────────────── AV Fetchers ─────────────────────────── */

async function fetchEquityIntraday(
  symbol: string,
  interval: ScalpTimeframe,
): Promise<OHLCVBar[] | null> {
  const cached = getCachedBarsOnly(symbol, 'equity', interval);
  if (cached) return cached.bars;

  if (!AV_KEY()) return null;
  if (!(await avTryToken())) return null;

  const url =
    `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}` +
    `&outputsize=compact&entitlement=realtime` +
    `&apikey=${AV_KEY()}`;

  try {
    const res = await avCircuit.call(() =>
      fetch(url, { signal: AbortSignal.timeout(15_000) }),
    );
    if (!res.ok) return null;
    const json = await res.json();
    const tsKey = `Time Series (${interval})`;
    const bars = parseTimeSeries(json[tsKey]);
    if (bars) setCachedBars(symbol, 'equity', interval, bars);
    return bars;
  } catch {
    return null;
  }
}

async function fetchCryptoIntraday(
  symbol: string,
  interval: ScalpTimeframe,
): Promise<OHLCVBar[] | null> {
  const cached = getCachedBarsOnly(symbol, 'crypto', interval);
  if (cached) return cached.bars;

  if (!AV_KEY()) return null;
  if (!(await avTryToken())) return null;

  const base = symbol.replace(/-?USD(T)?$/i, '').toUpperCase();
  const url =
    `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY` +
    `&symbol=${encodeURIComponent(base)}&market=USD` +
    `&interval=${interval}&outputsize=compact` +
    `&apikey=${AV_KEY()}`;

  try {
    const res = await avCircuit.call(() =>
      fetch(url, { signal: AbortSignal.timeout(15_000) }),
    );
    if (!res.ok) return null;
    const json = await res.json();
    const tsKey = Object.keys(json).find((k) => k.includes('Time Series'));
    if (!tsKey) return null;
    const bars = parseTimeSeries(json[tsKey]);
    if (bars) setCachedBars(symbol, 'crypto', interval, bars);
    return bars;
  } catch {
    return null;
  }
}

function parseTimeSeries(
  ts: Record<string, Record<string, string>> | undefined,
): OHLCVBar[] | null {
  if (!ts) return null;
  const bars: OHLCVBar[] = [];
  for (const [timestamp, v] of Object.entries(ts)) {
    bars.push({
      timestamp,
      open: parseFloat(v['1. open'] || '0'),
      high: parseFloat(v['2. high'] || '0'),
      low: parseFloat(v['3. low'] || '0'),
      close: parseFloat(v['4. close'] || '0'),
      volume: Math.round(parseFloat(v['5. volume'] || v['6. volume'] || '0')),
    });
  }
  bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return bars.length >= 20 ? bars : null;
}

/* ─────────────────────────── Signal Engine ─────────────────────────── */

export interface ScalpSignal {
  symbol: string;
  assetClass: AssetClass;
  timeframe: ScalpTimeframe;
  price: number;
  direction: 'long' | 'short' | 'neutral';
  strength: number; // 0-100
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: number;
  signals: {
    emaCross: 'bullish' | 'bearish' | 'neutral';
    emaDetail: string;
    rsi7: number | null;
    rsiSignal: 'overbought' | 'oversold' | 'bullish' | 'bearish' | 'neutral';
    vwapDev: number | null;
    vwapSignal: 'above' | 'below' | 'neutral';
    volSpike: boolean;
    volRatio: number;
    bbSqueeze: boolean;
    bbBreakout: 'upper' | 'lower' | null;
    bbWidth: number | null;
    macdHist: number | null;
    macdSignal: 'bullish' | 'bearish' | 'neutral';
    atr: number | null;
  };
  indicators: IndicatorResult;
  barCount: number;
  lastBar: string;
}

function computeScalpSignals(
  symbol: string,
  bars: OHLCVBar[],
  assetClass: AssetClass,
  timeframe: ScalpTimeframe,
): ScalpSignal {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const latest = bars[bars.length - 1];
  const price = latest.close;

  // Full indicator suite
  const ind = calculateAllIndicators(bars);

  // ── 1. EMA Crossovers (5/13/21) ──
  const ema5 = ema(closes, 5);
  const ema13 = ema(closes, 13);
  const ema21 = ema(closes, 21);

  let emaCross: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let emaDetail = 'No clear alignment';
  if (ema5 != null && ema13 != null && ema21 != null) {
    if (ema5 > ema13 && ema13 > ema21) {
      emaCross = 'bullish';
      emaDetail = `EMA 5 > 13 > 21 — bullish stack`;
    } else if (ema5 < ema13 && ema13 < ema21) {
      emaCross = 'bearish';
      emaDetail = `EMA 5 < 13 < 21 — bearish stack`;
    } else if (ema5 > ema13) {
      emaCross = 'bullish';
      emaDetail = `EMA 5 crossing above 13`;
    } else if (ema5 < ema13) {
      emaCross = 'bearish';
      emaDetail = `EMA 5 crossing below 13`;
    }
  }

  // ── 2. RSI (7-period for scalping) ──
  const rsi7 = rsi(closes, 7);
  let rsiSignal: 'overbought' | 'oversold' | 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (rsi7 != null) {
    if (rsi7 > 80) rsiSignal = 'overbought';
    else if (rsi7 < 20) rsiSignal = 'oversold';
    else if (rsi7 > 55) rsiSignal = 'bullish';
    else if (rsi7 < 45) rsiSignal = 'bearish';
  }

  // ── 3. VWAP Deviation ──
  const vwapVal = vwap(bars);
  let vwapDev: number | null = null;
  let vwapSignal: 'above' | 'below' | 'neutral' = 'neutral';
  if (vwapVal != null && vwapVal > 0) {
    vwapDev = ((price - vwapVal) / vwapVal) * 100;
    if (vwapDev > 0.1) vwapSignal = 'above';
    else if (vwapDev < -0.1) vwapSignal = 'below';
  }

  // ── 4. Volume Spike ──
  const avgVol20 =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : volumes.reduce((a, b) => a + b, 0) / Math.max(1, volumes.length);
  const volRatio = avgVol20 > 0 ? latest.volume / avgVol20 : 1;
  const volSpike = volRatio > 1.8;

  // ── 5. Bollinger Bands Squeeze/Breakout ──
  const bb = bollingerBands(closes, 20, 2);
  let bbSqueeze = false;
  let bbBreakout: 'upper' | 'lower' | null = null;
  let bbWidth: number | null = null;
  if (bb) {
    bbWidth = bb.middle > 0 ? ((bb.upper - bb.lower) / bb.middle) * 100 : null;
    // Squeeze: width < 3% of middle band
    if (bbWidth != null && bbWidth < 3) bbSqueeze = true;
    if (price > bb.upper) bbBreakout = 'upper';
    else if (price < bb.lower) bbBreakout = 'lower';
  }

  // Also check squeeze detector
  const squeezeResult = detectSqueeze(bars);
  if (squeezeResult?.inSqueeze) bbSqueeze = true;

  // ── 6. MACD Histogram ──
  const macdResult = macd(closes, 12, 26, 9);
  let macdHist: number | null = null;
  let macdSig: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (macdResult) {
    macdHist = macdResult.histogram;
    // Check current vs prev histogram for momentum direction
    const prevCloses = closes.slice(0, -1);
    const prevMacd = macd(prevCloses, 12, 26, 9);
    if (prevMacd) {
      if (macdResult.histogram > 0 && macdResult.histogram > prevMacd.histogram) {
        macdSig = 'bullish';
      } else if (macdResult.histogram < 0 && macdResult.histogram < prevMacd.histogram) {
        macdSig = 'bearish';
      } else if (macdResult.histogram > prevMacd.histogram) {
        macdSig = 'bullish';
      } else if (macdResult.histogram < prevMacd.histogram) {
        macdSig = 'bearish';
      }
    }
  }

  // ── 7. ATR-based Stops & Targets ──
  const atrVal = atr(bars, 14);
  const atrMultStop = 1.5;
  const atrMultT1 = 2.0;
  const atrMultT2 = 3.5;

  // ── Composite Score ──
  let bullPoints = 0;
  let bearPoints = 0;

  // EMA (weight: 20)
  if (emaCross === 'bullish') bullPoints += 20;
  else if (emaCross === 'bearish') bearPoints += 20;

  // RSI (weight: 15)
  if (rsiSignal === 'bullish') bullPoints += 15;
  else if (rsiSignal === 'bearish') bearPoints += 15;
  else if (rsiSignal === 'overbought') bearPoints += 10;
  else if (rsiSignal === 'oversold') bullPoints += 10;

  // VWAP (weight: 15)
  if (vwapSignal === 'above') bullPoints += 15;
  else if (vwapSignal === 'below') bearPoints += 15;

  // Volume (weight: 15)
  if (volSpike) {
    // Volume confirms direction
    if (latest.close > latest.open) bullPoints += 15;
    else bearPoints += 15;
  }

  // BB (weight: 15)
  if (bbBreakout === 'upper') bullPoints += 15;
  else if (bbBreakout === 'lower') bearPoints += 15;
  else if (bbSqueeze) bullPoints += 5; // potential breakout coming

  // MACD (weight: 20)
  if (macdSig === 'bullish') bullPoints += 20;
  else if (macdSig === 'bearish') bearPoints += 20;

  // Direction & strength
  const netScore = bullPoints - bearPoints;
  const strength = Math.min(100, Math.max(0, Math.abs(netScore)));
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  if (netScore >= 15) direction = 'long';
  else if (netScore <= -15) direction = 'short';

  // Entry/Stop/Target (ATR-based)
  let entry = price;
  let stop = price;
  let target1 = price;
  let target2 = price;
  let riskReward = 0;

  if (atrVal != null && atrVal > 0) {
    if (direction === 'long') {
      entry = price;
      stop = price - atrVal * atrMultStop;
      target1 = price + atrVal * atrMultT1;
      target2 = price + atrVal * atrMultT2;
    } else if (direction === 'short') {
      entry = price;
      stop = price + atrVal * atrMultStop;
      target1 = price - atrVal * atrMultT1;
      target2 = price - atrVal * atrMultT2;
    }
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target1 - entry);
    riskReward = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  }

  return {
    symbol,
    assetClass,
    timeframe,
    price,
    direction,
    strength,
    entry: round6(entry),
    stop: round6(stop),
    target1: round6(target1),
    target2: round6(target2),
    riskReward,
    signals: {
      emaCross,
      emaDetail,
      rsi7: rsi7 != null ? Math.round(rsi7 * 100) / 100 : null,
      rsiSignal,
      vwapDev: vwapDev != null ? Math.round(vwapDev * 100) / 100 : null,
      vwapSignal,
      volSpike,
      volRatio: Math.round(volRatio * 100) / 100,
      bbSqueeze,
      bbBreakout,
      bbWidth: bbWidth != null ? Math.round(bbWidth * 100) / 100 : null,
      macdHist: macdHist != null ? Math.round(macdHist * 10000) / 10000 : null,
      macdSignal: macdSig,
      atr: atrVal != null ? round6(atrVal) : null,
    },
    indicators: ind,
    barCount: bars.length,
    lastBar: latest.timestamp as string,
  };
}

function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

/* ─────────────────────────── POST Handler ─────────────────────────── */

export async function POST(req: NextRequest) {
  // Auth
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const ip = getClientIP(req);
  const rl = apiLimiter.check(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  // Parse body
  let body: { symbols?: string[]; timeframe?: string; assetClass?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const timeframe: ScalpTimeframe =
    body.timeframe === '15min' ? '15min' : '5min';
  const assetClass: AssetClass =
    body.assetClass === 'equity' ? 'equity' : 'crypto';

  // Sanitise symbols (max 10)
  let symbols = Array.isArray(body.symbols)
    ? body.symbols
        .map((s) => String(s).toUpperCase().trim())
        .filter((s) => /^[A-Z0-9.]{1,10}$/.test(s))
        .slice(0, 10)
    : assetClass === 'crypto'
      ? DEFAULT_CRYPTO
      : DEFAULT_EQUITY;

  if (symbols.length === 0) {
    symbols = assetClass === 'crypto' ? DEFAULT_CRYPTO : DEFAULT_EQUITY;
  }

  const fetcher =
    assetClass === 'crypto' ? fetchCryptoIntraday : fetchEquityIntraday;

  // Fetch bars & compute in parallel (3 at a time to respect AV rate)
  const results: ScalpSignal[] = [];
  const errors: string[] = [];

  const chunks = chunkArray(symbols, 3);
  for (const chunk of chunks) {
    const settled = await Promise.allSettled(
      chunk.map(async (sym) => {
        const bars = await fetcher(sym, timeframe);
        if (!bars) throw new Error(`No data for ${sym}`);
        return computeScalpSignals(sym, bars, assetClass, timeframe);
      }),
    );
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === 'fulfilled') results.push(s.value);
      else errors.push(chunk[i]);
    }
  }

  // Sort by strength descending
  results.sort((a, b) => b.strength - a.strength);

  return NextResponse.json({
    ok: true,
    timeframe,
    assetClass,
    scanned: symbols.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
