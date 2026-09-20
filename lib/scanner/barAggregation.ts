/**
 * Pure bar aggregation for the scanner. Deterministic UTC boundaries, correct OHLC, summed volume, no duplicate periods.
 *
 * Partial-bar policy (documented decision): indicators are computed on COMPLETED bars only. The bar whose period has
 * not yet closed is returned separately as `partial` so callers can show the live price without letting a 20%-complete
 * daily candle stand in for a finished one.
 */
export interface Bar {
  /** Bar OPEN time, ISO-8601 UTC. */
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** null = provider gave no volume for this bar (never fabricate 0). */
  volume: number | null;
}

export type ScanBarInterval = '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export const INTERVAL_MS: Record<Exclude<ScanBarInterval, '1w'>, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

const WEEK_MS = 7 * 24 * 60 * 60_000;
/** 1970-01-01 was a Thursday; Monday 00:00 UTC anchors are offset by 4 days from the epoch. */
const MONDAY_ANCHOR_MS = 4 * 24 * 60 * 60_000;

/** Start (ms) of the bucket containing `ms` for a fixed interval, anchored at the UTC epoch. */
export function bucketStart(ms: number, interval: ScanBarInterval): number {
  if (interval === '1w') return Math.floor((ms - MONDAY_ANCHOR_MS) / WEEK_MS) * WEEK_MS + MONDAY_ANCHOR_MS;
  const size = INTERVAL_MS[interval];
  return Math.floor(ms / size) * size;
}

export function bucketEnd(startMs: number, interval: ScanBarInterval): number {
  return startMs + (interval === '1w' ? WEEK_MS : INTERVAL_MS[interval]);
}

/**
 * Aggregate finer bars into `interval` buckets. Input may be unsorted; output is sorted ascending, one bar per bucket.
 * Volume is summed when every constituent has volume; if any constituent lacks volume the bucket volume is null.
 */
export function aggregateBars(bars: Bar[], interval: ScanBarInterval): Bar[] {
  const buckets = new Map<number, { bar: Bar; volumeKnown: boolean }>();
  const sorted = [...bars].filter((b) => Number.isFinite(b.close)).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  for (const b of sorted) {
    const ms = Date.parse(b.t);
    if (!Number.isFinite(ms)) continue;
    const start = bucketStart(ms, interval);
    const existing = buckets.get(start);
    if (!existing) {
      buckets.set(start, {
        bar: { t: new Date(start).toISOString(), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume },
        volumeKnown: b.volume !== null && Number.isFinite(b.volume),
      });
      continue;
    }
    existing.bar.high = Math.max(existing.bar.high, b.high);
    existing.bar.low = Math.min(existing.bar.low, b.low);
    existing.bar.close = b.close;
    if (existing.volumeKnown && b.volume !== null && Number.isFinite(b.volume)) existing.bar.volume = (existing.bar.volume ?? 0) + b.volume;
    else { existing.volumeKnown = false; existing.bar.volume = null; }
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.bar);
}

/** Split off the bar whose period has not closed yet as of `nowMs`. */
export function splitPartialBar(bars: Bar[], interval: ScanBarInterval, nowMs: number): { completed: Bar[]; partial: Bar | null } {
  if (!bars.length) return { completed: [], partial: null };
  const last = bars[bars.length - 1];
  const start = bucketStart(Date.parse(last.t), interval);
  if (bucketEnd(start, interval) > nowMs) return { completed: bars.slice(0, -1), partial: last };
  return { completed: bars, partial: null };
}

/**
 * Build bars from a close-only price series (e.g. CoinGecko market_chart points). High/low are the max/min of the
 * samples inside each bucket — an APPROXIMATION of the true range, and callers must label it as such.
 */
export function barsFromPriceSamples(points: Array<[number, number]>, interval: ScanBarInterval): Bar[] {
  const fine: Bar[] = points
    .filter(([ts, p]) => Number.isFinite(ts) && Number.isFinite(p))
    .map(([ts, p]) => ({ t: new Date(ts).toISOString(), open: p, high: p, low: p, close: p, volume: null }));
  return aggregateBars(fine, interval);
}

/**
 * Attach per-bar volume from CoinGecko `total_volumes` daily points. A point stamped at day D 00:00 UTC is the 24h volume
 * that ENDED at D 00:00, i.e. the volume of the bar that opened at D-1. Bars with no matching point keep volume = null.
 */
export function attachDailyVolumes(bars: Bar[], totalVolumes: Array<[number, number]>): Bar[] {
  const byEnd = new Map<number, number>();
  for (const [ts, v] of totalVolumes) {
    if (!Number.isFinite(ts) || !Number.isFinite(v)) continue;
    byEnd.set(bucketStart(ts, '1d'), v);
  }
  return bars.map((b) => {
    const end = bucketEnd(bucketStart(Date.parse(b.t), '1d'), '1d');
    const v = byEnd.get(end);
    return { ...b, volume: v !== undefined ? v : b.volume };
  });
}

/**
 * Detect a close-to-close discontinuity consistent with an UNADJUSTED corporate action (split / reverse split).
 * A one-bar ratio ≤ 0.6 or ≥ 1.6 on an equity daily series is far outside normal moves; when present, every
 * long-lookback indicator (EMA200, RS, ATR%) is contaminated. Returns the bar index/date and ratio, or null.
 */
export function detectPriceDiscontinuity(closes: number[], dates?: string[], opts: { minRatio?: number; maxRatio?: number } = {}): { index: number; date: string | null; ratio: number } | null {
  const minRatio = opts.minRatio ?? 0.6;
  const maxRatio = opts.maxRatio ?? 1.6;
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (!(prev > 0) || !(cur > 0)) continue;
    const ratio = cur / prev;
    if (ratio <= minRatio || ratio >= maxRatio) return { index: i, date: dates?.[i] ?? null, ratio };
  }
  return null;
}
