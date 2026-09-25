import { boundedJsonFetch } from '@/lib/boundedFetch';

type ReviewCheck = readonly [label: string, available: boolean, meta: any];

function reviewChecks(data: any): Record<'market' | 'breadth' | 'funding' | 'oi', ReviewCheck> {
  const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return {
    market: ['Market', numeric(data?.market?.marketCapChange24h) && numeric(data?.market?.totalVolume) && data?.market?.totalMarketCap > 0 && data?.market?.dominance?.length > 0, data?.marketMeta],
    breadth: ['Breadth', Boolean(data?.trending?.coins?.some((c: any) => numeric(c?.change24h))), data?.trendingMeta],
    funding: ['Funding', data?.funding?.coins?.length > 0 && numeric(data?.funding?.average?.fundingRatePercent), data?.fundingMeta],
    oi: ['Comparable open-interest change', numeric(data?.oi?.total?.change24h) && numeric(data?.oi?.total?.altDominance), data?.oiMeta],
  };
}

const usable = ([, available, meta]: ReviewCheck) => available && meta?.freshnessStatus === 'fresh';

/** Which input groups are present and fresh. Missing groups must not be treated as neutral. */
export function cryptoReviewCoverage(data: any) {
  const checks = reviewChecks(data);
  return { market: usable(checks.market), breadth: usable(checks.breadth), funding: usable(checks.funding), oi: usable(checks.oi) };
}

/** Required observations for the cross-market gate; absent data cannot imply permission. */
export function cryptoReviewMissing(data: any): string[] {
  return Object.values(reviewChecks(data)).flatMap(([label, available, meta]) => !available ? [`${label} unavailable`] : meta?.freshnessStatus !== 'fresh' ? [`${label} freshness ${meta?.freshnessStatus ?? 'unknown'}`] : []);
}

function dominanceOf(dominance: unknown, symbol: string): number {
  if (!Array.isArray(dominance)) return 0;
  const row = dominance.find((entry: any) => entry?.symbol?.toUpperCase() === symbol);
  return typeof row?.dominance === 'number' ? row.dominance : 0;
}

export type CryptoLeadership = 'Large Caps Leading' | 'Alts Leading' | 'Defensive Rotation' | 'Fragmented';
export type CryptoVolatility = 'Compression' | 'Expansion' | 'Dislocation' | 'Chop';

/**
 * Parts of the crypto review that need only spot market data (CoinGecko market
 * overview and trending coins), not derivatives. They stay available when the
 * funding or open-interest feeds are down:
 *  - volatility: needs the market overview (24h market-cap move)
 *  - breadth:    needs trending coins (and categories when present)
 *  - leadership: needs both (BTC dominance, cap move and breadth)
 */
export function cryptoSpotContext(data: any): {
  leadership: CryptoLeadership | 'Unavailable';
  volatility: CryptoVolatility | 'Unavailable';
  breadthScore: number | null;
  breadthLabel: 'Broad' | 'Mixed' | 'Weak' | 'Unavailable';
  breadthTop50: number | null;
} {
  const coverage = cryptoReviewCoverage(data);
  const market = data?.market;
  const capMove = typeof market?.marketCapChange24h === 'number' ? market.marketCapChange24h : 0;
  const btcDominance = dominanceOf(market?.dominance, 'BTC');

  let volatility: CryptoVolatility | 'Unavailable' = 'Unavailable';
  if (coverage.market) {
    const absCapMove = Math.abs(capMove);
    volatility = 'Chop';
    if (absCapMove < 1) volatility = 'Compression';
    else if (absCapMove >= 1 && absCapMove < 3) volatility = 'Expansion';
    else if (absCapMove >= 5) volatility = 'Dislocation';
  }

  let breadthTop50: number | null = null;
  let breadthScore: number | null = null;
  let breadthLabel: 'Broad' | 'Mixed' | 'Weak' | 'Unavailable' = 'Unavailable';
  if (coverage.breadth) {
    const trendingCoins = data?.trending?.coins || [];
    const trendingCategories = data?.trending?.categories || [];
    const trendingPositive = trendingCoins.filter((coin: any) => (coin?.change24h ?? 0) > 0).length;
    breadthTop50 = trendingCoins.length ? (trendingPositive / trendingCoins.length) * 100 : 50;
    const categoryPositive = trendingCategories.filter((cat: any) => (cat?.change1h ?? 0) > 0).length;
    const sectorBreadth = trendingCategories.length ? (categoryPositive / trendingCategories.length) * 100 : breadthTop50;
    breadthScore = Math.round((breadthTop50 * 0.7) + (sectorBreadth * 0.3));
    breadthLabel = breadthScore >= 65 ? 'Broad' : breadthScore >= 40 ? 'Mixed' : 'Weak';
  }

  let leadership: CryptoLeadership | 'Unavailable' = 'Unavailable';
  if (coverage.market && breadthTop50 != null) {
    leadership = 'Fragmented';
    if (btcDominance >= 56 && breadthTop50 < 40) leadership = 'Defensive Rotation';
    else if (btcDominance <= 53 && breadthTop50 >= 55) leadership = 'Alts Leading';
    else if (capMove > 0.5 && btcDominance > 53 && btcDominance < 56) leadership = 'Large Caps Leading';
  }

  return { leadership, volatility, breadthScore, breadthLabel, breadthTop50 };
}

export async function fetchCryptoReviewData() {
  const get = async (url: string) => {
    const { response, body } = await boundedJsonFetch<any>(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return body;
  };
  const [market, trending, funding, oi] = await Promise.all([
    get('/api/crypto/market-overview').catch(() => null), get('/api/crypto/trending').catch(() => null),
    get('/api/funding-rates').catch(() => null), get('/api/open-interest').catch(() => null),
  ]);
  return { market: market?.data, marketMeta: market?.meta, trending, trendingMeta: trending?.meta, funding, fundingMeta: funding?.meta, oi, oiMeta: oi?.meta };
}
