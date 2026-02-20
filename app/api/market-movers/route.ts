import { NextRequest, NextResponse } from 'next/server';
import { getTopGainersLosers, getMarketData } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const duration = (searchParams.get('duration') || '24h') as '1h' | '24h' | '7d' | '14d' | '30d' | '60d' | '1y';

    const [topMovers, mostActive] = await Promise.all([
      getTopGainersLosers(duration, '1000'),
      getMarketData({
        order: 'volume_desc',
        per_page: 30,
        page: 1,
        sparkline: false,
        price_change_percentage: ['24h'],
      }),
    ]);

    if (!topMovers) {
      return NextResponse.json({ error: 'No top movers data available' }, { status: 500 });
    }

    const normalizeTopMover = (coin: any) => ({
      ticker: String(coin.symbol || '').toUpperCase(),
      price: String(coin.usd ?? coin.current_price ?? 0),
      change_amount: String(coin.usd_24h_change ?? coin.price_change_24h ?? 0),
      change_percentage: `${Number(coin.usd_24h_change ?? coin.price_change_percentage_24h ?? 0).toFixed(2)}%`,
      volume: String(coin.usd_24h_vol ?? coin.total_volume ?? 0),
      market_cap: String(coin.usd_market_cap ?? coin.market_cap ?? 0),
      market_cap_rank: String(coin.market_cap_rank ?? 0),
    });

    const normalizeMostActive = (coin: any) => ({
      ticker: String(coin.symbol || '').toUpperCase(),
      price: String(coin.current_price ?? 0),
      change_amount: String(coin.price_change_24h ?? 0),
      change_percentage: `${Number(coin.price_change_percentage_24h ?? 0).toFixed(2)}%`,
      volume: String(coin.total_volume ?? 0),
      market_cap: String(coin.market_cap ?? 0),
      market_cap_rank: String(coin.market_cap_rank ?? 0),
    });

    return NextResponse.json({
      success: true,
      source: 'coingecko',
      duration,
      metadata: {
        provider: 'coingecko',
        model: 'top_gainers_losers + coins/markets(volume_desc)',
      },
      lastUpdated: new Date().toISOString(),
      topGainers: (topMovers.top_gainers || []).slice(0, 20).map(normalizeTopMover),
      topLosers: (topMovers.top_losers || []).slice(0, 20).map(normalizeTopMover),
      mostActive: (mostActive || []).slice(0, 20).map(normalizeMostActive),
    });
  } catch (error) {
    console.error('[Market Movers API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market movers' },
      { status: 500 }
    );
  }
}
