import { NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta, getDefiData } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fetchedAt = new Date().toISOString();
    const defi = await getDefiData();
    
    if (!defi) {
      const meta = buildCoinGeckoResponseMeta({
        endpointFamily: 'DEFI',
        lastUpdated: fetchedAt,
        maxAgeMs: 300_000,
      });
      return NextResponse.json({ 
        success: false, 
        error: 'No DeFi data available',
        meta,
      }, { status: 500 });
    }

    // Parse the string values to numbers
    const marketCap = parseFloat(defi.defi_market_cap) || 0;
    const ethMarketCap = parseFloat(defi.eth_market_cap) || 0;
    const volume24h = parseFloat(defi.trading_volume_24h) || 0;
    const dominance = parseFloat(defi.defi_dominance) || 0;
    const defiToEthRatio = parseFloat(defi.defi_to_eth_ratio) || 0;

    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'DEFI',
      lastUpdated: fetchedAt,
      maxAgeMs: 300_000,
    });

    return NextResponse.json({
      success: true,
      data: {
        marketCap,
        ethMarketCap,
        volume24h,
        dominance,
        defiToEthRatio,
        topCoin: defi.top_coin_name,
        topCoinDominance: defi.top_coin_defi_dominance,
      },
      timestamp: meta.lastUpdated,
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      meta,
    });

  } catch (error) {
    console.error('[DeFi Stats API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch DeFi stats' 
    }, { status: 500 });
  }
}
