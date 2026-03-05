import { NextRequest, NextResponse } from 'next/server';
import { searchCoins } from '@/lib/coingecko';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ coins: [] });
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

    return NextResponse.json({ coins });
  } catch (error) {
    console.error('[CryptoSearch] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
