import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 300; // 5 minute cache
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'];

interface FundingRate {
  symbol: string;
  fundingRate: number;      // Raw rate (e.g., 0.0001)
  fundingRatePercent: number; // As percentage (e.g., 0.01%)
  annualized: number;       // Annualized rate
  nextFundingTime: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
}

export async function GET(req: NextRequest) {
  console.log('[Funding Rates API] Request received');
  
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    console.log('[Funding Rates API] Returning cached data');
    return NextResponse.json(cache.data);
  }

  try {
    console.log('[Funding Rates API] Fetching fresh data from Binance');
    const fundingPromises = SYMBOLS.map(async (symbol): Promise<FundingRate | null> => {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (!res.ok) return null;

        const data = await res.json();
        const rate = parseFloat(data.lastFundingRate);
        const ratePercent = rate * 100;
        const annualized = ratePercent * 3 * 365; // 3 funding periods per day

        let sentiment: 'Bullish' | 'Bearish' | 'Neutral';
        if (ratePercent > 0.03) sentiment = 'Bullish';
        else if (ratePercent < -0.01) sentiment = 'Bearish';
        else sentiment = 'Neutral';

        return {
          symbol: symbol.replace('USDT', ''),
          fundingRate: rate,
          fundingRatePercent: ratePercent,
          annualized,
          nextFundingTime: data.nextFundingTime,
          sentiment,
        };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(fundingPromises);
    const rates = results.filter((r): r is FundingRate => r !== null);

    if (rates.length === 0) {
      throw new Error('No funding rate data');
    }

    const avgRate = rates.reduce((sum, r) => sum + r.fundingRatePercent, 0) / rates.length;
    const avgAnnualized = rates.reduce((sum, r) => sum + r.annualized, 0) / rates.length;

    let overallSentiment: 'Bullish' | 'Bearish' | 'Neutral';
    if (avgRate > 0.02) overallSentiment = 'Bullish';
    else if (avgRate < -0.01) overallSentiment = 'Bearish';
    else overallSentiment = 'Neutral';

    // Time until next funding
    const btcFunding = rates.find(r => r.symbol === 'BTC');
    const nextFundingTime = btcFunding?.nextFundingTime;
    const timeUntilFunding = nextFundingTime ? Math.max(0, nextFundingTime - Date.now()) : null;

    const result = {
      average: {
        fundingRatePercent: avgRate.toFixed(4),
        annualized: avgAnnualized.toFixed(2),
        sentiment: overallSentiment,
      },
      nextFunding: {
        timestamp: nextFundingTime,
        timeUntilMs: timeUntilFunding,
        timeUntilFormatted: timeUntilFunding ? formatTime(timeUntilFunding) : null,
      },
      coins: rates.sort((a, b) => b.fundingRatePercent - a.fundingRatePercent),
      source: 'binance',
      exchange: 'Binance Futures',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    console.log(`[Funding Rates API] Returning ${rates.length} funding rates`);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[Funding Rates API] Error:', error);
    
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }
    
    return NextResponse.json({ error: 'Failed to fetch funding rates' }, { status: 500 });
  }
}

function formatTime(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}
