import { barAgeFromClose } from '@/lib/admin/barAge';

/**
 * When the Symbol page's input data was observed: the close of the newest completed bar (a forming bar counts
 * from its open, when the previous bar closed). This is the data age, not the packet build time — a packet built
 * now over old bars must still read as old. Returns null when there are no bars or the timestamp is unreadable.
 */
export function symbolObservationAsOf(
  bars: ReadonlyArray<{ timestamp?: string | null }> | null | undefined,
  timeframe: string,
  market: string,
  nowMs: number = Date.now(),
): string | null {
  const last = bars?.length ? bars[bars.length - 1] : null;
  const age = barAgeFromClose(last?.timestamp, timeframe, market, nowMs);
  return age.ageSec == null ? null : new Date(nowMs - age.ageSec * 1000).toISOString();
}
