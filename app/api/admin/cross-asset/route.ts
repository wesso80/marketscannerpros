/**
 * GET /api/admin/cross-asset?symbol=AAPL
 *
 * Returns the cross-asset confluence report for the given target symbol.
 * Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildCrossAssetReport } from '@/lib/crossAsset/confluence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol')?.trim();
  if (!symbol) return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 });
  try {
    const report = await buildCrossAssetReport(symbol);
    return NextResponse.json({ ok: true, report });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
