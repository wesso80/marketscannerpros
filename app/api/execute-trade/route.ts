/**
 * Retired (2026-10-08, public AI endpoint audit): accepted trade proposals in DRY_RUN / PAPER mode (LIVE was already
 * refused). No caller in the app, and no broker execution exists or is permitted. Sign-in is still checked first;
 * then 410. Nothing is evaluated or written.
 */
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

export async function POST() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return retiredRouteResponse();
}
