import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';
import { calculateAllIndicators } from '@/lib/indicators';

/**
 * GET /api/bars?symbol=AAPL&timeframe=daily&limit=50
 *
 * Returns OHLCV bars + computed chart overlays (EMA-200, RSI, MACD)
 * from cache (Redis → DB). Does NOT call Alpha Vantage — zero API cost.
 *
 * Response shape matches the ChartData interface in PriceChart:
 * { ok, candles[], ema200[], rsi[], macd[], source }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').toUpperCase().trim();
  const timeframe = searchParams.get('timeframe') || 'daily';
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'Missing symbol' }, { status: 400 });
  }

  // 1. Try Redis cache first
  const cacheKey = `chartBars:${symbol}:${timeframe}:${limit}`;
  const cached = await getCached<any>(cacheKey);
  if (cached) {
    return NextResponse.json({ ok: true, ...cached, source: 'redis' });
  }

  // 2. Read bars from DB (written by worker's upsertBars)
  try {
    const rows = await q<{
      ts: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>(
      `SELECT ts, open, high, low, close, volume
       FROM ohlcv_bars
       WHERE symbol = $1 AND timeframe = $2
       ORDER BY ts DESC
       LIMIT $3`,
      [symbol, timeframe, limit]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'No bars cached for this symbol' }, { status: 404 });
    }

    // Reverse to oldest-first for charting
    const sorted = rows.reverse();

    // Build candle array
    const candles = sorted.map(r => ({
      t: typeof r.ts === 'string' ? r.ts.slice(0, 10) : new Date(r.ts).toISOString().slice(0, 10),
      o: Number(r.open),
      h: Number(r.high),
      l: Number(r.low),
      c: Number(r.close),
    }));

    // Compute chart indicators from the bars
    const ohlcvBars = sorted.map(r => ({
      timestamp: typeof r.ts === 'string' ? r.ts : new Date(r.ts).toISOString(),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume) || 0,
    }));

    const indicators = calculateAllIndicators(ohlcvBars);

    // Build ema200 array (length = candles.length, NaN where insufficient data)
    // calculateAllIndicators returns the latest value; for a full array we need to compute from closes
    const closes = ohlcvBars.map(b => b.close);
    const highs = ohlcvBars.map(b => b.high);
    const lows = ohlcvBars.map(b => b.low);

    // Simple EMA calculation for chart array
    const ema200Arr = computeEmaArray(closes, 200);

    // RSI array
    const rsiArr = computeRsiArray(closes, 14);

    // MACD arrays
    const macdResult = computeMacdArrays(closes, 12, 26, 9);

    const payload = {
      candles,
      ema200: ema200Arr,
      rsi: rsiArr,
      macd: macdResult,
    };

    // Cache for 5 min (bars don't change fast)
    await setCached(cacheKey, payload, CACHE_TTL.bars);

    return NextResponse.json({ ok: true, ...payload, source: 'database' });
  } catch (err: any) {
    console.error('[bars] DB error:', err?.message || err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

// ── Indicator helpers (compute full arrays for charting) ──────────────────

function computeEmaArray(closes: number[], period: number): number[] {
  const result: number[] = [];
  if (closes.length === 0) return result;

  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      // Not enough data yet — use SMA of first `period` values once we get there
      ema = closes.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1);
      result.push(i < period - 1 ? NaN : ema);
    } else if (i === period - 1) {
      ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
      result.push(ema);
    } else {
      ema = (closes[i] - ema) * k + ema;
      result.push(ema);
    }
  }
  return result;
}

function computeRsiArray(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
}

function computeMacdArrays(
  closes: number[],
  fast: number,
  slow: number,
  signal: number,
): { macd: number; signal: number; hist: number }[] {
  const emaFast = computeEmaArray(closes, fast);
  const emaSlow = computeEmaArray(closes, slow);

  const macdLine = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return Number.isFinite(f) && Number.isFinite(s) ? f - s : 0;
  });

  // Signal line = EMA of MACD line
  const signalLine = computeEmaArray(macdLine, signal);

  return closes.map((_, i) => ({
    macd: Number.isFinite(macdLine[i]) ? macdLine[i] : 0,
    signal: Number.isFinite(signalLine[i]) ? signalLine[i] : 0,
    hist: Number.isFinite(macdLine[i]) && Number.isFinite(signalLine[i])
      ? macdLine[i] - signalLine[i]
      : 0,
  }));
}
