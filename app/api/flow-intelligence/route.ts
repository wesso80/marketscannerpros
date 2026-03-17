import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeFlowEngine } from '@/lib/flow-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol') || 'BTC';
  const bias = (url.searchParams.get('bias') || 'neutral') as 'bullish' | 'bearish' | 'neutral';
  const flowScore = parseFloat(url.searchParams.get('flowScore') || '50');
  const liquidityScore = parseFloat(url.searchParams.get('liquidityScore') || '50');
  const pTrend = parseFloat(url.searchParams.get('pTrend') || '0.33');
  const pPin = parseFloat(url.searchParams.get('pPin') || '0.33');
  const pExpansion = parseFloat(url.searchParams.get('pExpansion') || '0.34');

  const result = computeFlowEngine({
    symbol, bias, flowScore, liquidityScore, pTrend, pPin, pExpansion,
  });

  return NextResponse.json({ success: true, ...result });
}
