import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProAccess } from '@/lib/entitlements';
import { hasValidInternalServiceSecret } from '@/lib/internalServiceAuth';

export async function GET(req: NextRequest) {
  if (!hasValidInternalServiceSecret(req)) {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasProAccess(session.tier)) return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
  }
  // Funding is a payment rate, not an observation of account/position counts.
  return NextResponse.json({
    available: false, average: null, coins: [], source: null, timestamp: null,
    freshnessStatus: 'unavailable', model: null,
    error: 'Exchange-reported long/short positioning is not connected. Funding rates cannot substitute for account ratios.',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
