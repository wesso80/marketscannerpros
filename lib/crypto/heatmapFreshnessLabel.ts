import { formatMarketTime } from '@/lib/market/priceStamp';

export type HeatmapFreshnessInput = {
  asOf?: string | number | null;
  stale?: boolean | null;
  freshnessStatus?: string | null;
};

/** Delayed and stale payloads share one label. A false `stale` flag with status `delayed` is still delayed. */
export function cryptoHeatmapIsDelayed(input: HeatmapFreshnessInput): boolean {
  const status = (input.freshnessStatus ?? '').toLowerCase();
  return input.stale === true || status === 'stale' || status === 'delayed';
}

/** One label. Fresh data says when it was updated. Delayed or stale data says when it was last observed. */
export function cryptoHeatmapFreshnessLabel(input: HeatmapFreshnessInput, timeZone = 'UTC'): string {
  const time = formatMarketTime(input.asOf, timeZone);
  if (cryptoHeatmapIsDelayed(input)) {
    return time ? `Delayed, as of ${time}` : 'Delayed, as of unavailable';
  }
  return time ? `Updated ${time}` : 'Updated time unavailable';
}
