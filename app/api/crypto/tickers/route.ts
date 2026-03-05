import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getCoinTickers, COINGECKO_ID_MAP, resolveSymbolToId } from '@/lib/coingecko';

/**
 * /api/crypto/tickers?symbol=BTC  or  ?id=bitcoin
 *
 * Returns exchange tickers for a coin — where to trade, best spreads, trust scores.
 * Uses CoinGecko /coins/{id}/tickers endpoint.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  const coinIdParam = searchParams.get('id');
  const page = parseInt(searchParams.get('page') || '1', 10);

  // Resolve to CoinGecko ID
  let coinId = coinIdParam || null;
  if (!coinId && symbol) {
    const upper = symbol.toUpperCase().replace(/USDT$/, '').replace(/USD$/, '');
    coinId = COINGECKO_ID_MAP[upper] || COINGECKO_ID_MAP[symbol.toUpperCase()] || null;
    if (!coinId) {
      coinId = await resolveSymbolToId(symbol);
    }
  }

  if (!coinId) {
    return NextResponse.json({ error: 'Missing symbol or id parameter' }, { status: 400 });
  }

  const data = await getCoinTickers(coinId, { page });
  if (!data?.tickers) {
    return NextResponse.json({ error: 'Failed to fetch tickers' }, { status: 502 });
  }

  // Sort by volume descending, filter out stale/anomalous
  const tickers = data.tickers
    .filter(t => !t.is_stale && !t.is_anomaly)
    .sort((a, b) => (b.converted_volume?.usd || 0) - (a.converted_volume?.usd || 0))
    .slice(0, 30)
    .map(t => ({
      exchange: t.market.name,
      exchangeId: t.market.identifier,
      pair: `${t.base}/${t.target}`,
      priceUsd: t.converted_last?.usd || t.last,
      volumeUsd24h: t.converted_volume?.usd || 0,
      spreadPercent: t.bid_ask_spread_percentage,
      trustScore: t.trust_score,
      tradeUrl: t.trade_url,
      lastTraded: t.last_traded_at,
    }));

  // Compute best exchange (highest trust, tightest spread)
  const greenTickers = tickers.filter(t => t.trustScore === 'green');
  const bestExchange = greenTickers.length > 0
    ? greenTickers.reduce((best, t) =>
        (t.spreadPercent !== null && (best.spreadPercent === null || t.spreadPercent < best.spreadPercent!)) ? t : best
      )
    : tickers[0] || null;

  return NextResponse.json({
    coinId,
    count: tickers.length,
    bestExchange: bestExchange ? {
      exchange: bestExchange.exchange,
      spreadPercent: bestExchange.spreadPercent,
      volumeUsd24h: bestExchange.volumeUsd24h,
      tradeUrl: bestExchange.tradeUrl,
    } : null,
    tickers,
  });
}
