import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getCached, setCached } from '@/lib/redis';
import { getMarketData, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { q } from '@/lib/db';

/**
 * GET /api/stablecoin-liquidity
 *
 * Returns current USDT + USDC market caps as a stablecoin liquidity proxy,
 * plus historical snapshots from the stablecoin_snapshots table.
 *
 * ?history=true&days=30 — include historical data
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const includeHistory = req.nextUrl.searchParams.get('history') === 'true';
  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30, 90);

  const cacheKey = 'stablecoin-liquidity:current';
  const cached = await getCached<any>(cacheKey);
  if (cached && !includeHistory) return NextResponse.json(cached);

  // Fetch USDT + USDC from CoinGecko /coins/markets
  const usdtId = COINGECKO_ID_MAP['USDT'] || 'tether';
  const usdcId = COINGECKO_ID_MAP['USDC'] || 'usd-coin';

  const marketData = await getMarketData({
    ids: [usdtId, usdcId],
    per_page: 2,
    sparkline: false,
    price_change_percentage: ['24h'],
  });

  const usdtData = marketData?.find(m => m.id === usdtId);
  const usdcData = marketData?.find(m => m.id === usdcId);

  const usdt = {
    marketCap: usdtData?.market_cap ?? 0,
    volume24h: usdtData?.total_volume ?? 0,
    change24h: usdtData?.price_change_percentage_24h ?? 0,
    price: usdtData?.current_price ?? 1,
  };

  const usdc = {
    marketCap: usdcData?.market_cap ?? 0,
    volume24h: usdcData?.total_volume ?? 0,
    change24h: usdcData?.price_change_percentage_24h ?? 0,
    price: usdcData?.current_price ?? 1,
  };

  const totalCap = usdt.marketCap + usdc.marketCap;
  const totalDelta = totalCap > 0
    ? ((usdt.marketCap * (usdt.change24h / 100)) + (usdc.marketCap * (usdc.change24h / 100)))
    : 0;

  // Flag significant mint/redemption (>$100M single-day delta)
  const significantMint = totalDelta > 100_000_000;
  const significantRedemption = totalDelta < -100_000_000;

  const result: any = {
    usdt,
    usdc,
    total: {
      marketCap: totalCap,
      delta24h: totalDelta,
      deltaPct: totalCap > 0 ? (totalDelta / totalCap) * 100 : 0,
    },
    signals: {
      significantMint,
      significantRedemption,
      signal: significantMint ? 'LIQUIDITY_EXPANSION' : significantRedemption ? 'LIQUIDITY_CONTRACTION' : 'STABLE',
    },
    fetchedAt: new Date().toISOString(),
  };

  await setCached(cacheKey, result, 300); // 5 min cache

  if (includeHistory) {
    const history = await q<{
      captured_at: string;
      usdt_market_cap: number;
      usdc_market_cap: number;
      total_stablecoin_cap: number;
    }>(
      `SELECT captured_at, usdt_market_cap, usdc_market_cap, total_stablecoin_cap
       FROM stablecoin_snapshots
       WHERE captured_at > NOW() - make_interval(days => $1)
       ORDER BY captured_at ASC`,
      [days]
    );

    result.history = history.map(r => ({
      time: r.captured_at,
      usdt: Number(r.usdt_market_cap),
      usdc: Number(r.usdc_market_cap),
      total: Number(r.total_stablecoin_cap),
    }));
  }

  return NextResponse.json(result);
}
