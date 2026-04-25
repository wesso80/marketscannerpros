import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getTopTraders, type TopTrader } from '@/lib/coingecko';

/**
 * GET /api/crypto/top-traders?network=eth&address=0x...&period=24h
 *
 * Returns top traders with realized/unrealized PnL, avg buy/sell price.
 * Uses CoinGecko /onchain/networks/{network}/tokens/{address}/traders endpoint.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const network = searchParams.get('network');
  const address = searchParams.get('address');
  const period = (searchParams.get('period') || '24h') as '5m' | '1h' | '6h' | '24h';

  if (!network || !address) {
    return NextResponse.json(
      { error: 'network and address params are required' },
      { status: 400 }
    );
  }

  const traders = await getTopTraders(network, address, { period });
  if (!traders) {
    return NextResponse.json({ error: 'Failed to fetch top traders' }, { status: 502 });
  }

  const formatted = traders.map((t: TopTrader) => ({
    address: t.address,
    name: t.name || t.label || null,
    type: t.type,
    realizedPnlUsd: parseFloat(t.realized_pnl_usd) || 0,
    unrealizedPnlUsd: parseFloat(t.unrealized_pnl_usd) || 0,
    totalPnlUsd: (parseFloat(t.realized_pnl_usd) || 0) + (parseFloat(t.unrealized_pnl_usd) || 0),
    tokenBalance: parseFloat(t.token_balance) || 0,
    avgBuyPriceUsd: parseFloat(t.average_buy_price_usd) || 0,
    avgSellPriceUsd: t.average_sell_price_usd ? parseFloat(t.average_sell_price_usd) : null,
    buyCount: t.total_buy_count,
    sellCount: t.total_sell_count,
    totalBuyUsd: parseFloat(t.total_buy_usd) || 0,
    totalSellUsd: parseFloat(t.total_sell_usd) || 0,
    explorerUrl: t.explorer_url,
  }));

  return NextResponse.json({
    network,
    address,
    period,
    traders: formatted,
    count: formatted.length,
  });
}
