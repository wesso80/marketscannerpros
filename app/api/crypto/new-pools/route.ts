import { NextResponse } from 'next/server';

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const BASE_URL = COINGECKO_API_KEY 
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

export async function GET() {
  try {
    const headers: HeadersInit = { 'Accept': 'application/json' };
    if (COINGECKO_API_KEY) {
      headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
    }

    const res = await fetch(`${BASE_URL}/onchain/networks/new_pools`, {
      headers,
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error('[NewPools] Fetch failed:', res.status);
      return NextResponse.json({ error: 'Failed to fetch new pools' }, { status: 500 });
    }

    const data = await res.json();
    
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
