import { NextResponse } from 'next/server';
import { getCached } from '@/lib/redis';
import { CACHE_KEYS } from '@/lib/redis';

/**
 * GET /api/health/data
 * Lightweight freshness probe — checks if key market data caches are populated
 * and recent. Used by the StaleDataBanner component.
 */
export async function GET() {
  const STALE_THRESHOLD_SEC = 600; // 10 minutes

  try {
    // Check a few representative cache keys
    const keys = [
      CACHE_KEYS.quote('SPY'),
      CACHE_KEYS.scannerResult('confluence', 'equity'),
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

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (!val) {
        stale = true;
        staleSources.push(keys[i]);
        continue;
      }
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
      source: stale ? 'Market data cache' : undefined,
      checkedAt: new Date().toISOString(),
      details: staleSources.length > 0 ? staleSources : undefined,
    });
  } catch (err) {
    console.error('[health/data] Error:', err);
    return NextResponse.json({ ok: false, stale: true, source: 'Health check failed' });
  }
}
