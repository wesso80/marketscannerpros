import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

export async function GET(_req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // The former REST endpoint was delisted from OKX documentation. Its recent
  // contract-size sample cannot establish a complete 24h USD liquidation total.
  // A supported collector must validate instruments, units and window coverage.
  return NextResponse.json({
    available: false, summary: null, coins: [], timeframe: null,
    source: null, timestamp: null, freshnessStatus: 'unavailable',
    error: 'Verified liquidation totals are unavailable. The previous recent OKX sample did not establish 24-hour coverage or USD notional.',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
