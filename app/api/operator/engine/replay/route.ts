/**
 * GET /api/operator/engine/replay — Retrieve decision snapshots §13.1
 * POST /api/operator/engine/replay — Replay a specific snapshot
 * PRIVATE — requires operator authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator, isAdminSecret } from '@/lib/quant/operatorAuth';
import {
  getRecentSnapshots,
  getSnapshot,
  getSnapshotsBySymbol,
  getSnapshotStats,
} from '@/lib/operator/decision-replay';

export const runtime = 'nodejs';

async function checkAuth(req: NextRequest): Promise<boolean> {
  const adminAuth = isAdminSecret(req.headers.get('authorization'));
  if (adminAuth) return true;
  const session = await getSessionFromCookie();
  return !!session && isOperator(session.cid, session.workspaceId);
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const url = new URL(req.url);
  const snapshotId = url.searchParams.get('id');
  const symbol = url.searchParams.get('symbol');
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

  if (snapshotId) {
    const snapshot = getSnapshot(snapshotId);
    if (!snapshot) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    return NextResponse.json({ ok: true, data: snapshot });
  }

  if (symbol) {
    const snapshots = getSnapshotsBySymbol(symbol.toUpperCase());
    return NextResponse.json({ ok: true, data: snapshots.slice(0, limit) });
  }

  const snapshots = getRecentSnapshots(limit);
  const stats = getSnapshotStats();
  return NextResponse.json({ ok: true, data: { snapshots, stats } });
}
