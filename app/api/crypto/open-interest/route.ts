import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedOpenInterest, getDerivativesForSymbols } from '@/lib/coingecko';

const CACHE_DURATION = 600; // 10 minute cache (OI doesn't change fast)
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'DOT', 'LINK'];

interface OpenInterestData {
  symbol: string;
  openInterest: number;        // Total OI in USD
  openInterestValue: number;   // Alias for compatibility
  change24h: number;           // Placeholder - CoinGecko doesn't provide historical OI
  signal: 'longs_building' | 'shorts_building' | 'deleveraging' | 'neutral';
  exchanges: number;
}

export async function GET(req: NextRequest) {
  console.log('[Open Interest API] Request received');
  
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    console.log('[Open Interest API] Returning cached data');
    return NextResponse.json(cache.data);
  }

  try {
    console.log('[Open Interest API] Fetching fresh data from CoinGecko');
    
    const oiData = await getAggregatedOpenInterest(SYMBOLS);
    
    if (!oiData || oiData.length === 0) {
      throw new Error('No OI data from CoinGecko');
    }

    const results: OpenInterestData[] = oiData.map(data => {
      // CoinGecko doesn't provide OI change, so we set neutral
      // Could implement caching to calculate change ourselves
      return {
        symbol: data.symbol,
        openInterest: data.totalOpenInterest,
        openInterestValue: data.totalOpenInterest,
        change24h: 0, // Would need historical tracking
        signal: 'neutral' as const,
        exchanges: data.exchanges,
      };
    });

    // Calculate totals
    const totalOI = results.reduce((sum, r) => sum + r.openInterestValue, 0);
    
    // Overall market signal (simplified since we don't have change data)
    const marketSignal = 'neutral';

    const result = {
      summary: {
        totalOpenInterest: totalOI,
        totalOpenInterestFormatted: formatUSD(totalOI),
        avgChange24h: '0.00',
        marketSignal,
      },
      coins: results.sort((a, b) => b.openInterestValue - a.openInterestValue),
      source: 'coingecko',
      exchange: 'Multiple Exchanges',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    console.log(`[Open Interest API] Returning ${results.length} OI records from CoinGecko`);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Open Interest API] Error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    return NextResponse.json({ error: 'Failed to fetch open interest' }, { status: 500 });
  }
}

function formatUSD(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}
