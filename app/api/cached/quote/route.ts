/**
 * Cached Quote API
 * Reads from Redis cache → Neon DB → Live fetch fallback
 * Supports ANY ticker via on-demand fetching
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/onDemandFetch';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').toUpperCase().trim();

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  try {
    const quote = await getQuote(symbol);
    
    if (!quote) {
      return NextResponse.json({ 
        error: 'Symbol not found or rate limited',
        hint: 'Try again in a few seconds',
        symbol,
      }, { status: 404 });
    }

    return NextResponse.json(quote);

  } catch (err: any) {
    console.error('[api/cached/quote] Error:', err?.message || err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
