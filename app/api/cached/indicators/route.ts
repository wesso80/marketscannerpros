/**
 * Cached Indicators API
 * Reads from Redis cache → Neon DB → Live fetch fallback
 * Supports ANY ticker via on-demand fetching
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIndicators } from '@/lib/onDemandFetch';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').toUpperCase().trim();
  const timeframe = searchParams.get('timeframe') || 'daily';

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  try {
    const indicators = await getIndicators(symbol, timeframe);
    
    if (!indicators) {
      return NextResponse.json({ 
        error: 'Indicators not found or rate limited',
        hint: 'Try again in a few seconds',
        symbol,
        timeframe,
      }, { status: 404 });
    }

    return NextResponse.json(indicators);

  } catch (err: any) {
    console.error('[api/cached/indicators] Error:', err?.message || err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
