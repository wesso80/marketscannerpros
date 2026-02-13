/**
 * Full Symbol Data API
 * Returns quote + indicators in one call
 * Supports ANY ticker via on-demand fetching
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFullSymbolData } from '@/lib/onDemandFetch';

export async function GET(req: NextRequest) {
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
