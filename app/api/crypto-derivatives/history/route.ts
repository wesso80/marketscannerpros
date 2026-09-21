import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Preserve stored records, but do not draw one continuous series across unknown
  // funding units, intervals, calculation versions or changing venue coverage.
  return NextResponse.json({
    symbol: (req.nextUrl.searchParams.get('symbol') || 'BTC').toUpperCase(),
    available: false, snapshots: [], count: 0,
    reason: 'Historical derivatives snapshots lack verified funding intervals, formula versions and venue coverage. Comparable history is unavailable.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
