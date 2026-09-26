import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { getOwnershipContext } from '@/lib/ownership/avOwnership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MV-5: insider transactions (last 90 days), congressional trades and institutional (13F) holdings for an equity,
 * summarised server-side from Alpha Vantage. Same access rule as /api/company-overview (Golden Egg Fundamentals).
 * Each section is either { status: 'ok', … } or { status: 'unavailable', reason }.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in to access company data' }, { status: 401 });
  }
  if (!hasPaidSessionAccess(session)) {
    return NextResponse.json({ error: 'Pro subscription required for company fundamentals' }, { status: 403 });
  }
  const rateCheck = apiLimiter.check(getClientIP(request));
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const symbol = (new URL(request.url).searchParams.get('symbol') || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol)) {
    return NextResponse.json({ error: 'Valid equity symbol required' }, { status: 400 });
  }
  const context = await getOwnershipContext(symbol);
  return NextResponse.json({ ...context, source: 'Alpha Vantage' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
