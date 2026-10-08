/**
 * Retired (2026-10-08, public AI endpoint audit): returned a sized order proposal with recommended leverage and an
 * "executable" flag. No caller in the app. Access is still checked first; then 410.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

export async function POST(_request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPaidSessionAccess(session)) return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
  return retiredRouteResponse();
}
