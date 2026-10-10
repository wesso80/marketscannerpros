import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/adminAuth';
import { getSessionFromCookie } from '@/lib/auth';

/** Logged-in app session, or an internal cron caller. Anonymous browsers are refused. */
export async function cgViewerAllowed(req: Request): Promise<boolean> {
  if (req.headers.get('x-cron-secret') || req.headers.get('authorization')) {
    if (verifyCronAuth(req)) return true;
  }
  const session = await getSessionFromCookie();
  return Boolean(session?.workspaceId);
}

export function cgViewerDenied() {
  return NextResponse.json(
    { error: 'Please log in to access cryptocurrency market data' },
    { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
