import { NextRequest, NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta, searchCoins } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    const meta = buildCoinGeckoResponseMeta({ endpointFamily: 'SEARCH', lastUpdated: null, maxAgeMs: 300_000 });
    return NextResponse.json({ coins: [], meta, freshnessStatus: meta.freshnessStatus, source: meta.provider, timestamp: meta.lastUpdated });
  }

  try {
    const data = await searchCoins(query);
    if (!data) {
      console.error('[CryptoSearch] Fetch failed');
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    // Return top 10 coin results with market cap rank
    const coins = (data.coins || []).slice(0, 10).map((coin: any) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol?.toUpperCase(),
      thumb: coin.thumb,
      marketCapRank: coin.market_cap_rank,
    }));

    const meta = buildCoinGeckoResponseMeta({ endpointFamily: 'SEARCH', lastUpdated: new Date().toISOString(), maxAgeMs: 300_000 });
    return NextResponse.json({ coins, meta, freshnessStatus: meta.freshnessStatus, source: meta.provider, timestamp: meta.lastUpdated });
  } catch (error) {
    console.error('[CryptoSearch] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
