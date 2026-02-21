import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { computeCorrelationRegime, type CorrelationRegimeInput } from '@/lib/correlation-regime-engine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/correlation-regime
 * Returns cross-asset correlation regime snapshot.
 * Pass ?btcPrice=...&spyPrice=...&vixPrice=... or POST JSON body.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const toNum = (key: string, fallback: number) => {
    const v = url.searchParams.get(key);
    return v ? parseFloat(v) : fallback;
  };

  const input: CorrelationRegimeInput = {
    btc: {
      symbol: 'BTC',
      price: toNum('btcPrice', 67000),
      change24h: toNum('btcChange', 0),
      timestamp: new Date().toISOString(),
    },
    spy: {
      symbol: 'SPY',
      price: toNum('spyPrice', 540),
      change24h: toNum('spyChange', 0),
      timestamp: new Date().toISOString(),
    },
    vix: {
      symbol: 'VIX',
      price: toNum('vixPrice', 18),
      change24h: toNum('vixChange', 0),
      timestamp: new Date().toISOString(),
    },
    dxy: {
      symbol: 'DXY',
      price: toNum('dxyPrice', 103),
      change24h: toNum('dxyChange', 0),
      timestamp: new Date().toISOString(),
    },
    btcSpyCorrelation: toNum('btcSpyCorr', 0.5),
  };

  const result = computeCorrelationRegime(input);
  return NextResponse.json(result);
}
