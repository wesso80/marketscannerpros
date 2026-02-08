import { NextResponse } from 'next/server';
import { getDefiData } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const defi = await getDefiData();
    
    if (!defi) {
      return NextResponse.json({ 
        success: false, 
        error: 'No DeFi data available' 
      }, { status: 500 });
    }

    // Parse the string values to numbers
    const marketCap = parseFloat(defi.defi_market_cap) || 0;
    const ethMarketCap = parseFloat(defi.eth_market_cap) || 0;
    const volume24h = parseFloat(defi.trading_volume_24h) || 0;
    const dominance = parseFloat(defi.defi_dominance) || 0;
    const defiToEthRatio = parseFloat(defi.defi_to_eth_ratio) || 0;

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
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[DeFi Stats API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch DeFi stats' 
    }, { status: 500 });
  }
}
