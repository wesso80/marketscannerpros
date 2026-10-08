import { buildPriceChart } from '@/lib/research/symbolPriceChart';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { fetchPrice } from '@/lib/goldenEggFetchers';
import { COINGECKO_ID_MAP } from '@/lib/coingecko';
import { buildSymbolComparison } from '@/lib/research/symbolComparison';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return reply({ error: 'Please log in' }, 401);
    if (!hasPaidSessionAccess(session)) return reply({ error: 'Pro access required' }, 403);
    const qs = request.nextUrl.searchParams, symbol = (qs.get('symbol') || '').trim().toUpperCase(), type = qs.get('type');
    const days = Number(qs.get('days') || 90);
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol) || !['equity', 'crypto'].includes(type || '') || ![30, 90, 365].includes(days)) return reply({ error: 'Invalid comparison request' }, 400);
    // Ambiguous ticker search is not adequate identity for a benchmark comparison.
    if (type === 'crypto' && !Object.prototype.hasOwnProperty.call(COINGECKO_ID_MAP, symbol)) return reply({ error: 'Comparison unavailable: crypto identity is not mapped.' }, 422);
    const rate = apiLimiter.check(getClientIP(request));
    if (!rate.allowed) return reply({ error: 'Too many comparison requests' }, 429);
    const asset = type as 'equity' | 'crypto';
    const names = [...new Set([symbol, ...(asset === 'equity' ? ['SPY', 'QQQ'] : ['BTC'])])];
    const results = await Promise.allSettled(names.map(name => fetchPrice(name, asset, { requireHistoricals: true, avInterval: 'daily' })));
    const inputs = results.flatMap((result, i) => result.status === 'fulfilled' && result.value ? [{ symbol: names[i], source: result.value.source || 'source unavailable', closes: result.value.historicalCloses || [], dates: result.value.historicalDates || [] }] : []);
    const now = Date.now();
    const selected = results[0]?.status === 'fulfilled' ? results[0].value : null;
    return reply({ ...buildSymbolComparison(symbol, asset, inputs, days, now), price: buildPriceChart(selected, asset, days, now) });
  } catch { return reply({ error: 'Comparison temporarily unavailable' }, 503); }
}
