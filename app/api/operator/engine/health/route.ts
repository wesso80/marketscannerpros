/**
 * GET /api/operator/engine/health — Meta-health status §13.7
 * Returns system-level health metrics and throttle state.
 * PRIVATE — requires operator authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import { computeMetaHealth } from '@/lib/operator/meta-health';
import { getSnapshotStats } from '@/lib/operator/decision-replay';
import { ENVIRONMENT_MODE } from '@/lib/operator/shared';
import { ENGINE_VERSIONS } from '@/lib/operator/version-registry';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  // Compute meta-health from available data
  // In production, this would pull from stored verdicts and trade reviews
  const health = computeMetaHealth({
    recentVerdicts: [],
    recentReviews: [],
    avgSlippageBps: 10,
    baselineSlippageBps: 10,
  });

  const snapshotStats = getSnapshotStats();

  return NextResponse.json({
    ok: true,
    data: {
      environmentMode: ENVIRONMENT_MODE,
      engineVersions: ENGINE_VERSIONS,
      metaHealth: health,
      snapshotStats,
    },
  });
}
