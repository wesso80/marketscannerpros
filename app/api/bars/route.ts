import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';
import { calculateAllIndicators } from '@/lib/indicators';
import { getSessionFromCookie } from '@/lib/auth';
import { avTryToken } from '@/lib/avRateGovernor';

/**
 * GET /api/bars?symbol=AAPL&timeframe=daily&limit=50
 *
 * Returns OHLCV bars + computed chart overlays (EMA-200, RSI, MACD)
 * from cache (Redis → DB → Alpha Vantage fallback).
 *
 * Response shape matches the ChartData interface in PriceChart:
 * { ok, candles[], ema200[], rsi[], macd[], source }
 */
export async function GET(req: NextRequest) {
  // Auth guard: AV license requires authenticated users only
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Please log in to access market data' }, { status: 401 });
  }

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
      // DB empty — try Alpha Vantage as fallback
      return fetchFromAVFallback(symbol, timeframe, limit, cacheKey);
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
    // DB error — try AV fallback
    return fetchFromAVFallback(symbol, timeframe, limit, cacheKey);
  }
}

// ── Alpha Vantage fallback when ohlcv_bars is empty ─────────────────────

async function fetchFromAVFallback(
  symbol: string,
  timeframe: string,
  limit: number,
  cacheKey: string,
): Promise<NextResponse> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
  if (!apiKey || !(await avTryToken())) {
    return NextResponse.json({ ok: false, error: 'No bars available for this symbol' }, { status: 404 });
  }

  try {
    console.log(`[bars] AV fallback for ${symbol}`);
    const url = timeframe === 'daily'
      ? `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${apiKey}`
      : `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=60min&outputsize=compact&entitlement=realtime&apikey=${apiKey}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'Upstream error' }, { status: 502 });
    }
    const json = await res.json();
    const tsKey = Object.keys(json).find(k => k.startsWith('Time Series ('));
    const ts = tsKey ? json[tsKey] : null;
    if (!ts || Object.keys(ts).length === 0) {
      return NextResponse.json({ ok: false, error: 'No data from provider' }, { status: 404 });
    }

    // Parse candles oldest-first
    const allCandles = Object.entries(ts)
      .map(([date, v]: any) => ({
        t: date.slice(0, 10),
        o: Number(v['1. open']),
        h: Number(v['2. high']),
        l: Number(v['3. low']),
        c: Number(v['4. close']),
        vol: Number(v['5. volume'] ?? v['6. volume'] ?? 0),
      }))
      .filter(c => Number.isFinite(c.c))
      .sort((a, b) => a.t.localeCompare(b.t));

    const candles = allCandles.slice(-limit);
    const closes = candles.map(c => c.c);

    const payload = {
      candles: candles.map(c => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
      ema200: computeEmaArray(closes, 200),
      rsi: computeRsiArray(closes, 14),
      macd: computeMacdArrays(closes, 12, 26, 9),
    };

    // Cache for 10 min
    await setCached(cacheKey, payload, 600).catch(() => {});

    // Store to ohlcv_bars in background so next request comes from DB
    storeBarsToDB(symbol, timeframe, allCandles).catch(() => {});

    return NextResponse.json({ ok: true, ...payload, source: 'alpha-vantage' });
  } catch (err: any) {
    console.error('[bars] AV fallback error:', err?.message || err);
    return NextResponse.json({ ok: false, error: 'No bars available' }, { status: 404 });
  }
}

async function storeBarsToDB(
  symbol: string,
  timeframe: string,
  candles: { t: string; o: number; h: number; l: number; c: number; vol: number }[],
): Promise<void> {
  if (!candles.length) return;
  // Batch insert up to 50
  const batch = candles.slice(-50);
  const values: string[] = [];
  const params: any[] = [];
  let idx = 1;
  for (const c of batch) {
    values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`);
    params.push(symbol, timeframe, c.t, c.o, c.h, c.l, c.c, c.vol);
    idx += 8;
  }
  await q(
    `INSERT INTO ohlcv_bars (symbol, timeframe, ts, open, high, low, close, volume)
     VALUES ${values.join(',')}
     ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
       open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
       close = EXCLUDED.close, volume = EXCLUDED.volume`,
    params
  );
  console.log(`[bars] Stored ${batch.length} bars for ${symbol}/${timeframe}`);
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
