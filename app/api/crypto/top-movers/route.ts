import { NextRequest, NextResponse } from 'next/server';
import { getTopGainersLosers } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const duration = (searchParams.get('duration') || '24h') as '1h' | '24h' | '7d' | '14d' | '30d' | '60d' | '1y';

    const data = await getTopGainersLosers(duration, '1000');
    
    // Debug: log raw response structure
    if (data && data.top_gainers && data.top_gainers.length > 0) {
      console.log('[Top Movers API] Sample gainer fields:', Object.keys(data.top_gainers[0]));
      console.log('[Top Movers API] Sample gainer data:', JSON.stringify(data.top_gainers[0], null, 2));
    }
    
    if (!data) {
      return NextResponse.json({ 
        success: false, 
        error: 'No top movers data available' 
      }, { status: 500 });
    }

    // Format gainers - handle both old and new CoinGecko response formats
    const gainers = data.top_gainers.slice(0, 10).map(coin => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      image: coin.image,
      price: coin.usd ?? coin.current_price ?? 0,
      change: coin.usd_24h_change ?? coin.price_change_percentage_24h ?? 0,
      volume: coin.usd_24h_vol ?? coin.total_volume ?? 0,
      marketCap: coin.usd_market_cap ?? coin.market_cap ?? 0,
      rank: coin.market_cap_rank ?? 0,
    }));

    // Format losers - handle both old and new CoinGecko response formats
    const losers = data.top_losers.slice(0, 10).map(coin => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      image: coin.image,
      price: coin.usd ?? coin.current_price ?? 0,
      change: coin.usd_24h_change ?? coin.price_change_percentage_24h ?? 0,
      volume: coin.usd_24h_vol ?? coin.total_volume ?? 0,
      marketCap: coin.usd_market_cap ?? coin.market_cap ?? 0,
      rank: coin.market_cap_rank ?? 0,
    }));

    return NextResponse.json({
      success: true,
      duration,
      gainers,
      losers,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Top Movers API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch top movers' 
    }, { status: 500 });
  }
}
