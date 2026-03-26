/**
 * Liquidity Sweep Scanner API — /api/liquidity-sweep
 *
 * POST — Scans a universe of symbols for active liquidity sweep setups.
 *   body: { type: 'equity' | 'crypto' }
 *
 * For each symbol:
 *   1. Fetches daily OHLCV data
 *   2. Computes liquidity levels (PDH/PDL/WEEK_HIGH/WEEK_LOW/EQH/EQL/ROUND)
 *   3. Runs pattern engine sweep detection (wick through level, close back inside)
 *   4. Checks current price proximity to levels (pre-sweep / sitting-at-level setups)
 *
 * Returns array of sweep events sorted by confidence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProAccess } from '@/lib/entitlements';
import { getOHLC, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { avFetch } from '@/lib/avRateGovernor';
import { atr as calcATR, OHLCVBar } from '@/lib/indicators';
import { scanPatterns, type Candle, type DetectedPattern, type KeyLine } from '@/lib/patterns/pattern-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

/* ── Universes ─────────────────────────────────────────────────── */

const EQUITY_SWEEP_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO',
  'JPM', 'V', 'MA', 'BAC', 'GS',
  'UNH', 'JNJ', 'LLY', 'ABBV',
  'WMT', 'PG', 'KO', 'COST', 'HD',
  'CAT', 'BA', 'GE',
  'XOM', 'CVX', 'COP',
  'AMD', 'INTC', 'QCOM', 'MU',
  'NFLX', 'UBER', 'SQ', 'PLTR', 'CRWD',
  'DIS', 'ADBE', 'NOW',
];

const CRYPTO_SWEEP_UNIVERSE = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX',
  'LINK', 'DOT', 'MATIC', 'LTC', 'UNI', 'NEAR', 'ATOM',
  'ARB', 'OP', 'FIL', 'AAVE', 'INJ', 'SUI', 'RUNE', 'FET',
  'PEPE', 'WIF', 'TON', 'TRX', 'PENDLE', 'JUP',
];

/* ── Types ─────────────────────────────────────────────────────── */

interface LiquidityLevel {
  level: number;
  label: string;
}

interface SweepResult {
  symbol: string;
  price: number;
  change24h: number;
  sweepDetected: boolean;
  sweepPattern: DetectedPattern | null;
  nearestLevel: LiquidityLevel | null;
  proximityPct: number;        // how close price is to nearest level (%)
  levels: LiquidityLevel[];
  levelCount: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  setupType: 'active_sweep' | 'near_level' | 'at_level' | 'no_setup';
  atr: number;
  atrPct: number;
  keyLines: KeyLine[];
}

/* ── OHLCV types ──────────────────────────────────────────────── */

interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/* ── Data fetch ───────────────────────────────────────────────── */

async function fetchEquityOHLCV(symbol: string): Promise<OHLCV[] | null> {
  if (!AV_KEY) return null;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${AV_KEY}`;
  const data = await avFetch<any>(url, `SWEEP-DAILY ${symbol}`);
  const ts = data?.['Time Series (Daily)'];
  if (!ts || typeof ts !== 'object') return null;
  const ohlcv: OHLCV[] = Object.entries(ts)
    .map(([date, v]: [string, any]) => ({
      date,
      open: +v['1. open'],
      high: +v['2. high'],
      low: +v['3. low'],
      close: +v['4. close'],
      volume: +v['6. volume'] || +v['5. volume'] || 0,
    }))
    .filter(c => Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return ohlcv.length >= 30 ? ohlcv : null;
}

async function fetchCryptoOHLCV(symbol: string): Promise<OHLCV[] | null> {
  const idMap: Record<string, string> = { ...COINGECKO_ID_MAP };
  const id = idMap[symbol.toUpperCase()];
  if (!id) return null;
  const ohlcData = await getOHLC(id, 30);
  if (!ohlcData || !Array.isArray(ohlcData) || ohlcData.length < 20) return null;
  const ohlcv: OHLCV[] = ohlcData.map((c: number[]) => ({
    date: new Date(c[0]).toISOString().slice(0, 10),
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: 0,
  })).filter(c => Number.isFinite(c.close) && c.close > 0);
  return ohlcv.length >= 20 ? ohlcv : null;
}

/* ── Liquidity levels from candles ────────────────────────────── */

function computeLiquidityLevels(ohlcv: OHLCV[], currentPrice: number): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];
  const n = ohlcv.length;
  if (n < 5) return levels;

  // PDH / PDL — previous day high/low
  const prevDay = ohlcv[n - 2];
  if (prevDay) {
    levels.push({ level: prevDay.high, label: 'PDH' });
    levels.push({ level: prevDay.low, label: 'PDL' });
  }

  // Week high/low — last 5 bars
  const weekSlice = ohlcv.slice(-5);
  const weekHigh = Math.max(...weekSlice.map(c => c.high));
  const weekLow = Math.min(...weekSlice.map(c => c.low));
  levels.push({ level: weekHigh, label: 'WEEK_HIGH' });
  levels.push({ level: weekLow, label: 'WEEK_LOW' });

  // EQH / EQL — equal highs / lows within 0.15%
  const recent = ohlcv.slice(-8);
  for (let i = 0; i < recent.length - 1; i++) {
    const rel_h = Math.abs(recent[i].high - recent[i + 1].high) / Math.max(0.0001, recent[i].high);
    const rel_l = Math.abs(recent[i].low - recent[i + 1].low) / Math.max(0.0001, recent[i].low);
    if (rel_h <= 0.0015) levels.push({ level: (recent[i].high + recent[i + 1].high) / 2, label: 'EQH' });
    if (rel_l <= 0.0015) levels.push({ level: (recent[i].low + recent[i + 1].low) / 2, label: 'EQL' });
  }

  // Round number (psychological level)
  const roundLevel = currentPrice >= 1000
    ? Math.round(currentPrice / 100) * 100
    : currentPrice >= 100
    ? Math.round(currentPrice / 10) * 10
    : currentPrice >= 10
    ? Math.round(currentPrice)
    : Number((Math.round(currentPrice * 10) / 10).toFixed(1));
  const roundDist = Math.abs(currentPrice - roundLevel) / currentPrice;
  if (roundDist < 0.03) levels.push({ level: roundLevel, label: 'ROUND' });

  // Gap detection (previous close vs current open)
  if (n >= 2) {
    const gapPct = Math.abs(ohlcv[n - 1].open - ohlcv[n - 2].close) / ohlcv[n - 2].close;
    if (gapPct >= 0.004) {
      levels.push({ level: ohlcv[n - 2].close, label: 'GAP_REF' });
    }
  }

  // De-duplicate levels that are very close together
  const deduped: LiquidityLevel[] = [];
  const sorted = levels.sort((a, b) => a.level - b.level);
  for (const lev of sorted) {
    const nearby = deduped.find(d => Math.abs(d.level - lev.level) / Math.max(0.0001, d.level) < 0.002);
    if (!nearby) deduped.push(lev);
  }
  return deduped;
}

/* ── Analyze one symbol ───────────────────────────────────────── */

function analyzeSymbol(symbol: string, ohlcv: OHLCV[]): SweepResult | null {
  const n = ohlcv.length;
  if (n < 30) return null;

  const price = ohlcv[n - 1].close;
  const prevPrice = ohlcv[n - 2].close;
  const change24h = ((price - prevPrice) / prevPrice) * 100;

  // Convert to Candle format for pattern engine
  const candles: Candle[] = ohlcv.map(c => ({
    ts: new Date(c.date).getTime(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  // Run full pattern scan (includes detectLiquiditySweep internally)
  const patternResult = scanPatterns({
    candles,
    timeframeLabel: '1d',
    lookback: 120,
  });

  // Find sweep patterns specifically
  const sweepPattern = patternResult.patterns.find(p =>
    p.name.toLowerCase().includes('sweep') || p.name.toLowerCase().includes('liquidity')
  ) || null;

  // Compute liquidity levels
  const levels = computeLiquidityLevels(ohlcv, price);

  // Compute ATR
  const bars: OHLCVBar[] = ohlcv.map(c => ({
    timestamp: c.date,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
  const atrValue = calcATR(bars) ?? price * 0.02;
  const atrPct = (atrValue / price) * 100;

  // Find nearest level & proximity
  let nearestLevel: LiquidityLevel | null = null;
  let proximityPct = Infinity;
  for (const lev of levels) {
    const dist = Math.abs(price - lev.level) / price * 100;
    if (dist < proximityPct) {
      proximityPct = dist;
      nearestLevel = lev;
    }
  }
  if (!Number.isFinite(proximityPct)) proximityPct = 100;

  // Check for active wick-through sweep on today's bar
  const last = ohlcv[n - 1];
  const levelsAbove = levels.filter(l => l.level > price && l.level <= last.high);
  const levelsBelow = levels.filter(l => l.level < price && l.level >= last.low);
  const wickedAbove = levelsAbove.length > 0 && last.close < levelsAbove[0].level;
  const wickedBelow = levelsBelow.length > 0 && last.close > levelsBelow[levelsBelow.length - 1].level;

  // Determine setup classification
  let setupType: SweepResult['setupType'] = 'no_setup';
  let direction: SweepResult['direction'] = 'neutral';
  let confidence = 0;

  if (sweepPattern) {
    // Pattern engine detected a sweep
    setupType = 'active_sweep';
    direction = sweepPattern.bias;
    confidence = sweepPattern.confidence;
  } else if (wickedAbove) {
    // Today's candle wicked above a level then closed below → potential sweep high
    setupType = 'active_sweep';
    direction = 'bearish';
    const wick = last.high - levelsAbove[0].level;
    confidence = Math.min(85, 55 + (wick / atrValue) * 15);
  } else if (wickedBelow) {
    // Today's candle wicked below a level then closed above → potential sweep low
    setupType = 'active_sweep';
    direction = 'bullish';
    const wick = levelsBelow[levelsBelow.length - 1].level - last.low;
    confidence = Math.min(85, 55 + (wick / atrValue) * 15);
  } else if (proximityPct <= 0.3) {
    // Price sitting right at a level (within 0.3%)
    setupType = 'at_level';
    direction = price > (nearestLevel?.level ?? price) ? 'bullish' : 'bearish';
    confidence = 45;
  } else if (proximityPct <= 1.0) {
    // Price approaching a level (within 1%)
    setupType = 'near_level';
    direction = price > (nearestLevel?.level ?? price) ? 'bullish' : 'bearish';
    confidence = 30 + (1 - proximityPct) * 20;
  }

  return {
    symbol,
    price,
    change24h,
    sweepDetected: setupType === 'active_sweep',
    sweepPattern,
    nearestLevel,
    proximityPct: Math.round(proximityPct * 100) / 100,
    levels,
    levelCount: levels.length,
    direction,
    confidence: Math.round(confidence),
    setupType,
    atr: atrValue,
    atrPct: Math.round(atrPct * 100) / 100,
    keyLines: patternResult.keyLines,
  };
}

/* ── Route handler ────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasProAccess(session.tier)) {
    return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
  }

  let body: { type?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const type = body.type === 'crypto' ? 'crypto' : 'equity';
  const universe = type === 'equity' ? EQUITY_SWEEP_UNIVERSE : CRYPTO_SWEEP_UNIVERSE;

  const start = Date.now();
  const fetchFn = type === 'equity' ? fetchEquityOHLCV : fetchCryptoOHLCV;

  // Fetch OHLCV for all symbols (parallelized in batches of 6)
  const results: SweepResult[] = [];
  const batchSize = 6;
  for (let i = 0; i < universe.length; i += batchSize) {
    const batch = universe.slice(i, i + batchSize);
    const fetched = await Promise.all(batch.map(async (sym) => {
      try {
        const ohlcv = await fetchFn(sym);
        if (!ohlcv) return null;
        return analyzeSymbol(sym, ohlcv);
      } catch (err) {
        console.warn(`[liquidity-sweep] ${sym} failed:`, err);
        return null;
      }
    }));
    for (const r of fetched) {
      if (r) results.push(r);
    }
  }

  // Sort: active sweeps first (by confidence), then near-level, then at-level, then no-setup
  const setupPriority: Record<string, number> = {
    active_sweep: 0,
    at_level: 1,
    near_level: 2,
    no_setup: 3,
  };
  results.sort((a, b) => {
    const pa = setupPriority[a.setupType] ?? 9;
    const pb = setupPriority[b.setupType] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.confidence - a.confidence;
  });

  const duration = ((Date.now() - start) / 1000).toFixed(1);

  return NextResponse.json({
    success: true,
    type,
    scanned: results.length,
    sweepCount: results.filter(r => r.sweepDetected).length,
    nearLevelCount: results.filter(r => r.setupType === 'at_level' || r.setupType === 'near_level').length,
    results,
    duration: `${duration}s`,
  });
}
