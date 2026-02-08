import { NextRequest, NextResponse } from 'next/server';
import { getTrendingPools, getNewPools } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'trending';

    const poolsData = type === 'new' 
      ? await getNewPools() 
      : await getTrendingPools();
    
    if (!poolsData?.data?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No DEX pool data available' 
      }, { status: 500 });
    }

    // Format pools
    const pools = poolsData.data.slice(0, 20).map(pool => {
      const attrs = pool.attributes;
      const network = pool.relationships?.network?.data?.id || 'unknown';
      const dex = pool.relationships?.dex?.data?.id || 'unknown';
      
      return {
        id: pool.id,
        name: attrs.name,
        address: attrs.address,
        network: formatNetwork(network),
        dex: formatDex(dex),
        price: parseFloat(attrs.base_token_price_usd) || 0,
        priceChange1h: parseFloat(attrs.price_change_percentage?.h1 || '0'),
        priceChange24h: parseFloat(attrs.price_change_percentage?.h24 || '0'),
        volume1h: parseFloat(attrs.volume_usd?.h1 || '0'),
        volume24h: parseFloat(attrs.volume_usd?.h24 || '0'),
        liquidity: parseFloat(attrs.reserve_in_usd || '0'),
        buys24h: attrs.transactions?.h24?.buys || 0,
        sells24h: attrs.transactions?.h24?.sells || 0,
      };
    });

    return NextResponse.json({
      success: true,
      type,
      pools,
      count: pools.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[DEX Pools API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch DEX pools' 
    }, { status: 500 });
  }
}

function formatNetwork(network: string): string {
  const networks: Record<string, string> = {
    'eth': 'Ethereum',
    'bsc': 'BNB Chain',
    'polygon_pos': 'Polygon',
    'arbitrum': 'Arbitrum',
    'optimism': 'Optimism',
    'base': 'Base',
    'solana': 'Solana',
    'avalanche': 'Avalanche',
  };
  return networks[network] || network;
}

function formatDex(dex: string): string {
  const dexes: Record<string, string> = {
    'uniswap_v3': 'Uniswap V3',
    'uniswap_v2': 'Uniswap V2',
    'pancakeswap_v3': 'PancakeSwap',
    'raydium': 'Raydium',
    'orca': 'Orca',
    'sushiswap': 'SushiSwap',
  };
  return dexes[dex] || dex;
}
