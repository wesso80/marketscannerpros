import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getExchanges, getDerivativesExchangesData } from '@/lib/coingecko';

/**
 * /api/crypto/exchanges?type=spot  or  ?type=derivatives
 *
 * Returns exchange rankings by trust score and volume.
 * Spot: CoinGecko /exchanges endpoint
 * Derivatives: CoinGecko /derivatives/exchanges endpoint
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'spot';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = Math.min(parseInt(searchParams.get('per_page') || '50', 10), 100);

  if (type === 'derivatives') {
    const data = await getDerivativesExchangesData({ per_page: perPage, page });
    if (!data) {
      return NextResponse.json({ error: 'Failed to fetch derivatives exchanges' }, { status: 502 });
    }

    const exchanges = data.map(ex => ({
      id: ex.id,
      name: ex.name,
      image: ex.image,
      country: ex.country,
      yearEstablished: ex.year_established,
      openInterestBtc: ex.open_interest_btc,
      volume24hBtc: parseFloat(ex.trade_volume_24h_btc) || 0,
      perpetualPairs: ex.number_of_perpetual_pairs,
      futuresPairs: ex.number_of_futures_pairs,
      url: ex.url,
    }));

    return NextResponse.json({
      type: 'derivatives',
      count: exchanges.length,
      page,
      exchanges,
    });
  }

  // Default: spot exchanges
  const data = await getExchanges({ per_page: perPage, page });
  if (!data) {
    return NextResponse.json({ error: 'Failed to fetch exchanges' }, { status: 502 });
  }

  const exchanges = data.map(ex => ({
    id: ex.id,
    name: ex.name,
    image: ex.image,
    country: ex.country,
    yearEstablished: ex.year_established,
    trustScore: ex.trust_score,
    trustScoreRank: ex.trust_score_rank,
    volume24hBtc: ex.trade_volume_24h_btc,
    volume24hBtcNormalized: ex.trade_volume_24h_btc_normalized,
    url: ex.url,
  }));

  return NextResponse.json({
    type: 'spot',
    count: exchanges.length,
    page,
    exchanges,
  });
}
