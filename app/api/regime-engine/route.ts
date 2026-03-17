import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeRegimeEngine } from '@/lib/regime-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const marketMode = (url.searchParams.get('marketMode') || 'chop') as 'pin' | 'launch' | 'chop';
  const gammaState = (url.searchParams.get('gammaState') || 'Mixed') as 'Positive' | 'Negative' | 'Mixed';
  const atrPercent = parseFloat(url.searchParams.get('atrPercent') || '2');
  const expansionProbability = parseFloat(url.searchParams.get('expansionProbability') || '0.3');
  const dataHealthScore = parseFloat(url.searchParams.get('dataHealthScore') || '80');

  const result = computeRegimeEngine({
    marketMode, gammaState, atrPercent, expansionProbability, dataHealthScore,
  });

  return NextResponse.json({ success: true, ...result });
}
