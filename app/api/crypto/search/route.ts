import { NextRequest, NextResponse } from 'next/server';

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const BASE_URL = COINGECKO_API_KEY 
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ coins: [] });
  }

  try {
    const headers: HeadersInit = { 'Accept': 'application/json' };
    if (COINGECKO_API_KEY) {
      headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
    }

    const res = await fetch(`${BASE_URL}/search?query=${encodeURIComponent(query)}`, {
      headers,
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error('[CryptoSearch] Fetch failed:', res.status);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    const data = await res.json();
    
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
