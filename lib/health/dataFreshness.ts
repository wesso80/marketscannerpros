import { CACHE_KEYS, getCached } from '@/lib/redis';

/** Same window the admin probe uses. Missing keys are not stale. */
export const STALE_THRESHOLD_SEC = 7200;

export type DataFreshness = {
  stale: boolean;
  populatedCount: number;
  checkedCount: number;
  staleSources: string[];
};

/**
 * Representative cache keys. A key counts as stale only when it exists and
 * its `_ts` or `timestamp` is older than STALE_THRESHOLD_SEC.
 */
export async function readDataFreshness(now = Date.now()): Promise<DataFreshness> {
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
    keys.map((key) => getCached<{ _ts?: number; timestamp?: string }>(key)),
  );

  let stale = false;
  const staleSources: string[] = [];
  let populatedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (!val) continue;
    populatedCount++;
    const ts = val._ts ?? (val.timestamp ? new Date(val.timestamp).getTime() : 0);
    if (ts > 0 && now - ts > STALE_THRESHOLD_SEC * 1000) {
      stale = true;
      staleSources.push(keys[i]);
    }
  }

  return { stale, populatedCount, checkedCount: keys.length, staleSources };
}
