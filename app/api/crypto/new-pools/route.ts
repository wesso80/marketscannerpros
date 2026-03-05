import { NextResponse } from 'next/server';
import { getNewPools } from '@/lib/coingecko';

export async function GET() {
  try {
    const data = await getNewPools();
    if (!data) {
      console.error('[NewPools] Fetch failed');
      return NextResponse.json({ error: 'Failed to fetch new pools' }, { status: 500 });
    }
    
    // Transform to simpler format
    const pools = (data.data || []).slice(0, 20).map((pool: any) => {
      const attrs = pool.attributes || {};
      return {
        id: pool.id,
        name: attrs.name || 'Unknown',
        network: pool.relationships?.network?.data?.id || 'unknown',
        dex: pool.relationships?.dex?.data?.id || 'unknown',
        priceUsd: parseFloat(attrs.base_token_price_usd) || 0,
        change1h: parseFloat(attrs.price_change_percentage?.h1) || 0,
        change24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
        volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
        liquidity: parseFloat(attrs.reserve_in_usd) || 0,
        buys24h: attrs.transactions?.h24?.buys || 0,
        sells24h: attrs.transactions?.h24?.sells || 0,
      };
    });

    return NextResponse.json({ pools });
  } catch (error) {
    console.error('[NewPools] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
