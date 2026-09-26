import { NextResponse } from 'next/server';
import {
  buildCoinGeckoResponseMeta,
  getGlobalData,
  getGlobalMarketCapChart,
} from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';
import { coinGeckoTimeToIso } from '@/lib/analysis/providerAsOf';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fetchedAt = new Date().toISOString();
    const [globalData, chartData] = await Promise.all([
      getGlobalData(),
      getGlobalMarketCapChart(30),
    ]);
    
    if (!globalData) {
      const meta = buildCoinGeckoResponseMeta({
        endpointFamily: 'GLOBAL',
        lastUpdated: fetchedAt,
        maxAgeMs: 300_000,
      });
      return NextResponse.json({ 
        success: false, 
        error: 'No market data available',
        meta,
      }, { status: 500 });
    }

    const totalMarketCap = globalData.total_market_cap?.usd || 0;
    const totalVolume = globalData.total_volume?.usd || 0;
    // A missing 24h change is n/a (null), not a flat 0.0% ("Stable participation").
    const rawChange = globalData.market_cap_change_percentage_24h_usd;
    const marketCapChange = typeof rawChange === 'number' && Number.isFinite(rawChange) ? rawChange : null;
    // CoinGecko's own update time for /global (unix seconds); null if not sent.
    const asOf = coinGeckoTimeToIso(globalData.updated_at);

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

    // Freshness is judged from CoinGecko's own snapshot time when it sends one (OV-7).
    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'GLOBAL',
      lastUpdated: asOf ?? fetchedAt,
      maxAgeMs: 300_000,
    });

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
      timestamp: meta.lastUpdated,
      asOf,
      fetchedAt,
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      meta,
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
