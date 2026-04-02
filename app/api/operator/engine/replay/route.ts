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
  getRecentSnapshotsFromDB,
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
    const snapshot = await getSnapshot(snapshotId);
    if (!snapshot) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    return NextResponse.json({ ok: true, data: snapshot });
  }

  if (symbol) {
    const snapshots = await getSnapshotsBySymbol(symbol.toUpperCase(), limit);
    return NextResponse.json({ ok: true, data: snapshots });
  }

  // Try memory cache first, fall back to DB for full history
  const memSnapshots = getRecentSnapshots(limit);
  if (memSnapshots.length >= limit) {
    const stats = getSnapshotStats();
    return NextResponse.json({ ok: true, data: { snapshots: memSnapshots, stats } });
  }

  const dbSnapshots = await getRecentSnapshotsFromDB(limit);
  const stats = getSnapshotStats();
  return NextResponse.json({ ok: true, data: { snapshots: dbSnapshots.length > memSnapshots.length ? dbSnapshots : memSnapshots, stats } });
}
