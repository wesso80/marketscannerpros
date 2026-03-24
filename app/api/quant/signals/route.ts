/**
 * GET /api/quant/signals — Active signals + history
 *
 * PRIVATE — requires admin authentication.
 * Returns active alerts from the escalation engine + outcome stats.
 */

import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getActiveAlerts } from '@/lib/quant/escalationEngine';
import { getActiveLifecycles, getOutcomeStats } from '@/lib/quant/outcomeEngine';

export const runtime = 'nodejs';

const OPERATOR_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function isOperator(cid: string): boolean {
  const lower = cid.toLowerCase();
  return OPERATOR_EMAILS.some(email =>
    lower === email || lower.endsWith(`_${email}`),
  );
}

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
