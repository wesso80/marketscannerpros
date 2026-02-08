import { NextResponse } from 'next/server';
import { getTrendingCoins, getSimplePrices } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const trending = await getTrendingCoins();
    
    if (!trending?.coins?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No trending data available' 
      }, { status: 500 });
    }

    // Extract coin IDs to fetch current prices
    const coinIds = trending.coins.map(c => c.item.id);
    const prices = await getSimplePrices(coinIds, { 
      include_24h_change: true,
      include_market_cap: true 
    });

    // Format response with prices
    const coins = trending.coins.map(({ item }) => ({
      id: item.id,
      name: item.name,
      symbol: item.symbol.toUpperCase(),
      rank: item.market_cap_rank,
      image: item.large || item.small || item.thumb,
      score: item.score + 1, // 1-indexed rank
      price: prices?.[item.id]?.usd || 0,
      change24h: prices?.[item.id]?.usd_24h_change || 0,
      marketCap: prices?.[item.id]?.usd_market_cap || 0,
    }));

    // Also include trending categories if available
    const categories = trending.categories?.slice(0, 5).map(cat => ({
      id: cat.id,
      name: cat.name,
      change1h: cat.market_cap_1h_change,
    })) || [];

    return NextResponse.json({
      success: true,
      coins,
      categories,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Trending API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch trending data' 
    }, { status: 500 });
  }
}
