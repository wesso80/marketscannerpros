import { NextResponse } from 'next/server';
import { getNewListings, getSimplePrices, symbolToId } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 minutes

export async function GET() {
  try {
    const listings = await getNewListings();
    
    if (!listings?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No new listings data available' 
      }, { status: 500 });
    }

    // Get the latest 20 listings
    const latest = listings.slice(0, 20);
    
    // Try to get prices for these new coins
    const coinIds = latest.map(l => l.id);
    const prices = await getSimplePrices(coinIds, { 
      include_24h_change: true,
      include_market_cap: true 
    });

    // Format response
    const coins = latest.map(listing => {
      const listedDate = new Date(listing.activated_at * 1000);
      const now = new Date();
      const hoursAgo = Math.floor((now.getTime() - listedDate.getTime()) / (1000 * 60 * 60));
      const daysAgo = Math.floor(hoursAgo / 24);
      
      let timeAgo = '';
      if (daysAgo > 0) {
        timeAgo = `${daysAgo}d ago`;
      } else if (hoursAgo > 0) {
        timeAgo = `${hoursAgo}h ago`;
      } else {
        timeAgo = 'Just now';
      }

      return {
        id: listing.id,
        name: listing.name,
        symbol: listing.symbol.toUpperCase(),
        listedAt: listedDate.toISOString(),
        timeAgo,
        hoursAgo,
        price: prices?.[listing.id]?.usd || null,
        change24h: prices?.[listing.id]?.usd_24h_change || null,
        marketCap: prices?.[listing.id]?.usd_market_cap || null,
      };
    });

    return NextResponse.json({
      success: true,
      coins,
      totalNew: listings.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[New Listings API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch new listings' 
    }, { status: 500 });
  }
}
