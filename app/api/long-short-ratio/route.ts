import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

import { hasValidInternalServiceSecret } from '@/lib/internalServiceAuth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { buildOkxResponseMeta, getOkxLongShortRatios } from '@/lib/crypto/okxDerivatives';

const CACHE_MS = 10 * 60_000;
// OKX reports hourly periods; allow the latest completed hour plus publication lag.
const MAX_AGE_MS = 2 * 3_600_000;
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];

let cache: { data: any; fetchedAt: number } | null = null;
let inFlight: Promise<any> | null = null;

function unavailable(error: string) {
  return NextResponse.json({
    available: false, average: null, coins: [], source: null, timestamp: null,
    freshnessStatus: 'unavailable', model: null, error,
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

async function load() {
  const coins = await getOkxLongShortRatios(SYMBOLS);
  if (!coins.length) return null;
  const avgRatio = coins.reduce((sum, c) => sum + c.longShortRatio, 0) / coins.length;
  const avgLong = coins.reduce((sum, c) => sum + c.longAccount, 0) / coins.length;
  const avgShort = coins.reduce((sum, c) => sum + c.shortAccount, 0) / coins.length;
  const sentiment: 'Bullish' | 'Bearish' | 'Neutral' = avgRatio > 1.2 ? 'Bullish' : avgRatio < 0.8 ? 'Bearish' : 'Neutral';
  return {
    available: true,
    average: {
      longShortRatio: avgRatio.toFixed(2),
      longPercent: avgLong.toFixed(1),
      shortPercent: avgShort.toFixed(1),
      sentiment,
    },
    coins: coins
      .map((c) => ({
        symbol: c.symbol,
        longShortRatio: Number(c.longShortRatio.toFixed(3)),
        longAccount: Number(c.longAccount.toFixed(2)),
        shortAccount: Number(c.shortAccount.toFixed(2)),
        timestamp: c.timestamp,
      }))
      .sort((a, b) => b.longShortRatio - a.longShortRatio),
    exchange: 'OKX (all contracts per coin)',
    model: 'exchange-reported-account-ratio',
    method: 'Latest hourly OKX long/short account ratio: accounts net long ÷ accounts net short. It counts accounts, not position size.',
    observedAt: Math.min(...coins.map((c) => c.timestamp)),
  };
}

export async function GET(req: NextRequest) {
  if (!hasValidInternalServiceSecret(req)) {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPaidSessionAccess(session)) return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
  }

  let fallbackUsed = false;
  if (!cache || Date.now() - cache.fetchedAt >= CACHE_MS) {
    try {
      inFlight ??= load().finally(() => { inFlight = null; });
      const fresh = await inFlight;
      if (fresh) cache = { data: fresh, fetchedAt: Date.now() };
      else fallbackUsed = Boolean(cache);
    } catch (error) {
      console.error('[L/S Ratio API] OKX error:', error);
      fallbackUsed = Boolean(cache);
    }
  }

  if (!cache) {
    return unavailable('Exchange-reported long/short account ratios are unavailable: the OKX public feed could not be reached.');
  }

  const meta = buildOkxResponseMeta({
    endpointFamily: 'DERIVATIVES',
    lastUpdated: cache.data.observedAt,
    maxAgeMs: MAX_AGE_MS,
    fallbackUsed,
  });
  if (meta.freshnessStatus === 'stale') {
    return unavailable('Exchange-reported long/short account ratios are stale.');
  }
  const { observedAt: _observedAt, ...data } = cache.data;
  return NextResponse.json({
    ...data,
    stale: fallbackUsed || undefined,
    source: meta.provider,
    timestamp: meta.lastUpdated,
    freshnessStatus: meta.freshnessStatus,
    meta,
  });
}
