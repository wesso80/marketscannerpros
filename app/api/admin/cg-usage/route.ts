import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getApiUsage, getCGDailyStats } from '@/lib/coingecko';

/**
 * /api/admin/cg-usage
 *
 * Admin dashboard: CoinGecko API usage stats.
 * Combines CoinGecko /key endpoint (monthly) with in-memory daily counter.
 * Protected: requires auth.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get daily stats (Redis-backed, with in-memory fallback)
  const dailyStats = await getCGDailyStats();

  // Get CoinGecko account stats (/key endpoint, Analyst Plan)
  const accountUsage = await getApiUsage();

  return NextResponse.json({
    daily: {
      used: dailyStats.used,
      budget: dailyStats.budget,
      remaining: dailyStats.remaining,
      resetsAt: dailyStats.resetsAt,
      utilizationPercent: dailyStats.budget > 0
        ? Math.round((dailyStats.used / dailyStats.budget) * 100 * 10) / 10
        : 0,
    },
    account: accountUsage || null,
    timestamp: new Date().toISOString(),
  });
}
