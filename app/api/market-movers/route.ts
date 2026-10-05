import { NextRequest, NextResponse } from 'next/server';
import { getTopGainersLosers, getMarketData } from '@/lib/coingecko';
import { q } from '@/lib/db';
import { normalizeCryptoMover } from '@/lib/analysis/publicMover';
import { fetchAvTopMovers } from '@/lib/avTopMovers';
import { EQUITY_MOVER_MIN_VOLUME, passesServerMoverFilter } from '@/lib/analysis/moverQuality';
import { isWarmupStatus, momentumAccelFromWarmup, type MomentumBar } from '@/lib/movers/momentumAccel';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

/* ── In-memory cache for last successful response ─────────────────── */
let cachedResponse: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── Alpha Vantage equity movers (realtime, end-of-day fallback: lib/avTopMovers) ── */
const fetchEquityMovers = () => fetchAvTopMovers(ALPHA_VANTAGE_API_KEY);

/* Valid equity ticker: 1-6 uppercase letters only (no ^, digits-only, non-ASCII) */
const VALID_EQ_TICKER = /^[A-Z]{1,6}$/;
/* Valid crypto symbol: 1-12 uppercase alphanumeric (no non-ASCII like 马币) */
const VALID_CRYPTO_TICKER = /^[A-Z0-9]{1,12}$/;

function normalizeAVMover(item: any) {
  // AV returns "143.1034%"; crypto rows are already 2dp — keep both consistent.
  const pct = parseFloat(String(item.change_percentage ?? '0').replace('%', ''));
  return {
    ticker: String(item.ticker || '').toUpperCase(),
    price: String(item.price ?? 0),
    change_amount: String(item.change_amount ?? 0),
    change_percentage: Number.isFinite(pct) ? `${pct.toFixed(2)}%` : '0.00%',
    volume: String(item.volume ?? 0),
    market_cap: '',
    market_cap_rank: '',
    asset_class: 'equity' as const,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const duration = (searchParams.get('duration') || '24h') as '1h' | '24h' | '7d' | '14d' | '30d' | '60d' | '1y';

    const [topMovers, mostActive, equityMovers] = await Promise.all([
      getTopGainersLosers(duration, '1000'),
      getMarketData({
        order: 'volume_desc',
        per_page: 30,
        page: 1,
        sparkline: false,
        price_change_percentage: ['24h'],
      }),
      fetchEquityMovers(),
    ]);

    const normalizeMostActive = (coin:any) => normalizeCryptoMover(coin);

    // Merge equity + crypto gainers/losers, equity first
    // Filter out garbage tickers (non-ASCII, special chars like ^, warrants like +)
    // One server-side quality filter for every page (OV-9): equities drop warrants/rights/units and anything
    // under $1 or 100k shares; crypto keeps the market-cap floor (lib/analysis/moverQuality).
    const eqGainers = equityMovers.gainers.map(normalizeAVMover).filter(m => VALID_EQ_TICKER.test(m.ticker) && passesServerMoverFilter(m)).slice(0, 10);
    const eqLosers = equityMovers.losers.map(normalizeAVMover).filter(m => VALID_EQ_TICKER.test(m.ticker) && passesServerMoverFilter(m)).slice(0, 10);
    const eqActive = equityMovers.active.map(normalizeAVMover).filter(m => VALID_EQ_TICKER.test(m.ticker) && passesServerMoverFilter(m)).slice(0, 10);
    const cryptoGainers = (topMovers?.top_gainers || []).map(coin => normalizeCryptoMover(coin, duration)).filter(m => VALID_CRYPTO_TICKER.test(m.ticker) && passesServerMoverFilter(m)).slice(0, 10);
    const cryptoLosers = (topMovers?.top_losers || []).map(coin => normalizeCryptoMover(coin, duration)).filter(m => VALID_CRYPTO_TICKER.test(m.ticker) && passesServerMoverFilter(m)).slice(0, 10);

    // If both sources failed, try returning cached data
    if (eqGainers.length === 0 && cryptoGainers.length === 0) {
      if (cachedResponse && Date.now() - cachedResponse.ts < CACHE_TTL_MS * 6) {
        return NextResponse.json(cachedResponse.data, {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        });
      }
      return NextResponse.json({ error: 'No top movers data available' }, { status: 500 });
    }

    const allMovers = [
      ...eqGainers, ...eqLosers, ...eqActive,
      ...cryptoGainers, ...cryptoLosers,
      ...(mostActive || []).slice(0, 10).map(normalizeMostActive),
    ];

    /* ── Technical enrichment from indicators_latest + benchmarks ─── */
    const enrichmentMap: Record<string, {
      rsi14: number | null;
      ema200_dist: number | null;
      adx14: number | null;
      in_squeeze: boolean | null;
      rs_vs_index: number | null;
      momentum_accel: number | null;
      in_universe: boolean;
    }> = {};

    try {
      // Unique tickers across all lists
      const uniqueTickers = [...new Set(allMovers.map(m => m.ticker))];

      if (uniqueTickers.length > 0) {
        // Batch fetch indicators (daily timeframe)
        const placeholders = uniqueTickers.map((_, i) => `$${i + 1}`).join(',');
        const indicatorRows = await q<{
          symbol: string; rsi14: string | null; ema200: string | null;
          adx14: string | null; in_squeeze: boolean | null;
        }>(
          `SELECT symbol, rsi14, ema200, adx14, in_squeeze
           FROM indicators_latest
           WHERE symbol = ANY($1) AND timeframe = 'daily'`,
          [uniqueTickers]
        );

        // Fetch benchmark quotes: SPY for equities, BTC for crypto
        const benchmarkRows = await q<{ symbol: string; change_percent: string }>(
          `SELECT symbol, change_percent FROM quotes_latest WHERE symbol IN ('SPY', 'BTC')`,
          []
        );
        const benchmarks: Record<string, number> = {};
        for (const b of benchmarkRows) {
          benchmarks[b.symbol] = Number(b.change_percent) || 0;
        }
        const spyChange = benchmarks['SPY'] ?? 0;
        const btcChange = benchmarks['BTC'] ?? 0;

        // Index indicator rows by symbol
        const indMap: Record<string, typeof indicatorRows[0]> = {};
        for (const row of indicatorRows) indMap[row.symbol] = row;

        // Build enrichment for each mover
        for (const mover of allMovers) {
          const ind = indMap[mover.ticker];
          const changePct = parseFloat(mover.change_percentage?.replace('%', '') || '0') || 0;
          const benchmark = mover.asset_class === 'equity' ? spyChange : btcChange;
          const price = parseFloat(mover.price) || 0;
          const ema200Val = ind?.ema200 ? Number(ind.ema200) : null;

          enrichmentMap[mover.ticker] = {
            rsi14: ind?.rsi14 != null ? Number(ind.rsi14) : null,
            ema200_dist: (ema200Val && price > 0) ? ((price - ema200Val) / ema200Val) * 100 : null,
            adx14: ind?.adx14 != null ? Number(ind.adx14) : null,
            in_squeeze: ind?.in_squeeze ?? null,
            rs_vs_index: changePct - benchmark,
            momentum_accel: null,
            in_universe: Boolean(ind),
          };
        }

        // warmup_json is either an OHLCV array (legacy) or the worker's status object.
        // Status objects are resolved from ohlcv_bars, which the worker already writes.
        const warmupRows = await q<{ symbol: string; warmup_json: unknown }>(
          `SELECT symbol, warmup_json FROM indicators_latest
           WHERE symbol = ANY($1) AND timeframe = 'daily' AND warmup_json IS NOT NULL`,
          [uniqueTickers]
        );
        const storedBarsNeeded: string[] = [];
        for (const row of warmupRows) {
          try {
            const warmup = typeof row.warmup_json === 'string' ? JSON.parse(row.warmup_json) : row.warmup_json;
            if (Array.isArray(warmup)) {
              const score = momentumAccelFromWarmup(warmup);
              if (enrichmentMap[row.symbol] && score != null) enrichmentMap[row.symbol].momentum_accel = score;
            } else if (isWarmupStatus(warmup)) {
              storedBarsNeeded.push(row.symbol);
            }
          } catch { /* skip bad warmup data */ }
        }
        if (storedBarsNeeded.length) {
          const barRows = await q<{ symbol: string; high: string; low: string; close: string; volume: string; rn: string }>(
            `SELECT symbol, high, low, close, volume, rn FROM (
               SELECT symbol, high, low, close, volume,
                      row_number() OVER (PARTITION BY symbol ORDER BY ts DESC) AS rn
               FROM ohlcv_bars
               WHERE symbol = ANY($1) AND timeframe = 'daily'
             ) recent
             WHERE rn <= 40`,
            [storedBarsNeeded]
          );
          const bySymbol = new Map<string, Array<MomentumBar & { rn: number }>>();
          for (const bar of barRows) {
            const list = bySymbol.get(bar.symbol) ?? [];
            list.push({
              high: Number(bar.high),
              low: Number(bar.low),
              close: Number(bar.close),
              volume: Number(bar.volume),
              rn: Number(bar.rn),
            });
            bySymbol.set(bar.symbol, list);
          }
          for (const symbol of storedBarsNeeded) {
            const bars = (bySymbol.get(symbol) ?? []).sort((a, b) => b.rn - a.rn);
            const score = momentumAccelFromWarmup({ barCount: bars.length, coreReady: bars.length >= 35 }, bars);
            if (enrichmentMap[symbol] && score != null) enrichmentMap[symbol].momentum_accel = score;
          }
        }
      }
    } catch (e) {
      console.error('[Market Movers] Technical enrichment failed (non-fatal):', e);
    }

    // Attach enrichment fields to each mover
    const enrich = (mover: any) => ({
      ...mover,
      dataFrequency: mover.asset_class === 'equity' ? equityMovers.feed : mover.change_basis,
      dataAsOf: mover.asset_class === 'equity' ? equityMovers.asOf ?? null : null,
      ...(enrichmentMap[mover.ticker] || {}),
    });

    const payload = {
      success: true,
      source: 'alphavantage+coingecko',
      duration,
      metadata: {
        provider: 'alphavantage+coingecko',
        model: 'TOP_GAINERS_LOSERS + coins/top_gainers_losers + indicators_latest',
        equityFilter: `no warrants/rights/units; price >= $1; volume >= ${EQUITY_MOVER_MIN_VOLUME.toLocaleString('en-US')}; market cap >= $100M when known`,
      },
      lastUpdated: new Date().toISOString(),
      // Provider time of the equity lists (Alpha Vantage last_updated). CoinGecko movers carry no time.
      equityAsOf: equityMovers.asOf ?? null,
      // 'realtime', 'end_of_day' (fallback) or 'unavailable', with Alpha Vantage's reason (OV-14).
      equityFeed: equityMovers.feed,
      equityNote: equityMovers.note,
      topGainers: [...eqGainers, ...cryptoGainers].map(enrich),
      topLosers: [...eqLosers, ...cryptoLosers].map(enrich),
      mostActive: [...eqActive, ...(mostActive || []).slice(0, 10).map(normalizeMostActive)].map(enrich),
    };

    // Cache successful response
    cachedResponse = { data: payload, ts: Date.now() };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[Market Movers API] Error:', error);
    // Return cached data on error instead of failing
    if (cachedResponse && Date.now() - cachedResponse.ts < CACHE_TTL_MS * 6) {
      return NextResponse.json(cachedResponse.data, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }
    return NextResponse.json(
      { error: 'Failed to fetch market movers' },
      { status: 500 }
    );
  }
}
