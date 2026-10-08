/**
 * Retired (2026-10-08, public AI endpoint audit): stored and listed per-workspace signals with entry, stop and targets.
 * No caller in the app. The shared-scan signal log read by admin diagnostics is written elsewhere and is unaffected.
 */
import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { retiredRouteResponse } from '@/lib/api/retiredRoute';

async function retired() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPaidSessionAccess(session)) return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
  return retiredRouteResponse();
}

export async function POST() { return retired(); }
export async function GET() { return retired(); }
