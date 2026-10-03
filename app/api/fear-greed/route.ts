import { NextRequest, NextResponse } from 'next/server';
import { getCachedMulti, getRedis } from '@/lib/redis';
import { getGlobalData, getGlobalMarketCapChart } from '@/lib/coingecko';

const CACHE_DURATION = 3600;
let cache: { data: any; timestamp: number } | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function classify(value: number): string {
  if (value < 20) return 'Extreme Fear';
  if (value < 40) return 'Fear';
  if (value < 60) return 'Neutral';
  if (value < 80) return 'Greed';
  return 'Extreme Greed';
}

function computeScore(params: { mcapChange24h: number; stableDominance: number }): number {
  const { mcapChange24h, stableDominance } = params;
  const momentumComponent = 50 + mcapChange24h * 4;
  const stablePenalty = Math.max(0, stableDominance - 7.5) * 6;
  return Math.round(clamp(momentumComponent - stablePenalty, 0, 100));
}

export async function GET(req: NextRequest) {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    const [global, chart] = await Promise.all([
      getGlobalData(),
      getGlobalMarketCapChart(30),
    ]);

    if (!global) {
      throw new Error('CoinGecko global data unavailable');
    }

    const stableDominance = Number(global.market_cap_percentage?.usdt || 0) + Number(global.market_cap_percentage?.usdc || 0);
    const currentValue = computeScore({
      mcapChange24h: Number(global.market_cap_change_percentage_24h_usd || 0),
      stableDominance,
    });

    const mcapSeries = chart?.market_cap_chart?.market_cap || [];
    const modelledHistory = mcapSeries.slice(-30).map(([ts, value], idx, arr) => {
      const prev = idx > 0 ? arr[idx - 1][1] : value;
      const change = prev > 0 ? ((value - prev) / prev) * 100 : 0;
      const score = computeScore({ mcapChange24h: change, stableDominance });
      return {
        value: score,
        classification: classify(score),
        date: new Date(ts).toISOString(),
        basis: 'modelled_current_stablecoin_dominance' as string,
      };
    });

    // First successfully stored observation for each UTC date is immutable; missing days stay explicitly modelled.
    const observedAt = global.updated_at ? new Date(global.updated_at * 1000).toISOString() : new Date().toISOString();
    const observation = { value:currentValue, classification:classify(currentValue), date:observedAt, basis:'observed_inputs' };
    const dayKey = (date:string) => `sentiment:observed:v1:${date.slice(0,10)}`;
    let observationSaved = false;
    let history = modelledHistory;
    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(dayKey(observedAt), observation, { nx:true, ex:90*86400 });
        const stored = await getCachedMulti<typeof observation>(modelledHistory.map(h=>dayKey(h.date)));
        history = modelledHistory.map((h,i)=>stored[i] ?? h);
        observationSaved = true;
      }
    } catch { /* Unavailable persistence does not make the reconstructed history observed. */ }

    const result = {
      current: {
        value: currentValue,
        classification: classify(currentValue),
        timestamp: observedAt,
        timeUntilUpdate: 3600,
      },
      history,
      observationSaved,
      historyMethodology: 'Observed daily inputs where retained; other dates are modelled with today’s stablecoin dominance, not historical observed sentiment.',
      source: 'coingecko',
      market: 'crypto',
      methodology: 'Derived from CoinGecko global market-cap momentum and stablecoin dominance',
      cachedAt: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error) {
    console.error('Fear & Greed API error:', error);

    if (cache) {
      return NextResponse.json({
        ...cache.data,
        stale: true,
        error: 'Using cached data due to API error',
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch Fear & Greed Index' },
      { status: 500 }
    );
  }
}
