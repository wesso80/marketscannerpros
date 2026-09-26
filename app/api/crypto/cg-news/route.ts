import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { buildCoinGeckoResponseMeta, getCryptoNews } from '@/lib/coingecko';
import { isCryptoRelevantNews } from '@/lib/crypto/newsRelevance';

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
  const requestedType = searchParams.get('type');
  if (requestedType && !['all', 'news', 'guides'].includes(requestedType)) {
    return NextResponse.json({ error: 'Unsupported news type.' }, { status: 400 });
  }
  const type = requestedType && requestedType !== 'all' ? requestedType as 'news' | 'guides' : undefined;
  if (type === 'guides' && !coin_id?.trim()) {
    return NextResponse.json({ error: 'Choose a coin to load its guides.' }, { status: 400 });
  }
  const language = searchParams.get('language') || 'en';
  const page = Math.max(1, Math.min(parseInt(searchParams.get('page') || '1', 10) || 1, 20));
  const per_page = Math.max(1, Math.min(parseInt(searchParams.get('per_page') || '20', 10) || 20, 20));

  const fetched = await getCryptoNews({ coin_id, type, language, page, per_page });

  if (!fetched) {
    return NextResponse.json({ error: 'Failed to fetch crypto news' }, { status: 502 });
  }

  // The general feed (no coin_id) includes general-market and political stories; keep crypto-relevant items only.
  const articles = coin_id ? fetched : fetched.filter(isCryptoRelevantNews);

  const lastUpdated = articles.reduce<string | null>((latest, article: any) => {
    const published = article?.posted_at ?? article?.published_at ?? article?.created_at ?? null;
    if (!published || !Number.isFinite(Date.parse(published))) return latest;
    if (!latest) return published;
    return new Date(published).getTime() > new Date(latest).getTime() ? published : latest;
  }, null);
  const meta = buildCoinGeckoResponseMeta({ endpointFamily: 'GENERAL', lastUpdated, maxAgeMs: 300_000 });

  return NextResponse.json({
    articles,
    count: articles.length,
    excluded_off_topic: fetched.length - articles.length,
    page,
    per_page,
    coin_id: coin_id || null,
    source: meta.provider,
    freshnessStatus: meta.freshnessStatus,
    timestamp: meta.lastUpdated,
    meta,
  });
}
