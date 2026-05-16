/**
 * GET /api/admin/packet-replay?windowDays=90
 * Stage 5: packet-replay backtest report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildPacketReplayReport } from '@/lib/admin/packetReplay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const windowDays = Math.min(Math.max(parseInt(url.searchParams.get('windowDays') ?? '90', 10) || 90, 7), 365);
  try {
    const report = await buildPacketReplayReport(session.workspaceId, windowDays);
    return NextResponse.json({ ok: true, report });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
