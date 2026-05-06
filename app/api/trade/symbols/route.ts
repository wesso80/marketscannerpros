// GET /api/trade/symbols?q=ES
// Admin-only. Resolves a symbol to provider-native metadata.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getMarketDataProvider } from '@/lib/trade/marketdata';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = new URL(req.url).searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });

  try {
    const provider = getMarketDataProvider();
    const meta = await provider.resolveSymbol(q);
    if (!meta) return NextResponse.json({ error: 'symbol not found' }, { status: 404 });
    return NextResponse.json({ symbol: meta, source: provider.name, fetchedAt: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'provider error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
