import { boundedJsonFetch } from '@/lib/boundedFetch';

/** Required observations for the cross-market gate; absent data cannot imply permission. */
export function cryptoReviewMissing(data: any): string[] {
  const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const checks = [
    ['Market', numeric(data?.market?.marketCapChange24h) && numeric(data?.market?.totalVolume) && data?.market?.totalMarketCap > 0 && data?.market?.dominance?.length > 0, data?.marketMeta],
    ['Breadth', data?.trending?.coins?.some((c: any) => numeric(c?.change24h)), data?.trendingMeta],
    ['Funding', data?.funding?.coins?.length > 0 && numeric(data?.funding?.average?.fundingRatePercent), data?.fundingMeta],
    ['Comparable open-interest change', numeric(data?.oi?.total?.change24h) && numeric(data?.oi?.total?.altDominance), data?.oiMeta],
  ] as const;
  return checks.flatMap(([label, available, meta]) => !available ? [`${label} unavailable`] : meta?.freshnessStatus !== 'fresh' ? [`${label} freshness ${meta?.freshnessStatus ?? 'unknown'}`] : []);
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
