import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeEdgeProfile } from '@/lib/intelligence/edgeProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const lookbackDays = url.searchParams.get('days')
    ? parseInt(url.searchParams.get('days')!, 10)
    : null;

  try {
    const profile = await computeEdgeProfile(session.workspaceId, { lookbackDays });
    return NextResponse.json({ success: true, profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute edge profile';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
