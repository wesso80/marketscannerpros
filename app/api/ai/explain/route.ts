/**
 * Retired (2026-10-09, public AI advice audit F4): metric explanations that asked the model for an "actionable
 * insight" and cached the unchecked answer for every user. No caller in the app. Sign-in is still checked first;
 * then 410 for both the cached replay (GET) and generation (POST).
 */
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

async function retired() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return retiredRouteResponse();
}

export async function GET() { return retired(); }
export async function POST() { return retired(); }
