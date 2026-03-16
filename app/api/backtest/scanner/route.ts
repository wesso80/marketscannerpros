/**
 * Scanner Backtest API
 *
 * @route POST /api/backtest/scanner
 * @description Run a historical backtest using the Market Scanner's scoring logic.
 *              Fetches OHLCV data via the existing backtest providers (Alpha Vantage
 *              for equities, CoinGecko for crypto) and walks through it bar-by-bar,
 *              generating trades when the scanner score crosses the threshold.
 *
 * @body {string}  symbol          – Ticker (e.g. "AAPL", "BTC")
 * @body {string}  startDate       – YYYY-MM-DD
 * @body {string}  endDate         – YYYY-MM-DD
 * @body {number}  initialCapital  – Starting equity (default 10000)
 * @body {number}  minScore        – Score threshold 0-100 (default 55)
 * @body {number}  stopMultiplier  – ATR × N for stop (default 1.5)
 * @body {number}  targetMultiplier – ATR × N for target (default 3.0)
 * @body {number}  maxHoldBars     – Max bars in a trade (default 20)
 * @body {boolean} allowShorts     – Enable short trades (default true)
 * @body {string}  timeframe       – "daily" | "60min" | "30min" (default "daily")
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { logger } from '@/lib/logger';
import { createRateLimiter, getClientIP } from '@/lib/rateLimit';
import { fetchPriceData, isCryptoSymbol, normalizeSymbol } from '@/lib/backtest/providers';
import { computeCoverage } from '@/lib/backtest/timeframe';
import { runScannerBacktest } from '@/lib/backtest/scannerBacktest';
import { verifyCronAuth } from '@/lib/adminAuth';

const limiter = createRateLimiter('backtest_scanner', { windowMs: 60_000, max: 8 });

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = limiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait.', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      );
    }

    // Auth + tier gate
    const isCron = verifyCronAuth(req);
    if (!isCron) {
      const session = await getSessionFromCookie();
      if (!session?.workspaceId) {
        return NextResponse.json({ error: 'Please log in to use Backtesting' }, { status: 401 });
      }
      if (!hasProTraderAccess(session.tier)) {
        return NextResponse.json({ error: 'Pro Trader subscription required' }, { status: 403 });
      }
    }

    const body = await req.json();
    const {
      symbol: rawSymbol,
      startDate,
      endDate,
      initialCapital = 10_000,
      minScore = 55,
      stopMultiplier = 1.5,
      targetMultiplier = 3.0,
      maxHoldBars = 20,
      allowShorts = true,
      timeframe = 'daily',
    } = body;

    if (!rawSymbol || !startDate || !endDate) {
      return NextResponse.json({ error: 'symbol, startDate, and endDate are required' }, { status: 400 });
    }

    const isCrypto = isCryptoSymbol(rawSymbol);
    const symbol = isCrypto ? normalizeSymbol(rawSymbol) : rawSymbol.toUpperCase();

    logger.info('Scanner backtest started', { symbol, startDate, endDate, timeframe, minScore });

    // Fetch OHLCV
    const { priceData, source } = await fetchPriceData(symbol, timeframe, startDate, endDate);
    const coverage = computeCoverage(priceData, startDate, endDate);

    // Convert to sorted bars array
    const bars = Object.entries(priceData)
      .map(([date, bar]) => ({ date, ...bar }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (bars.length < 230) {
      return NextResponse.json(
        { error: `Insufficient data: only ${bars.length} bars available (need ≥ 230 for EMA200 warmup + 30 bars of trading)` },
        { status: 400 },
      );
    }

    // Run the scanner backtest engine
    const result = runScannerBacktest({
      symbol,
      bars,
      initialCapital,
      minScore: Math.max(50, Math.min(95, Number(minScore) || 55)),
      stopMultiplier: Math.max(0.5, Math.min(5, Number(stopMultiplier) || 1.5)),
      targetMultiplier: Math.max(1, Math.min(10, Number(targetMultiplier) || 3.0)),
      maxHoldBars: Math.max(3, Math.min(100, Number(maxHoldBars) || 20)),
      allowShorts: allowShorts !== false,
    });

    logger.info('Scanner backtest completed', {
      symbol,
      trades: result.totalTrades,
      winRate: result.winRate,
      totalReturn: result.totalReturn,
    });

    return NextResponse.json({
      success: true,
      ...result,
      dataCoverage: {
        requested: { startDate, endDate },
        applied: { startDate: coverage.appliedStartDate, endDate: coverage.appliedEndDate },
        bars: coverage.bars,
        provider: source,
      },
    });
  } catch (error: any) {
    logger.error('Scanner backtest error', { error: error?.message, stack: error?.stack });
    return NextResponse.json({ error: error?.message || 'Scanner backtest failed' }, { status: 500 });
  }
}
