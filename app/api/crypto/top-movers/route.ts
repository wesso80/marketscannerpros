import { NextRequest, NextResponse } from 'next/server';
import { getTopGainersLosers } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const duration = (searchParams.get('duration') || '24h') as '1h' | '24h' | '7d' | '14d' | '30d' | '60d' | '1y';

    const data = await getTopGainersLosers(duration, '1000');
    
    if (!data) {
      return NextResponse.json({ 
        success: false, 
        error: 'No top movers data available' 
      }, { status: 500 });
    }

    // Format gainers
    const gainers = data.top_gainers.slice(0, 10).map(coin => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      image: coin.image,
      price: coin.current_price,
      change: coin.price_change_percentage_24h,
      volume: coin.total_volume,
      marketCap: coin.market_cap,
      rank: coin.market_cap_rank,
    }));

    // Format losers
    const losers = data.top_losers.slice(0, 10).map(coin => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      image: coin.image,
      price: coin.current_price,
      change: coin.price_change_percentage_24h,
      volume: coin.total_volume,
      marketCap: coin.market_cap,
      rank: coin.market_cap_rank,
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
