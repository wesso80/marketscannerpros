import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedFundingRates } from '@/lib/coingecko';

const CACHE_DURATION = 900; // 15 minute cache (funding rates update every 8 hours)
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'DOT', 'LINK'];

interface FundingRate {
  symbol: string;
  fundingRate: number;      // Raw rate (e.g., 0.0001)
  fundingRatePercent: number; // As percentage (e.g., 0.01%)
  annualized: number;       // Annualized rate
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  exchanges?: number;
}

export async function GET(req: NextRequest) {
  console.log('[Funding Rates API] Request received');
  
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    console.log('[Funding Rates API] Returning cached data');
    return NextResponse.json(cache.data);
  }

  try {
    console.log('[Funding Rates API] Fetching fresh data from CoinGecko');
    
    const fundingData = await getAggregatedFundingRates(SYMBOLS);
    
    if (!fundingData || fundingData.length === 0) {
      throw new Error('No funding rate data from CoinGecko');
    }

    const rates: FundingRate[] = fundingData.map(data => ({
      symbol: data.symbol,
      fundingRate: data.avgFundingRate,
      fundingRatePercent: data.fundingRatePercent,
      annualized: data.annualized,
      sentiment: data.sentiment,
      exchanges: data.exchanges,
    }));

    const avgRate = rates.reduce((sum, r) => sum + r.fundingRatePercent, 0) / rates.length;
    const avgAnnualized = rates.reduce((sum, r) => sum + r.annualized, 0) / rates.length;

    let overallSentiment: 'Bullish' | 'Bearish' | 'Neutral';
    if (avgRate > 0.02) overallSentiment = 'Bullish';
    else if (avgRate < -0.01) overallSentiment = 'Bearish';
    else overallSentiment = 'Neutral';

    const result = {
      average: {
        fundingRatePercent: avgRate.toFixed(4),
        annualized: avgAnnualized.toFixed(2),
        sentiment: overallSentiment,
      },
      nextFunding: {
        timestamp: null,
        timeUntilMs: null,
        timeUntilFormatted: null,
      },
      coins: rates.sort((a, b) => b.fundingRatePercent - a.fundingRatePercent),
      source: 'coingecko',
      exchange: 'Multiple Exchanges',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    console.log(`[Funding Rates API] Returning ${rates.length} funding rates from CoinGecko`);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Funding Rates API] Error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    return NextResponse.json({ error: 'Failed to fetch funding rates' }, { status: 500 });
  }
}
