/**
 * GET /api/quant/signals — Active signals + history
 *
 * PRIVATE — requires admin authentication.
 * Returns active alerts from the escalation engine + outcome stats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import { getActiveAlerts } from '@/lib/quant/escalationEngine';
import { getActiveLifecycles, getOutcomeStats } from '@/lib/quant/outcomeEngine';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Auth gate: operators only (ms_auth cookie OR admin secret)
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  try {
    const alerts = getActiveAlerts();
    const lifecycles = getActiveLifecycles();
    const stats = await getOutcomeStats();

    return NextResponse.json({
      activeAlerts: alerts,
      trackedLifecycles: lifecycles.length,
      outcomeStats: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[quant:signals] Error:', err);
    return NextResponse.json(
      { error: 'Signal retrieval failed', detail: err.message },
      { status: 500 },
    );
  }
}
