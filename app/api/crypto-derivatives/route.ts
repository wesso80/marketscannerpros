import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getCached, setCached } from '@/lib/redis';
import {
  getDerivativesTickers,
  getMarketData,
  COINGECKO_ID_MAP,
  type DerivativeTicker,
} from '@/lib/coingecko';

/* ─── helpers ──────────────────────────────────── */

const TOP_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX',
  'DOT', 'LINK', 'NEAR', 'LTC', 'UNI', 'ATOM', 'ARB', 'OP',
  'APT', 'TON', 'SHIB', 'TRX',
];

function normRow(t: DerivativeTicker) {
  const price = parseFloat(t.price) || 0;
  return {
    market: t.market,
    symbol: t.symbol,
    indexId: t.index_id,
    price,
    priceChange24h: t.price_percentage_change_24h ?? 0,
    index: t.index ?? price,
    basis: t.basis ?? 0,
    spread: t.spread ?? 0,
    fundingRate: t.funding_rate ?? 0,
    fundingPct: (t.funding_rate ?? 0) * 100,
    openInterest: t.open_interest ?? 0,
    volume24h: t.volume_24h ?? 0,
    lastTradedAt: t.last_traded_at ?? 0,
  };
}

function aggregateFunding(rows: ReturnType<typeof normRow>[]) {
  const rates = rows.map(r => r.fundingPct).filter(r => !isNaN(r));
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const ann = avg * 3 * 365;
  const min = rates.length ? Math.min(...rates) : 0;
  const max = rates.length ? Math.max(...rates) : 0;
  let sentiment: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';
  if (avg > 0.03) sentiment = 'Bullish';
  else if (avg < -0.01) sentiment = 'Bearish';
  return { avgFundingRate: avg / 100, fundingRatePct: avg, annualised: ann, exchangeCount: rows.length, sentiment, min, max };
}

function aggregateOI(rows: ReturnType<typeof normRow>[]) {
  return {
    totalOI: rows.reduce((s, r) => s + r.openInterest, 0),
    totalVolume24h: rows.reduce((s, r) => s + r.volume24h, 0),
    exchangeCount: rows.length,
  };
}

/* ─── GET /api/crypto-derivatives?symbol=BTC ──── */

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbol = (req.nextUrl.searchParams.get('symbol') || 'BTC').toUpperCase();
  const mode = req.nextUrl.searchParams.get('mode') || 'single'; // 'single' | 'multi'

  /* ── multi-coin mode (for heatmap / overview) ──── */
  if (mode === 'multi') {
    const cacheKey = `crypto-deriv:multi`;
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
    await setCached(cacheKey, body, 60);
    return NextResponse.json(body);
  }

  /* ── single-coin mode ─────────────────────────── */
  const cacheKey = `crypto-deriv:${symbol}`;
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

  await setCached(cacheKey, body, 60);
  return NextResponse.json(body);
}
