/**
 * Full Symbol Data API
 * Returns quote + indicators in one call
 * Supports ANY ticker via on-demand fetching
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFullSymbolData } from '@/lib/onDemandFetch';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  // Per-IP rate limit: getFullSymbolData() can hit the paid Alpha Vantage
  // quota on cache-miss, so this public endpoint is throttled.
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

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  try {
    const { quote, indicators } = await getFullSymbolData(symbol);
    
    if (!quote && !indicators) {
      return NextResponse.json({ 
        error: 'Symbol not found or rate limited',
        hint: 'Try again in a few seconds',
        symbol,
      }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      quote,
      indicators,
      hasQuote: !!quote,
      hasIndicators: !!indicators,
    });

  } catch (err: any) {
    console.error('[api/cached/symbol] Error:', err?.message || err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
