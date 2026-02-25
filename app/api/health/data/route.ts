import { NextResponse } from 'next/server';
import { getCached } from '@/lib/redis';
import { CACHE_KEYS } from '@/lib/redis';

/**
 * GET /api/health/data
 * Lightweight freshness probe — checks if key market data caches are populated
 * and recent. Used by the StaleDataBanner component.
 *
 * Only flags stale when a cache key EXISTS but is too old.
 * Missing keys are ignored (cache simply hasn't been populated yet).
 */
export async function GET() {
  const STALE_THRESHOLD_SEC = 7200; // 2 hours

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
      source: stale ? 'Market data cache' : undefined,
      checkedAt: new Date().toISOString(),
      details: staleSources.length > 0 ? staleSources : undefined,
    });
  } catch (err) {
    console.error('[health/data] Error:', err);
    // On error, don't assume stale — avoid false-positive banner
    return NextResponse.json({ ok: false, stale: false });
  }
}
