import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeProbabilityMatrixEngine } from '@/lib/probability-matrix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const pTrend = parseFloat(url.searchParams.get('pTrend') || '0.33');
  const pPin = parseFloat(url.searchParams.get('pPin') || '0.33');
  const pExpansion = parseFloat(url.searchParams.get('pExpansion') || '0.34');
  const conviction = parseFloat(url.searchParams.get('conviction') || '50');
  const expectedMove = parseFloat(url.searchParams.get('expectedMove') || '2');

  const result = computeProbabilityMatrixEngine({
    pTrend, pPin, pExpansion, conviction, expectedMove,
  });

  return NextResponse.json({ success: true, ...result });
}
