import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getApiUsage } from '@/lib/coingecko';

/**
 * /api/admin/cg-usage
 *
 * Admin dashboard: CoinGecko API usage stats from the /key endpoint.
 * Protected: requires auth.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountUsage = await getApiUsage();

  return NextResponse.json({
    account: accountUsage || null,
    timestamp: new Date().toISOString(),
  });
}
