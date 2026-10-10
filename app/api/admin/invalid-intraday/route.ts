import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminErrorText } from '@/lib/admin/errorResponse';
import { getRedis } from '@/lib/redis';
import { clearInvalidIntraday, type InvalidIntradayScan } from '@/lib/worker/invalidIntraday';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function scanClient(): InvalidIntradayScan | null {
  const redis = getRedis();
  if (!redis) return null;
  return redis as unknown as InvalidIntradayScan;
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const all = url.searchParams.get('all') === '1';
  const symbol = url.searchParams.get('symbol');
  if (all && symbol) {
    return NextResponse.json({ ok: false, error: 'pass symbol or all=1, not both' }, { status: 400 });
  }
  if (!all && !symbol) {
    return NextResponse.json({ ok: false, error: 'symbol or all=1 required' }, { status: 400 });
  }
  try {
    const cleared = await clearInvalidIntraday(scanClient(), all ? { all: true } : { symbol: symbol! });
    return NextResponse.json({ ok: true, cleared });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: adminErrorText(e, '/api/admin/invalid-intraday') }, { status: 500 });
  }
}
