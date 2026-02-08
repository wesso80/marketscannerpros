import { NextResponse } from 'next/server';
import { getTrendingPools } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const poolsData = await getTrendingPools();
    
    if (!poolsData?.data?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No trending pools data available' 
      }, { status: 500 });
    }

    // Format the pools data
    const pools = poolsData.data.slice(0, 15).map(pool => {
      const attrs = pool.attributes;
      const baseTokenId = pool.relationships?.base_token?.data?.id || '';
      const network = pool.relationships?.network?.data?.id || 'unknown';
      const dex = pool.relationships?.dex?.data?.id || 'unknown';
      
      // Extract token symbol from base_token id (format: network_address)
      const tokenName = attrs.name?.split(' / ')?.[0] || 'Unknown';
      
      return {
        id: pool.id,
        name: attrs.name,
        address: attrs.address,
        network: network.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        dex: dex.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        baseTokenPrice: parseFloat(attrs.base_token_price_usd) || 0,
        priceChange1h: parseFloat(attrs.price_change_percentage?.h1) || 0,
        priceChange24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
        volume1h: parseFloat(attrs.volume_usd?.h1) || 0,
        volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
        liquidity: parseFloat(attrs.reserve_in_usd) || 0,
        buys24h: attrs.transactions?.h24?.buys || 0,
        sells24h: attrs.transactions?.h24?.sells || 0,
      };
    });

    // Compute some stats
    const totalVolume24h = pools.reduce((sum, p) => sum + p.volume24h, 0);
    const avgChange24h = pools.reduce((sum, p) => sum + p.priceChange24h, 0) / pools.length;

    return NextResponse.json({
      success: true,
      pools,
      stats: {
        totalVolume24h,
        avgChange24h,
        poolCount: pools.length,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Trending Pools API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch trending pools' 
    }, { status: 500 });
  }
}
