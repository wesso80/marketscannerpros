import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avTakeToken } from '@/lib/avRateGovernor';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

// In-memory cache: keyword → { results, timestamp }
const cache: Map<string, { data: any[]; timestamp: number }> = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours — symbol mappings rarely change

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const keywords = searchParams.get('q')?.trim();

  if (!keywords || keywords.length < 1) {
    return NextResponse.json({ error: 'Query parameter "q" required (min 1 char)' }, { status: 400 });
  }

  // Check cache
  const cacheKey = keywords.toUpperCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ success: true, results: cached.data, cached: true });
  }

  try {
    await avTakeToken();
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keywords)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `AV API error: ${res.status}` }, { status: 502 });
    }

    const json = await res.json();

    if (json['Error Message'] || json['Note']) {
      return NextResponse.json({ error: json['Error Message'] || 'Rate limited' }, { status: 429 });
    }

    const bestMatches = json['bestMatches'] || [];

    const results = bestMatches.map((m: any) => ({
      symbol: m['1. symbol'] || '',
      name: m['2. name'] || '',
      type: m['3. type'] || '',
      region: m['4. region'] || '',
      marketOpen: m['5. marketOpen'] || '',
      marketClose: m['6. marketClose'] || '',
      timezone: m['7. timezone'] || '',
      currency: m['8. currency'] || '',
      matchScore: parseFloat(m['9. matchScore'] || '0'),
    }));

    // Cache results
    cache.set(cacheKey, { data: results, timestamp: Date.now() });

    // Evict old entries if cache grows too large
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 100; i++) cache.delete(oldest[i][0]);
    }

    return NextResponse.json({ success: true, results, count: results.length });
  } catch (err) {
    console.error('[Symbol Search] Error:', err);
    return NextResponse.json({ error: 'Failed to search symbols' }, { status: 500 });
  }
}
