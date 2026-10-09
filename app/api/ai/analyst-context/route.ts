/**
 * Retired (2026-10-09, public AI advice audit F3): four-tab "Explain / Plan / Act / Learn" analysis whose Act tab
 * included reference zones and position sizing, with no shared guardrail or output check. No caller in the app
 * (its hook was unused). Sign-in is still checked first; then 410.
 */
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

export async function POST() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return retiredRouteResponse();
}
