import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { cgBudgetStatus } from '@/lib/admin/cgCredits';
import { getApiUsage } from '@/lib/coingecko';

/**
 * /api/admin/cg-usage
 *
 * Admin-only CoinGecko budget readout. /key is cached for 10 minutes inside cgBudgetStatus.
 * Counts only: no request URLs and no API key.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const budget = await cgBudgetStatus(() => getApiUsage());

  return NextResponse.json({
    plan: budget.plan,
    quota: budget.quota,
    used: budget.used,
    remaining: budget.remaining,
    targetPct: budget.targetPct,
    target: budget.targetCredits,
    todayCap: budget.todayCap,
    callsToday: budget.callsToday,
    refusedToday: budget.refusedToday,
    capMode: budget.capMode,
    source: budget.source,
    checkedAt: budget.checkedAt,
  });
}
