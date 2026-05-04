import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getApiUsage } from '@/lib/coingecko';

/**
 * /api/admin/cg-usage
 *
 * Admin dashboard: CoinGecko API usage stats from the /key endpoint.
 * Protected: requires admin/operator auth.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const accountUsage = await getApiUsage();

  return NextResponse.json({
    account: accountUsage || null,
    timestamp: new Date().toISOString(),
  });
}
