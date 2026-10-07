import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

export async function GET(_req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Checked again 6 Oct 2026. OKX public GET /api/v5/public/liquidation-orders
  // needs no key and still answers, but paging BTC-USDT to the last filled order
  // ended at about 22 hours (1,061 orders), short of 24 hours. Contract size is
  // available, so USD math is possible, but the window is not a 24h total.
  // Publishing that sample would overstate coverage. The tile is removed instead.
  return NextResponse.json({
    available: false, summary: null, coins: [], timeframe: null,
    source: null, timestamp: null, freshnessStatus: 'unavailable',
    error: 'Verified liquidation totals are unavailable. The previous recent OKX sample did not establish 24-hour coverage or USD notional.',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
