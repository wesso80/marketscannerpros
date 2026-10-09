/**
 * Retired (2026-10-08, public AI endpoint audit): served the stored daily market focus (bullish / bearish phase
 * language). Its only caller, components/DailyAIMarketFocus, was never mounted and has been removed. Access is still
 * checked first; then 410. The generation job is unchanged.
 */
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPaidSessionAccess(session)) return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
  return retiredRouteResponse();
}
