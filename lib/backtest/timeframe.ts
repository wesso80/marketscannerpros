import { parseTimeframe } from '../timeframes';

export type ParsedBacktestTimeframe = {
  raw: string;
  normalized: string;
  kind: 'daily' | 'intraday';
  minutes: number;
  alphaInterval: '1min' | '5min' | '15min' | '30min' | '60min' | null;
  binanceInterval: string;
  sourceMinutes: number;
  needsResample: boolean;
};

type RangeCoverage = {
  minAvailable: string;
  maxAvailable: string;
  appliedStartDate: string;
  appliedEndDate: string;
  bars: number;
};

function dateOnly(input: string): string {
  return input.split(' ')[0];
}

function toKeyDate(key: string): string {
  const asDate = dateOnly(key);
  return /^\d{4}-\d{2}-\d{2}$/.test(asDate) ? asDate : '';
}

export function parseBacktestTimeframe(raw: string): ParsedBacktestTimeframe | null {
  const parsed = parseTimeframe(raw);
  if (!parsed || !Number.isFinite(parsed.totalMinutes)) return null;

  const minutes = parsed.totalMinutes;
  const normalized = parsed.normalized;
  if (minutes < 1 || minutes > 365 * 1440 * 20) return null;

  if (minutes >= 1440) {
    return {
      raw,
      normalized,
      kind: 'daily',
      minutes,
      alphaInterval: null,
      binanceInterval: '1d',
      sourceMinutes: 1440,
      needsResample: minutes > 1440,
    };
  }

  const alphaIntervals = new Set([1, 5, 15, 30, 60]);
  const binanceIntervals = new Set([1, 3, 5, 15, 30, 60, 120, 240]);

  const alphaSource = alphaIntervals.has(minutes) ? minutes : 1;
  const binanceSource = binanceIntervals.has(minutes) ? minutes : 1;

  const binanceMap: Record<number, string> = {
    1: '1m',
    3: '3m',
    5: '5m',
    15: '15m',
    30: '30m',
    60: '1h',
    120: '2h',
    240: '4h',
  };

  return {
    raw,
    normalized,
    kind: 'intraday',
    minutes,
    alphaInterval: `${alphaSource}min` as '1min' | '5min' | '15min' | '30min' | '60min',
    binanceInterval: binanceMap[binanceSource] || '1m',
    sourceMinutes: Math.min(alphaSource, binanceSource),
    needsResample: minutes !== alphaSource || minutes !== binanceSource,
  };
}

export function isStrategyTimeframeCompatible(strategyTimeframes: readonly string[], parsed: ParsedBacktestTimeframe): boolean {
  const supportsDaily = strategyTimeframes.includes('daily');
  const supportsIntraday = strategyTimeframes.some((timeframe) => timeframe !== 'daily');

  if (parsed.kind === 'daily') return supportsDaily;
  return supportsIntraday;
}

function parseKeyToMs(key: string): number | null {
  if (!key) return null;
  const isoInput = key.includes(' ') ? `${key.replace(' ', 'T')}Z` : `${key}T00:00:00Z`;
  const ms = Date.parse(isoInput);
  return Number.isNaN(ms) ? null : ms;
}

function formatKeyFromMs(ms: number, intraday: boolean): string {
  const date = new Date(ms);
  return intraday
    ? date.toISOString().replace('T', ' ').slice(0, 19)
    : date.toISOString().slice(0, 10);
}

export function resamplePriceData(
  priceData: Record<string, { open: number; high: number; low: number; close: number; volume: number }>,
  targetMinutes: number,
  sourceMinutes: number,
): Record<string, { open: number; high: number; low: number; close: number; volume: number }> {
  if (!targetMinutes || targetMinutes <= sourceMinutes) return priceData;

  const intervalMs = targetMinutes * 60 * 1000;
  const entries = Object.entries(priceData)
    .map(([key, value]) => ({ key, value, ms: parseKeyToMs(key) }))
    .filter((item): item is { key: string; value: { open: number; high: number; low: number; close: number; volume: number }; ms: number } => item.ms !== null)
    .sort((a, b) => a.ms - b.ms);

  if (!entries.length) return priceData;

  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  for (const item of entries) {
    const bucketStart = Math.floor(item.ms / intervalMs) * intervalMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        open: item.value.open,
        high: item.value.high,
        low: item.value.low,
        close: item.value.close,
        volume: item.value.volume,
      });
      continue;
    }

    existing.high = Math.max(existing.high, item.value.high);
    existing.low = Math.min(existing.low, item.value.low);
    existing.close = item.value.close;
    existing.volume += item.value.volume;
  }

  const intraday = targetMinutes < 1440;
  const out: Record<string, { open: number; high: number; low: number; close: number; volume: number }> = {};
  for (const [bucketMs, value] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    out[formatKeyFromMs(bucketMs, intraday)] = value;
  }

  return out;
}

export function computeCoverage(
  priceData: Record<string, { open: number; high: number; low: number; close: number; volume: number }>,
  requestedStartDate: string,
  requestedEndDate: string,
): RangeCoverage {
  const keys = Object.keys(priceData).sort();
  const availableDates = keys.map(toKeyDate).filter(Boolean);

  const minAvailable = availableDates[0] || requestedStartDate;
  const maxAvailable = availableDates[availableDates.length - 1] || requestedEndDate;

  const appliedStartDate = requestedStartDate < minAvailable ? minAvailable : requestedStartDate > maxAvailable ? maxAvailable : requestedStartDate;
  const appliedEndDate = requestedEndDate > maxAvailable ? maxAvailable : requestedEndDate < minAvailable ? minAvailable : requestedEndDate;

  const bars = keys.filter((key) => {
    const d = toKeyDate(key);
    return d && d >= appliedStartDate && d <= appliedEndDate;
  }).length;

  return {
    minAvailable,
    maxAvailable,
    appliedStartDate,
    appliedEndDate,
    bars,
  };
}
