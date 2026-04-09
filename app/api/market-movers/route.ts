import { NextRequest, NextResponse } from 'next/server';
import { getTopGainersLosers, getMarketData } from '@/lib/coingecko';
import { avTakeToken } from '@/lib/avRateGovernor';
import { q } from '@/lib/db';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

/* ── In-memory cache for last successful response ─────────────────── */
let cachedResponse: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── Alpha Vantage equity movers ───────────────────────────────────── */
async function fetchEquityMovers(): Promise<{
  gainers: any[];
  losers: any[];
  active: any[];
}> {
  if (!ALPHA_VANTAGE_API_KEY) return { gainers: [], losers: [], active: [] };
  try {
    const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHA_VANTAGE_API_KEY}`;
    await avTakeToken();
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (data?.Note || data?.Information || data?.['Error Message']) {
      return { gainers: [], losers: [], active: [] };
    }
    return {
      gainers: data?.top_gainers || [],
      losers: data?.top_losers || [],
      active: data?.most_actively_traded || [],
    };
  } catch {
    return { gainers: [], losers: [], active: [] };
  }
}

/* Valid equity ticker: 1-6 uppercase letters only (no ^, digits-only, non-ASCII) */
const VALID_EQ_TICKER = /^[A-Z]{1,6}$/;
/* Valid crypto symbol: 1-12 uppercase alphanumeric (no non-ASCII like 马币) */
const VALID_CRYPTO_TICKER = /^[A-Z0-9]{1,12}$/;

function normalizeAVMover(item: any) {
  return {
    ticker: String(item.ticker || '').toUpperCase(),
    price: String(item.price ?? 0),
    change_amount: String(item.change_amount ?? 0),
    change_percentage: String(item.change_percentage ?? '0%'),
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

    const normalizeCryptoMover = (coin: any) => ({
      ticker: String(coin.symbol || '').toUpperCase(),
      price: String(coin.usd ?? coin.current_price ?? 0),
      change_amount: String(coin.usd_24h_change ?? coin.price_change_24h ?? 0),
      change_percentage: `${Number(coin.usd_24h_change ?? coin.price_change_percentage_24h ?? 0).toFixed(2)}%`,
      volume: String(coin.usd_24h_vol ?? coin.total_volume ?? 0),
      market_cap: String(coin.usd_market_cap ?? coin.market_cap ?? 0),
      market_cap_rank: String(coin.market_cap_rank ?? 0),
      asset_class: 'crypto' as const,
    });

    const normalizeMostActive = (coin: any) => ({
      ticker: String(coin.symbol || '').toUpperCase(),
      price: String(coin.current_price ?? 0),
      change_amount: String(coin.price_change_24h ?? 0),
      change_percentage: `${Number(coin.price_change_percentage_24h ?? 0).toFixed(2)}%`,
      volume: String(coin.total_volume ?? 0),
      market_cap: String(coin.market_cap ?? 0),
      market_cap_rank: String(coin.market_cap_rank ?? 0),
      asset_class: 'crypto' as const,
    });

    // Merge equity + crypto gainers/losers, equity first
    // Filter out garbage tickers (non-ASCII, special chars like ^, warrants like +)
    const eqGainers = equityMovers.gainers.map(normalizeAVMover).filter(m => VALID_EQ_TICKER.test(m.ticker)).slice(0, 10);
    const eqLosers = equityMovers.losers.map(normalizeAVMover).filter(m => VALID_EQ_TICKER.test(m.ticker)).slice(0, 10);
    const eqActive = equityMovers.active.map(normalizeAVMover).filter(m => VALID_EQ_TICKER.test(m.ticker)).slice(0, 10);
    const cryptoGainers = (topMovers?.top_gainers || []).map(normalizeCryptoMover).filter(m => VALID_CRYPTO_TICKER.test(m.ticker)).slice(0, 10);
    const cryptoLosers = (topMovers?.top_losers || []).map(normalizeCryptoMover).filter(m => VALID_CRYPTO_TICKER.test(m.ticker)).slice(0, 10);

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
            momentum_accel: null, // populated below from warmup_json if available
          };
        }

        // Try to get momentum acceleration from warmup_json (pre-computed OHLCV bars)
        const warmupRows = await q<{ symbol: string; warmup_json: any }>(
          `SELECT symbol, warmup_json FROM indicators_latest
           WHERE symbol = ANY($1) AND timeframe = 'daily' AND warmup_json IS NOT NULL`,
          [uniqueTickers]
        );
        for (const row of warmupRows) {
          try {
            const bars = typeof row.warmup_json === 'string' ? JSON.parse(row.warmup_json) : row.warmup_json;
            if (Array.isArray(bars) && bars.length >= 35) {
              // Compute momentum acceleration inline (lightweight version)
              const closes = bars.map((b: any) => Number(b.close || b.c || 0));
              const volumes = bars.map((b: any) => Number(b.volume || b.v || 0));
              const lookback = 5;
              const lastClose = closes[closes.length - 1];
              const prevClose = closes[closes.length - 1 - lookback];
              const recentVols = volumes.slice(-20);
              const avgVol = recentVols.reduce((s: number, v: number) => s + v, 0) / recentVols.length;
              const lastVol = volumes[volumes.length - 1] || 0;
              const volSurge = avgVol > 0 ? lastVol / avgVol : 1;
              const priceMove = lastClose - prevClose;
              // Simple ATR approximation from last 14 bars
              const highs = bars.map((b: any) => Number(b.high || b.h || 0));
              const lows = bars.map((b: any) => Number(b.low || b.l || 0));
              let atrSum = 0;
              for (let i = bars.length - 14; i < bars.length; i++) {
                const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[Math.max(0, i - 1)]), Math.abs(lows[i] - closes[Math.max(0, i - 1)]));
                atrSum += tr;
              }
              const atrVal = atrSum / 14;
              const priceAtrMove = atrVal > 0 ? priceMove / atrVal : 0;
              const volScore = Math.min(25, Math.max(0, (volSurge - 1) * 25));
              const priceScore = Math.min(25, Math.abs(priceAtrMove) * 12.5);
              const accelScore = Math.round(volScore + priceScore);
              if (enrichmentMap[row.symbol]) {
                enrichmentMap[row.symbol].momentum_accel = accelScore;
              }
            }
          } catch { /* skip bad warmup data */ }
        }
      }
    } catch (e) {
      console.error('[Market Movers] Technical enrichment failed (non-fatal):', e);
    }

    // Attach enrichment fields to each mover
    const enrich = (mover: any) => ({
      ...mover,
      ...(enrichmentMap[mover.ticker] || {}),
    });

    const payload = {
      success: true,
      source: 'alphavantage+coingecko',
      duration,
      metadata: {
        provider: 'alphavantage+coingecko',
        model: 'TOP_GAINERS_LOSERS + coins/top_gainers_losers + indicators_latest',
      },
      lastUpdated: new Date().toISOString(),
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
