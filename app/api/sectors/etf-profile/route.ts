import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { getEtfProfileCached } from '@/lib/etf/etfProfile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MV-6: top holdings and sector weights for an ETF (Markets & sectors → Sectors), from Alpha Vantage ETF_PROFILE,
 * cached server-side. Same access rule as /api/sectors/heatmap (signed-in users). Returns { status: 'ok', … } or
 * { status: 'unavailable', reason }.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access market data' }, { status: 401 });
  }
  if (!apiLimiter.check(getClientIP(request)).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const symbol = (new URL(request.url).searchParams.get('symbol') || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: 'Valid ETF symbol required' }, { status: 400 });
  }
  const profile = await getEtfProfileCached(symbol);
  return NextResponse.json({ ...profile, source: 'Alpha Vantage ETF_PROFILE' }, { headers: { 'Cache-Control': 'private, max-age=600' } });
}
