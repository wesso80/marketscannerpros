/**
 * Top Cached Symbols API
 *
 * @route GET /api/scanner/top-cached?type=equity|crypto&limit=10
 * @description Returns top symbols ranked by a lightweight score computed
 *              from worker-populated quotes_latest + indicators_latest tables.
 *              Pure DB read — zero Alpha Vantage API calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export const runtime = 'nodejs';

/* Crypto symbol detection */
const CRYPTO_SYMBOLS = new Set([
  'BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','DOT','MATIC',
  'LINK','UNI','LTC','ATOM','NEAR','APT','OP','ARB','FIL','INJ',
  'BTCUSD','ETHUSD','SOLUSD','BNBUSD','XRPUSD','DOGEUSD',
]);

function isCrypto(sym: string): boolean {
  const s = sym.toUpperCase();
  if (CRYPTO_SYMBOLS.has(s)) return true;
  if (s.endsWith('USD') && !['AUDUSD','EURUSD','NZDUSD','GBPUSD','USDCAD','USDJPY','USDCHF'].includes(s)) return true;
  return false;
}

/* Simple score from cached indicators (0–100 scale) */
function computeQuickScore(row: Record<string, unknown>): { score: number; direction: string } {
  let bullish = 0;
  let bearish = 0;

  const rsi = Number(row.rsi14) || 0;
  const macdHist = Number(row.macd_hist) || 0;
  const adx = Number(row.adx14) || 0;
  const price = Number(row.price) || 0;
  const ema200 = Number(row.ema200) || 0;
  const stochK = Number(row.stoch_k) || 0;
  const changePct = Number(row.change_percent) || 0;

  // RSI momentum
  if (rsi > 50 && rsi < 70) bullish += 15;
  else if (rsi >= 70) bullish += 5;  // overbought = less upside
  else if (rsi < 30) bullish += 10;  // oversold bounce
  else if (rsi < 50) bearish += 10;

  // MACD histogram direction
  if (macdHist > 0) bullish += 15;
  else if (macdHist < 0) bearish += 15;

  // Trend: price vs EMA200
  if (ema200 > 0) {
    if (price > ema200) bullish += 20;
    else bearish += 20;
  }

  // ADX trend strength
  if (adx > 25) bullish += 10;  // strong trend
  else bearish += 5;

  // Stochastic
  if (stochK > 20 && stochK < 80) bullish += 10;
  else bearish += 5;

  // Recent change
  if (changePct > 0) bullish += 5;
  else if (changePct < 0) bearish += 5;

  const total = bullish + bearish || 1;
  const score = Math.round((bullish / total) * 100);
  const direction = bullish > bearish ? 'bullish' : bullish < bearish ? 'bearish' : 'neutral';

  return { score, direction };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'all'; // 'equity', 'crypto', or 'all'
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10', 10), 1), 30);

  try {
    // Join quotes + indicators + symbol_universe — only enabled symbols with fresh data
    const rows = await q<Record<string, unknown>>(`
      SELECT
        ql.symbol,
        ql.price,
        ql.change_amount,
        ql.change_percent,
        ql.volume,
        ql.latest_trading_day,
        ql.fetched_at,
        il.rsi14,
        il.macd_hist,
        il.ema200,
        il.adx14,
        il.stoch_k,
        il.atr14,
        il.macd_line,
        il.macd_signal
      FROM quotes_latest ql
      INNER JOIN indicators_latest il
        ON ql.symbol = il.symbol AND il.timeframe = 'daily'
      INNER JOIN symbol_universe su
        ON ql.symbol = su.symbol AND su.enabled = true
      WHERE ql.price IS NOT NULL
        AND ql.price > 0
        AND il.rsi14 IS NOT NULL
      ORDER BY ql.fetched_at DESC NULLS LAST
      LIMIT 200
    `);

    // Determine staleness — warn if oldest row used is > 2 hours old
    const now = Date.now();
    const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
    const newestFetchedAt = rows[0]?.fetched_at ? new Date(rows[0].fetched_at as string).getTime() : 0;
    const ageMs = newestFetchedAt ? now - newestFetchedAt : Infinity;
    const stale = ageMs > STALE_THRESHOLD_MS;

    // Score and classify
    const results: Array<{
      symbol: string;
      score: number;
      direction: string;
      price: number;
      changePct: number;
      rsi: number;
      adx: number;
      type: string;
    }> = [];

    for (const row of rows) {
      const sym = String(row.symbol);
      const isCr = isCrypto(sym);
      const assetType = isCr ? 'crypto' : 'equity';

      if (type !== 'all' && type !== assetType) continue;

      const { score, direction } = computeQuickScore(row);

      results.push({
        symbol: sym,
        score,
        direction,
        price: Number(row.price) || 0,
        changePct: Number(row.change_percent) || 0,
        rsi: Number(row.rsi14) || 0,
        adx: Number(row.adx14) || 0,
        type: assetType,
      });
    }

    // Sort by score descending, take top N
    results.sort((a, b) => b.score - a.score);

    const equity = results.filter(r => r.type === 'equity').slice(0, limit);
    const crypto = results.filter(r => r.type === 'crypto').slice(0, limit);

    return NextResponse.json({
      success: true,
      equity,
      crypto,
      source: 'worker_cache',
      cached_at: rows[0]?.fetched_at || null,
      stale,
      age_minutes: newestFetchedAt ? Math.round(ageMs / 60000) : null,
    });
  } catch (err) {
    console.error('[top-cached] Error:', err);
    return NextResponse.json({
      success: false,
      equity: [],
      crypto: [],
      source: 'error',
    }, { status: 500 });
  }
}
