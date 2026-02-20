import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedFundingRates } from '@/lib/coingecko';

const CACHE_DURATION = 600;
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'DOT', 'LINK'];

interface LSRatio {
  symbol: string;
  longShortRatio: number;
  longAccount: number;
  shortAccount: number;
  timestamp: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function GET(req: NextRequest) {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    const funding = await getAggregatedFundingRates(SYMBOLS);
    if (!funding || !funding.length) {
      throw new Error('No derivatives data from CoinGecko');
    }

    const now = Date.now();
    const ratios: LSRatio[] = funding.map((item) => {
      const ratio = clamp(1 + item.fundingRatePercent / 0.05, 0.5, 1.5);
      const longPct = (ratio / (1 + ratio)) * 100;
      const shortPct = 100 - longPct;

      return {
        symbol: item.symbol,
        longShortRatio: Number(ratio.toFixed(3)),
        longAccount: Number(longPct.toFixed(2)),
        shortAccount: Number(shortPct.toFixed(2)),
        timestamp: now,
      };
    });

    const avgRatio = ratios.reduce((sum, r) => sum + r.longShortRatio, 0) / ratios.length;
    const avgLong = ratios.reduce((sum, r) => sum + r.longAccount, 0) / ratios.length;
    const avgShort = ratios.reduce((sum, r) => sum + r.shortAccount, 0) / ratios.length;

    let sentiment: 'Bullish' | 'Bearish' | 'Neutral';
    if (avgRatio > 1.2) sentiment = 'Bullish';
    else if (avgRatio < 0.8) sentiment = 'Bearish';
    else sentiment = 'Neutral';

    const result = {
      average: {
        longShortRatio: avgRatio.toFixed(2),
        longPercent: avgLong.toFixed(1),
        shortPercent: avgShort.toFixed(1),
        sentiment,
      },
      coins: ratios.sort((a, b) => b.longShortRatio - a.longShortRatio),
      source: 'coingecko',
      exchange: 'CoinGecko Derivatives Aggregate',
      model: 'funding-rate-positioning-proxy',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error) {
    console.error('[L/S Ratio API] Error:', error);

    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true });
    }

    return NextResponse.json({ error: 'Failed to fetch L/S ratio' }, { status: 500 });
  }
}
