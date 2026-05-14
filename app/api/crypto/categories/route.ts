import { NextResponse } from 'next/server';
import { buildCoinGeckoResponseMeta, getCoinCategories } from '@/lib/coingecko';
import { getSessionFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
      return NextResponse.json({ 
        success: false, 
        error: 'No category data available',
        meta,
      }, { status: 500 });
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

    return NextResponse.json({
      success: true,
      categories: formatted,
      highlighted: highlighted.length > 0 ? highlighted : formatted.slice(0, 8),
      timestamp: meta.lastUpdated,
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      meta,
    });

  } catch (error) {
    console.error('[Categories API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch categories' 
    }, { status: 500 });
  }
}
