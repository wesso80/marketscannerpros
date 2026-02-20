import { NextResponse } from 'next/server';
import { getGlobalData, getGlobalMarketCapChart } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const [globalData, chartData] = await Promise.all([
      getGlobalData(),
      getGlobalMarketCapChart(30),
    ]);
    
    if (!globalData) {
      return NextResponse.json({ 
        success: false, 
        error: 'No market data available' 
      }, { status: 500 });
    }

    const totalMarketCap = globalData.total_market_cap?.usd || 0;
    const totalVolume = globalData.total_volume?.usd || 0;
    const marketCapChange = globalData.market_cap_change_percentage_24h_usd || 0;

    // Format dominance
    const dominance = globalData.market_cap_percentage || {};
    const topCoins = Object.entries(dominance)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .map(([symbol, pct]) => ({
        symbol: symbol.toUpperCase(),
        dominance: pct as number,
      }));

    // Format chart data for sparkline
    let sparkline: { time: number; value: number }[] = [];
    if (chartData?.market_cap_chart?.market_cap) {
      sparkline = chartData.market_cap_chart.market_cap.map(([time, value]) => ({
        time,
        value,
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        totalMarketCap,
        totalMarketCapFormatted: formatLargeNumber(totalMarketCap),
        totalVolume,
        totalVolumeFormatted: formatLargeNumber(totalVolume),
        marketCapChange24h: marketCapChange,
        dominanceMap: dominance,
        btcDominance: Number(dominance.btc || 0),
        ethDominance: Number(dominance.eth || 0),
        usdtDominance: Number(dominance.usdt || 0),
        usdcDominance: Number(dominance.usdc || 0),
        dominance: topCoins,
        sparkline,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Market Overview API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch market overview' 
    }, { status: 500 });
  }
}

function formatLargeNumber(num: number): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}
