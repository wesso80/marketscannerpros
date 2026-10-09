import { barWindowMs } from '@/lib/admin/barAge';
import { timeframeToSeconds } from '@/lib/engines/dataTruth';

/**
 * Close of the newest completed price bar actually supplied. Never infer a missing prior bar from a forming
 * bar's open, or use a future timestamp as current data. Other packet inputs can have different observation times.
 */
export function symbolObservationAsOf(
  bars: ReadonlyArray<{ timestamp?: string | null }> | null | undefined,
  timeframe: string,
  market: string,
  nowMs: number = Date.now(),
): string | null {
  if (!Number.isFinite(nowMs) || !timeframeToSeconds(timeframe)) return null;
  let newest: number | null = null;
  for (const bar of bars ?? []) {
    if (!bar.timestamp) continue;
    const window = barWindowMs(bar.timestamp, timeframe, market);
    if (!window || !Number.isFinite(window.closeMs) || window.closeMs > nowMs || window.closeMs <= window.openMs) continue;
    if (newest == null || window.closeMs > newest) newest = window.closeMs;
  }
  return newest == null ? null : new Date(newest).toISOString();
}
