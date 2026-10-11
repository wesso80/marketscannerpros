import { NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta, getCoinCategories } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';
import { loadShortCached, shortCacheControl, UncachedBody } from '@/lib/cache/shortResponse';

const CATEGORIES_CACHE_KEY = 'route:crypto-categories:v1';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  }

  try {
    const { value } = await loadShortCached(CATEGORIES_CACHE_KEY, async () => {
    const categories = await getCoinCategories();
    const upstreamUpdatedAt = categories?.reduce<string | null>((latest, cat) => {
      if (!cat.updated_at) return latest;
      if (!latest) return cat.updated_at;
      return new Date(cat.updated_at).getTime() > new Date(latest).getTime() ? cat.updated_at : latest;
    }, null);
    
    if (!categories?.length) {
      const meta = buildCoinGeckoResponseMeta({
        endpointFamily: 'CATEGORIES',
        lastUpdated: upstreamUpdatedAt,
        maxAgeMs: 300_000,
      });
      throw new UncachedBody(500, { 
        success: false, 
        error: 'No category data available',
        meta,
      });
    }

    // Format categories with key sectors
    const formatted = categories.slice(0, 30).map(cat => ({
      id: cat.id,
      name: cat.name,
      marketCap: cat.market_cap,
      change24h: cat.market_cap_change_24h,
      volume24h: cat.volume_24h,
      topCoins: cat.top_3_coins,
    }));

    // Identify key sectors for quick view
    const keySectors = [
      'layer-1', 'layer-2', 'defi', 'meme-token', 
      'artificial-intelligence', 'gaming', 'nft', 'real-world-assets'
    ];

    const highlighted = formatted.filter(cat => 
      keySectors.some(key => cat.id.includes(key))
    );

    const meta = buildCoinGeckoResponseMeta({
      endpointFamily: 'CATEGORIES',
      lastUpdated: upstreamUpdatedAt,
      maxAgeMs: 300_000,
    });

    return {
      success: true,
      categories: formatted,
      highlighted: highlighted.length > 0 ? highlighted : formatted.slice(0, 8),
      timestamp: meta.lastUpdated,
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      meta,
    };
    });

    return NextResponse.json(value, { headers: { 'Cache-Control': shortCacheControl(false) } });
  } catch (error) {
    if (error instanceof UncachedBody) {
      return NextResponse.json(error.body, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    }
    console.error('[Categories API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch categories' 
    }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
