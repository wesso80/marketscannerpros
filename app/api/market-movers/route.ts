import { NextRequest, NextResponse } from 'next/server';
import { getTopGainersLosers, getMarketData } from '@/lib/coingecko';
import { avTakeToken } from '@/lib/avRateGovernor';

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
    const eqGainers = equityMovers.gainers.slice(0, 10).map(normalizeAVMover);
    const eqLosers = equityMovers.losers.slice(0, 10).map(normalizeAVMover);
    const eqActive = equityMovers.active.slice(0, 10).map(normalizeAVMover);
    const cryptoGainers = (topMovers?.top_gainers || []).slice(0, 10).map(normalizeCryptoMover);
    const cryptoLosers = (topMovers?.top_losers || []).slice(0, 10).map(normalizeCryptoMover);

    // If both sources failed, try returning cached data
    if (eqGainers.length === 0 && cryptoGainers.length === 0) {
      if (cachedResponse && Date.now() - cachedResponse.ts < CACHE_TTL_MS * 6) {
        return NextResponse.json(cachedResponse.data, {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        });
      }
      return NextResponse.json({ error: 'No top movers data available' }, { status: 500 });
    }

    const payload = {
      success: true,
      source: 'alphavantage+coingecko',
      duration,
      metadata: {
        provider: 'alphavantage+coingecko',
        model: 'TOP_GAINERS_LOSERS + coins/top_gainers_losers',
      },
      lastUpdated: new Date().toISOString(),
      topGainers: [...eqGainers, ...cryptoGainers],
      topLosers: [...eqLosers, ...cryptoLosers],
      mostActive: [...eqActive, ...(mostActive || []).slice(0, 10).map(normalizeMostActive)],
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
