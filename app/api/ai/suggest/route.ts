/**
 * Retired (2026-10-08, public AI endpoint audit): "Next Best Actions" suggestions built on the adaptive trader
 * profile. No caller in the app. Sign-in is still checked first; then 410.
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
export async function PATCH() { return retired(); }
