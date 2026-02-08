import { NextResponse } from 'next/server';
import { getCoinCategories } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const categories = await getCoinCategories();
    
    if (!categories?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No category data available' 
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

    return NextResponse.json({
      success: true,
      categories: formatted,
      highlighted: highlighted.length > 0 ? highlighted : formatted.slice(0, 8),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Categories API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch categories' 
    }, { status: 500 });
  }
}
