// GET /api/trade/bars?symbol=ES.c.0&resolution=5&from=...&to=...
// Admin-only. Returns OHLCV bars from the configured provider.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getMarketDataProvider } from '@/lib/trade/marketdata';
import type { Resolution } from '@/lib/trade/marketdata';

const VALID_RES: Resolution[] = ['1S', '5S', '15S', '30S', '1', '5', '15', '30', '60', '240', 'D', 'W'];

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  const resolution = url.searchParams.get('resolution') as Resolution | null;
  const fromStr = url.searchParams.get('from');
  const toStr = url.searchParams.get('to');
  const limitStr = url.searchParams.get('limit');

  if (!symbol || !resolution || !fromStr || !toStr) {
    return NextResponse.json({ error: 'missing params: symbol, resolution, from, to' }, { status: 400 });
  }
  if (!VALID_RES.includes(resolution)) {
    return NextResponse.json({ error: `invalid resolution; allowed: ${VALID_RES.join(',')}` }, { status: 400 });
  }
  const from = Number(fromStr);
  const to = Number(toStr);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return NextResponse.json({ error: 'invalid from/to (epoch ms)' }, { status: 400 });
  }
  const limit = limitStr ? Math.max(1, Math.min(50_000, Number(limitStr))) : undefined;

  try {
    const provider = getMarketDataProvider();
    const data = await provider.getBars({ symbol, resolution, from, to, limit });
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, max-age=5',
        'X-Data-Source': data.source,
        'X-Fetched-At': String(data.fetchedAt),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'provider error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
