import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedOpenInterest, getDerivativesForSymbols } from '@/lib/coingecko';
import { getCached, setCached } from '@/lib/redis';
import { getSessionFromCookie } from '@/lib/auth';

const CACHE_DURATION = 600; // 10 minute cache (OI doesn't change fast)
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'DOT', 'LINK'];

// Redis key for the 24-hour OI anchor snapshot
const OI_ANCHOR_KEY = 'oi:anchor:24h';
const OI_ANCHOR_TTL = 86400; // 24 hours

interface AnchorSnapshot {
  [symbol: string]: number; // symbol → OI in USD at anchor time
}

interface OpenInterestData {
  symbol: string;
  openInterest: number;        // Total OI in USD
  openInterestValue: number;   // Alias for compatibility
  openInterestFormatted: string; // Human-readable OI value
  change24h: number;           // Computed from Redis anchor snapshot
  signal: 'longs_building' | 'shorts_building' | 'deleveraging' | 'neutral';
  exchanges: number;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    // ── Redis anchor: compute 24h OI change ──────────────────────────
    // Read the anchor snapshot (set ~24h ago). If it doesn't exist yet,
    // store the current values as the anchor for future comparisons.
    let anchor: AnchorSnapshot | null = null;
    try {
      anchor = await getCached<AnchorSnapshot>(OI_ANCHOR_KEY);
    } catch { /* Redis miss is fine */ }

    const currentSnapshot: AnchorSnapshot = {};
    for (const d of oiData) {
      currentSnapshot[d.symbol] = d.totalOpenInterest;
    }

    // If no anchor exists, set one now (first request bootstraps the 24h cycle)
    if (!anchor) {
      console.log('[Open Interest API] No anchor snapshot — seeding Redis');
      await setCached(OI_ANCHOR_KEY, currentSnapshot, OI_ANCHOR_TTL).catch(() => {});
      anchor = currentSnapshot; // first call shows 0% (no baseline yet)
    }

    const results: OpenInterestData[] = oiData.map(data => {
      const prev = anchor?.[data.symbol] ?? 0;
      const current = data.totalOpenInterest;
      const changePct = prev > 0 ? ((current - prev) / prev) * 100 : 0;

      // Derive signal from change magnitude
      let signal: OpenInterestData['signal'] = 'neutral';
      if (changePct > 3) signal = 'longs_building';
      else if (changePct < -3) signal = 'deleveraging';
      else if (changePct < -1) signal = 'shorts_building';

      return {
        symbol: data.symbol,
        openInterest: current,
        openInterestValue: current,
        openInterestFormatted: formatUSD(current),
        change24h: parseFloat(changePct.toFixed(2)),
        signal,
        exchanges: data.exchanges,
      };
    });

    // Calculate totals
    const totalOI = results.reduce((sum, r) => sum + r.openInterestValue, 0);
    const avgChange = results.length > 0
      ? results.reduce((s, r) => s + r.change24h, 0) / results.length
      : 0;

    // Overall market signal
    let marketSignal: string = 'neutral';
    if (avgChange > 2) marketSignal = 'longs_building';
    else if (avgChange < -2) marketSignal = 'deleveraging';
    else if (avgChange < -0.5) marketSignal = 'shorts_building';

    const result = {
      summary: {
        totalOpenInterest: totalOI,
        totalOpenInterestFormatted: formatUSD(totalOI),
        avgChange24h: avgChange.toFixed(2),
        marketSignal,
      },
      coins: results.sort((a, b) => b.openInterestValue - a.openInterestValue),
      source: 'coingecko',
      exchange: 'Multiple Exchanges',
      timestamp: new Date().toISOString(),
    };

    cache = { data: result, timestamp: Date.now() };
    console.log(`[Open Interest API] Returning ${results.length} OI records (avgΔ ${avgChange.toFixed(2)}%)`);
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
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
