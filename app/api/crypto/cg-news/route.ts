import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { buildCoinGeckoResponseMeta, getCryptoNews } from '@/lib/coingecko';

/**
 * GET /api/crypto/cg-news?coin_id=bitcoin&type=news&page=1&per_page=20
 *
 * Returns latest crypto news from CoinGecko.
 * Optionally filter by coin, news type, language.
 * Requires Analyst plan (paid).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const coin_id = searchParams.get('coin_id') || undefined;
  const type = (searchParams.get('type') || undefined) as 'news' | 'guides' | undefined;
  const language = searchParams.get('language') || 'en';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const per_page = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 50);

  const articles = await getCryptoNews({ coin_id, type, language, page, per_page });

  if (!articles) {
    return NextResponse.json({ error: 'Failed to fetch crypto news' }, { status: 502 });
  }

  const lastUpdated = articles.reduce<string | null>((latest, article: any) => {
    const published = article?.published_at ?? article?.created_at ?? null;
    if (!published) return latest;
    if (!latest) return published;
    return new Date(published).getTime() > new Date(latest).getTime() ? published : latest;
  }, null);
  const meta = buildCoinGeckoResponseMeta({ endpointFamily: 'GENERAL', lastUpdated, maxAgeMs: 300_000 });

  return NextResponse.json({
    articles,
    count: articles.length,
    page,
    per_page,
    coin_id: coin_id || null,
    source: meta.provider,
    freshnessStatus: meta.freshnessStatus,
    timestamp: meta.lastUpdated,
    meta,
  });
}
