import { NextRequest, NextResponse } from 'next/server';

const CACHE_DURATION = 3600; // 1 hour cache
let cache: { data: any; timestamp: number } | null = null;

export async function GET(req: NextRequest) {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    return NextResponse.json(cache.data);
  }

  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=30', {
      next: { revalidate: 3600 }, // Next.js cache
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();

    if (!data.data || !data.data.length) {
      throw new Error('Invalid response from Alternative.me');
    }

    const result = {
      current: {
        value: parseInt(data.data[0].value),
        classification: data.data[0].value_classification,
        timestamp: new Date(parseInt(data.data[0].timestamp) * 1000).toISOString(),
        timeUntilUpdate: parseInt(data.data[0].time_until_update || '0'),
      },
      history: data.data.slice(0, 30).map((d: any) => ({
        value: parseInt(d.value),
        classification: d.value_classification,
        date: new Date(parseInt(d.timestamp) * 1000).toISOString(),
      })),
      source: 'alternative.me',
      market: 'crypto',
      cachedAt: new Date().toISOString(),
    };

    // Update cache
    cache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Fear & Greed API error:', error);
    
    // Return cached data if available, even if stale
    if (cache) {
      return NextResponse.json({
        ...cache.data,
        stale: true,
        error: 'Using cached data due to API error',
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch Fear & Greed Index' },
      { status: 500 }
    );
  }
}
