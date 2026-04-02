import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator, isAdminSecret } from '@/lib/quant/operatorAuth';
import { getApiUsage } from '@/lib/coingecko';

/**
 * /api/admin/cg-usage
 *
 * Admin dashboard: CoinGecko API usage stats from the /key endpoint.
 * Protected: requires admin/operator auth.
 */
export async function GET(req: NextRequest) {
  const adminAuth = isAdminSecret(req.headers.get('authorization'));
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const accountUsage = await getApiUsage();

  return NextResponse.json({
    account: accountUsage || null,
    timestamp: new Date().toISOString(),
  });
}
