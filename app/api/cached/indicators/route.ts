/**
 * Cached Indicators API
 * Reads from Redis cache → Neon DB → Live fetch fallback
 * Supports ANY ticker via on-demand fetching
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIndicators } from '@/lib/onDemandFetch';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  // Per-IP rate limit: getIndicators() can hit the paid Alpha Vantage quota
  // on cache-miss, so this public endpoint is throttled.
  const ip = getClientIP(req);
  const rateCheck = apiLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', hint: 'Try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
    );
  }

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
