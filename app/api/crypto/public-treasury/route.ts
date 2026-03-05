import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getPublicTreasury } from '@/lib/coingecko';

/**
 * /api/crypto/public-treasury?coin=bitcoin   (or ?coin=ethereum)
 *
 * Returns public companies & governments holding BTC/ETH.
 * MicroStrategy, Tesla, El Salvador, etc.
 * Uses CoinGecko /companies/public_treasury/{coin_id} endpoint.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const coinParam = (searchParams.get('coin') || 'bitcoin').toLowerCase();

  // Only BTC and ETH supported by CoinGecko
  if (coinParam !== 'bitcoin' && coinParam !== 'ethereum') {
    return NextResponse.json(
      { error: 'Only bitcoin and ethereum are supported. Use ?coin=bitcoin or ?coin=ethereum' },
      { status: 400 }
    );
  }

  const data = await getPublicTreasury(coinParam as 'bitcoin' | 'ethereum');
  if (!data) {
    return NextResponse.json({ error: 'Failed to fetch public treasury data' }, { status: 502 });
  }

  // Format response with summary and top holders
  const companies = (data.companies || []).map(c => ({
    name: c.name,
    symbol: c.symbol,
    country: c.country,
    holdings: c.total_holdings,
    entryValueUsd: c.total_entry_value_usd,
    currentValueUsd: c.total_current_value_usd,
    percentOfSupply: c.percentage_of_total_supply,
    profitLossUsd: c.total_current_value_usd - c.total_entry_value_usd,
    profitLossPercent: c.total_entry_value_usd > 0
      ? ((c.total_current_value_usd - c.total_entry_value_usd) / c.total_entry_value_usd) * 100
      : 0,
  }));

  return NextResponse.json({
    coin: coinParam,
    summary: {
      totalHoldings: data.total_holdings,
      totalValueUsd: data.total_value_usd,
      marketCapDominance: data.market_cap_dominance,
      companyCount: companies.length,
    },
    companies,
  });
}
