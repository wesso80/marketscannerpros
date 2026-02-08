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

    // Parse and format
    const defiMarketCap = parseFloat(defi.defi_market_cap);
    const ethMarketCap = parseFloat(defi.eth_market_cap);
    const tradingVolume = parseFloat(defi.trading_volume_24h);
    const defiDominance = parseFloat(defi.defi_dominance);
    const defiToEthRatio = parseFloat(defi.defi_to_eth_ratio);

    return NextResponse.json({
      success: true,
      data: {
        defiMarketCap,
        defiMarketCapFormatted: formatLargeNumber(defiMarketCap),
        ethMarketCap,
        ethMarketCapFormatted: formatLargeNumber(ethMarketCap),
        tradingVolume24h: tradingVolume,
        tradingVolume24hFormatted: formatLargeNumber(tradingVolume),
        defiDominance,
        defiToEthRatio: (defiToEthRatio * 100).toFixed(1),
        topCoin: defi.top_coin_name,
        topCoinDominance: defi.top_coin_defi_dominance,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[DeFi API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch DeFi data' 
    }, { status: 500 });
  }
}

function formatLargeNumber(num: number): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}
