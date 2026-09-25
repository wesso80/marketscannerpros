import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

import { hasValidInternalServiceSecret } from '@/lib/internalServiceAuth';
import { getCached, setCached } from '@/lib/redis';
import {
  getDerivativesTickers,
  getMarketData,
  COINGECKO_ID_MAP,
  type DerivativeTicker,
} from '@/lib/coingecko';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';

/* ─── helpers ──────────────────────────────────── */

const TOP_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX',
  'DOT', 'LINK', 'NEAR', 'LTC', 'UNI', 'ATOM', 'ARB', 'OP',
  'APT', 'TON', 'SHIB', 'TRX',
];

function normRow(t: DerivativeTicker) {
  const price = parseFloat(t.price);
  return {
    market: t.market,
    symbol: t.symbol,
    indexId: t.index_id,
    price,
    priceChange24h: t.price_percentage_change_24h ?? 0,
    index: t.index ?? price,
    basis: t.basis ?? Number.NaN,
    spread: t.spread ?? Number.NaN,
    fundingRate: t.funding_rate ?? Number.NaN,
    // CoinGecko funding_rate is already percent per interval (BTC median ≈ 0.005%); do not multiply by 100.
    fundingPct: t.funding_rate ?? Number.NaN,
    openInterest: t.open_interest ?? Number.NaN,
    volume24h: t.volume_24h ?? Number.NaN,
    lastTradedAt: t.last_traded_at ?? 0,
  };
}

function aggregateFunding(rows: ReturnType<typeof normRow>[]) {
  // Provider has no funding-period contract, so rates are not comparable.
  return { avgFundingRate: Number.NaN, fundingRatePct: Number.NaN, annualised: Number.NaN,
    exchangeCount: new Set(rows.map(r => r.market)).size, sentiment: 'Unavailable' as const,
    min: Number.NaN, max: Number.NaN, fundingRateMissing: true,
    reason: 'Funding intervals unavailable; aggregate and annualisation withheld.' };

}

function aggregateOI(sourceRows: ReturnType<typeof normRow>[]) {
  const unique = new Map<string, ReturnType<typeof normRow>>();
  for (const row of sourceRows) {
    if (!(row.openInterest > 0) || !(row.lastTradedAt > 0)) continue;
    const key = `${row.market}:${row.symbol}`;
    if (!unique.has(key) || row.lastTradedAt > unique.get(key)!.lastTradedAt) unique.set(key, row);
  }
  const rows = [...unique.values()];
  const total = (values: number[]) => {
    const observed = values.filter(Number.isFinite);
    return observed.length ? observed.reduce((a, b) => a + b, 0) : Number.NaN;
  };
  return {
    totalOI: total(rows.map(r => r.openInterest)),
    contracts: rows.length,
    observedAt: rows.length ? new Date(Math.min(...rows.map(r => r.lastTradedAt)) * 1000).toISOString() : null,
    totalVolume24h: total(rows.map(r => r.volume24h)),
    exchangeCount: new Set(rows.map(r => r.market)).size,
  };
}

/* ─── GET /api/crypto-derivatives?symbol=BTC ──── */

export async function GET(req: NextRequest) {
  const internalAuthorized = hasValidInternalServiceSecret(req);
  if (!internalAuthorized) {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPaidSessionAccess(session)) {
      return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }
  }

  const symbol = (req.nextUrl.searchParams.get('symbol') || 'BTC').toUpperCase();
  const mode = req.nextUrl.searchParams.get('mode') || 'single'; // 'single' | 'multi'

  /* ── multi-coin mode (for heatmap / overview) ──── */
  if (mode === 'multi') {
    const cacheKey = `crypto-deriv:v2:multi`;
    const cached = await getCached<any>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const [allTickers, marketData] = await Promise.all([
      getDerivativesTickers(),
      getMarketData({
        ids: TOP_SYMBOLS.map(s => COINGECKO_ID_MAP[s]).filter(Boolean),
        per_page: 25,
        sparkline: false,
        price_change_percentage: ['24h', '7d'],
      }),
    ]);

    if (!allTickers) {
      return NextResponse.json({ error: 'Derivatives data unavailable' }, { status: 502 });
    }

    // Group tickers by index_id
    const grouped: Record<string, ReturnType<typeof normRow>[]> = {};
    for (const t of allTickers) {
      if (t.contract_type !== 'perpetual') continue;
      const id = t.index_id?.toUpperCase();
      if (!id || !TOP_SYMBOLS.includes(id)) continue;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(normRow(t));
    }

    const priceMap = new Map(
      (marketData ?? []).map(m => [m.symbol.toUpperCase(), m])
    );

    const coins = TOP_SYMBOLS.filter(s => grouped[s]?.length).map(s => {
      const rows = grouped[s];
      const mkt = priceMap.get(s);
      return {
        symbol: s,
        name: mkt?.name ?? s,
        price: mkt?.current_price ?? rows[0]?.price ?? 0,
        change24h: mkt?.price_change_percentage_24h ?? 0,
        exchanges: rows,
        aggregatedFunding: { symbol: s, ...aggregateFunding(rows) },
        aggregatedOI: { symbol: s, ...aggregateOI(rows) },
      };
    });

    const body = { coins, fetchedAt: new Date().toISOString() };
    await setCached(cacheKey, body, 300);
    return NextResponse.json(body);
  }

  /* ── single-coin mode ─────────────────────────── */
  const cacheKey = `crypto-deriv:v2:${symbol}`;
  const cached = await getCached<any>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const coinId = COINGECKO_ID_MAP[symbol];
  if (!coinId) {
    return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 });
  }

  const [allTickers, marketData] = await Promise.all([
    getDerivativesTickers(),
    getMarketData({
      ids: [coinId],
      per_page: 1,
      sparkline: true,
      price_change_percentage: ['1h', '24h', '7d'],
    }),
  ]);

  if (!allTickers) {
    return NextResponse.json({ error: 'Derivatives data unavailable' }, { status: 502 });
  }

  const rows = allTickers
    .filter(t => t.index_id?.toUpperCase() === symbol && t.contract_type === 'perpetual')
    .map(normRow)
    .sort((a, b) => b.openInterest - a.openInterest);

  const mkt = marketData?.[0];
  const coin = {
    id: coinId,
    symbol,
    name: mkt?.name ?? symbol,
    price: mkt?.current_price ?? rows[0]?.price ?? 0,
    change24h: mkt?.price_change_percentage_24h ?? 0,
    change7d: mkt?.price_change_percentage_7d_in_currency ?? 0,
    marketCap: mkt?.market_cap ?? 0,
    rank: mkt?.market_cap_rank ?? 0,
    volume24h: mkt?.total_volume ?? 0,
    high24h: mkt?.high_24h ?? 0,
    low24h: mkt?.low_24h ?? 0,
    circulatingSupply: mkt?.circulating_supply ?? 0,
    totalSupply: mkt?.total_supply ?? 0,
    ath: 0,
    athDate: '',
    athDistance: 0,
    sparkline7d: mkt?.sparkline_in_7d?.price ?? [],
  };

  const funding = { symbol, ...aggregateFunding(rows) };
  const oi = { symbol, ...aggregateOI(rows) };

  const body = {
    coin,
    rows,
    aggregatedFunding: funding,
    aggregatedOI: oi,
    fetchedAt: new Date().toISOString(),
  };

  await setCached(cacheKey, body, 300);
  return NextResponse.json(body);
}
