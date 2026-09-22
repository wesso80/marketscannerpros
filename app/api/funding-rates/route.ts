import { NextRequest, NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta, getAggregatedFundingRates } from '@/lib/coingecko';

const CACHE_DURATION = 300; // cache age is separate from each venue's funding interval
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
    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'DERIVATIVES',
      lastUpdated: cache.data?.meta?.lastUpdated ?? new Date(cache.timestamp).toISOString(),
      maxAgeMs: CACHE_DURATION * 1000,
      fallbackUsed: Boolean(cache.data?.meta?.fallbackUsed),
    });
    return NextResponse.json({
      ...cache.data,
      timestamp: meta.lastUpdated,
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      meta,
    });
  }

  try {
    console.log('[Funding Rates API] Fetching fresh data from CoinGecko');
    
    const fundingData = await getAggregatedFundingRates(SYMBOLS);
    
    if (!fundingData || fundingData.length === 0) {
      throw new Error('No funding rate data from CoinGecko');
    }

    const rates: FundingRate[] = fundingData.filter(data => !data.fundingRateMissing && Number.isFinite(data.fundingRatePercent)).map(data => ({
      symbol: data.symbol,
      fundingRate: data.avgFundingRate,
      fundingRatePercent: data.fundingRatePercent,
      annualized: data.annualized,
      sentiment: data.sentiment,
      exchanges: data.exchanges,
    }));

    if (!rates.length) throw new Error('No observed funding rates');

    const avgRate = rates.reduce((sum, r) => sum + r.fundingRatePercent, 0) / rates.length;
    const avgAnnualized = rates.reduce((sum, r) => sum + r.annualized, 0) / rates.length;

    let overallSentiment: 'Bullish' | 'Bearish' | 'Neutral';
    if (avgRate > 0.02) overallSentiment = 'Bullish';
    else if (avgRate < -0.01) overallSentiment = 'Bearish';
    else overallSentiment = 'Neutral';

    const fetchedAt = new Date(Math.min(...fundingData.filter(d => !d.fundingRateMissing).map(d => new Date(d.observedAt).getTime()))).toISOString();
    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'DERIVATIVES',
      lastUpdated: fetchedAt,
      maxAgeMs: CACHE_DURATION * 1000,
    });

    const result = {
      average: {
        fundingRatePercent: Number(avgRate.toFixed(4)),
        annualized: Number(avgAnnualized.toFixed(2)),
        sentiment: overallSentiment,
      },
      nextFunding: {
        timestamp: null,
        timeUntilMs: null,
        timeUntilFormatted: null,
      },
      coins: rates.sort((a, b) => b.fundingRatePercent - a.fundingRatePercent),
      source: meta.provider,
      exchange: 'Available top three derivatives venues',
      annualizationAssumption: '8-hour intervals; actual funding intervals vary by venue and contract',
      timestamp: meta.lastUpdated,
      freshnessStatus: meta.freshnessStatus,
      meta,
    };

    cache = { data: result, timestamp: Date.now() };
    console.log(`[Funding Rates API] Returning ${rates.length} funding rates from CoinGecko`);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Funding Rates API] Error:', error);
    
    if (cache) {
      const meta = buildCoinGeckoResponseMeta({
        endpointFamily: 'DERIVATIVES',
        lastUpdated: cache.data?.meta?.lastUpdated ?? new Date(cache.timestamp).toISOString(),
        maxAgeMs: CACHE_DURATION * 1000,
        fallbackUsed: true,
      });
      return NextResponse.json({
        ...cache.data,
        stale: true,
        timestamp: meta.lastUpdated,
        source: meta.provider,
        freshnessStatus: meta.freshnessStatus,
        meta,
      });
    }
    
    return NextResponse.json({ error: 'Funding intervals are unavailable; cross-venue rates and annualisation are withheld.', available: false, rates: [], coins: [] }, { status: 503 });
  }
}
