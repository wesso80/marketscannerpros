import { NextRequest, NextResponse } from 'next/server';
import { getCached, CACHE_KEYS } from '@/lib/redis';
import { avCircuit, coinGeckoCircuit, openAICircuit } from '@/lib/circuitBreaker';
import { requireAdmin } from '@/lib/adminAuth';
import { getSessionFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization',
};

/**
 * GET /api/health/data
 * Admin freshness probe. Reports cache age and provider circuit snapshots.
 *
 * Signed-out callers get 401. Signed-in non-admins get 403. Both bodies are
 * `{ error: 'Unauthorized' }` and are returned before any cache read.
 *
 * Public liveness stays on GET /api/health. Uptime monitors use
 * GET /api/health/status. StaleDataBanner treats a non-OK response as
 * "do not show a warning", so a denial does not render provider detail.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req).catch(() => null);
  if (!auth?.ok) {
    const session = await getSessionFromCookie().catch(() => null);
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: session ? 403 : 401, headers: PRIVATE_HEADERS },
    );
  }

  const STALE_THRESHOLD_SEC = 7200; // 2 hours

  try {
    // Check a broad set of representative cache keys across data tiers
    const keys = [
      CACHE_KEYS.quote('SPY'),
      CACHE_KEYS.quote('BTC-USD'),
      CACHE_KEYS.bars('SPY', '1D'),
      CACHE_KEYS.indicators('SPY', '1D'),
      CACHE_KEYS.scannerResult('confluence', 'equity'),
      CACHE_KEYS.marketStatus(),
      CACHE_KEYS.fearGreed(),
    ];

    const values = await Promise.all(
      keys.map(async (key) => {
        const val = await getCached<{ _ts?: number; timestamp?: string }>(key);
        return val;
      }),
    );

    const now = Date.now();
    let stale = false;
    let staleSources: string[] = [];
    let populatedCount = 0;

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (!val) {
        // Key not in cache — skip (no data to be stale about)
        continue;
      }
      populatedCount++;
      // Check _ts (epoch ms) or timestamp (ISO string)
      const ts = val._ts ?? (val.timestamp ? new Date(val.timestamp).getTime() : 0);
      if (ts > 0 && now - ts > STALE_THRESHOLD_SEC * 1000) {
        stale = true;
        staleSources.push(keys[i]);
      }
    }

    return NextResponse.json({
      ok: true,
      stale,
      populatedCount,
      checkedCount: keys.length,
      source: stale ? 'Market data cache' : undefined,
      checkedAt: new Date().toISOString(),
      details: staleSources.length > 0 ? staleSources : undefined,
      circuits: {
        alphaVantage: avCircuit.getSnapshot(),
        coinGecko: coinGeckoCircuit.getSnapshot(),
        openAI: openAICircuit.getSnapshot(),
      },
    }, { headers: PRIVATE_HEADERS });
  } catch (err) {
    console.error('[health/data] Error:', err);
    // On error, don't assume stale — avoid false-positive banner
    return NextResponse.json({ ok: false, stale: false }, { headers: PRIVATE_HEADERS });
  }
}
