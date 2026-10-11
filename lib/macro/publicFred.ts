/**
 * Public yield curve and CPI readings from FRED. No database writes.
 * Inflation is the CPI index year-over-year percent, not a separate series.
 */

import { monthlyAverages, type RatePoint } from '@/lib/macro/avRateSeries';
import { fetchFredObservations } from '@/lib/macro/fred';
import { FRED_PUBLIC_SOURCE, newestObservationDate } from '@/lib/macro/fredSource';

export { FRED_PUBLIC_SOURCE, fredSourceLine, newestObservationDate } from '@/lib/macro/fredSource';

/** Treasury maturity query value to FRED series id. */
export const PUBLIC_YIELD_SERIES = {
  '3month': 'DGS3MO',
  '2year': 'DGS2',
  '5year': 'DGS5',
  '10year': 'DGS10',
  '30year': 'DGS30',
} as const;

export type PublicYieldMaturity = keyof typeof PUBLIC_YIELD_SERIES;

/** CPI index. Inflation percent is derived from this series. */
export const PUBLIC_CPI_SERIES = 'CPIAUCSL';

const PUBLIC_FRED_INDICATORS = ['TREASURY_YIELD', 'CPI', 'INFLATION'] as const;
export type PublicFredIndicator = typeof PUBLIC_FRED_INDICATORS[number];

export function isPublicFredIndicator(indicator: string | null): indicator is PublicFredIndicator {
  return indicator === 'TREASURY_YIELD' || indicator === 'CPI' || indicator === 'INFLATION';
}

export interface PublicSeriesReading {
  value: number | null;
  date: string | null;
  history: RatePoint[];
}

export interface PublicFredMacro {
  source: typeof FRED_PUBLIC_SOURCE;
  asOf: string | null;
  yields: Record<'treasury3m' | 'treasury2y' | 'treasury5y' | 'treasury10y' | 'treasury30y', PublicSeriesReading>;
  cpi: PublicSeriesReading;
  inflationRate: PublicSeriesReading;
}

const YIELD_KEYS = {
  '3month': 'treasury3m',
  '2year': 'treasury2y',
  '5year': 'treasury5y',
  '10year': 'treasury10y',
  '30year': 'treasury30y',
} as const satisfies Record<PublicYieldMaturity, keyof PublicFredMacro['yields']>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function fredPoints(rows: { date: string; value: string }[]): RatePoint[] {
  const out: RatePoint[] = [];
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? '')) continue;
    const raw = (row.value ?? '').trim();
    if (raw === '' || raw === '.' || !/^-?\d+(\.\d+)?$/.test(raw)) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date: row.date, value });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * CPI year-over-year percent, newest first. Each point is
 * (index / index from the same month a year earlier - 1) * 100.
 */
export function cpiYearOverYear(levelsNewestFirst: RatePoint[]): RatePoint[] {
  const byMonth = new Map<string, number>();
  for (const point of levelsNewestFirst) {
    const month = point.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, point.value);
  }
  const out: RatePoint[] = [];
  for (const point of levelsNewestFirst) {
    const month = point.date.slice(0, 7);
    if (byMonth.get(month) !== point.value) continue;
    const [year, monthPart] = month.split('-');
    const prev = byMonth.get(`${Number(year) - 1}-${monthPart}`);
    if (prev == null || prev === 0) continue;
    out.push({ date: point.date, value: round2((point.value / prev - 1) * 100) });
  }
  return out;
}

function levelReading(points: RatePoint[], count: number): PublicSeriesReading {
  const latest = points[0];
  return {
    value: latest?.value ?? null,
    date: latest?.date ?? null,
    history: points.slice(0, count),
  };
}

function observationStart(nowMs: number): string {
  const d = new Date(nowMs);
  d.setUTCMonth(d.getUTCMonth() - 40);
  return d.toISOString().slice(0, 10);
}

async function loadSeries(fredId: string, nowMs: number): Promise<RatePoint[]> {
  const rows = await fetchFredObservations(fredId, observationStart(nowMs));
  return fredPoints(rows);
}

export async function loadPublicFredMacro(nowMs = Date.now()): Promise<PublicFredMacro> {
  const jobs: Array<readonly [PublicYieldMaturity | 'cpi', string]> = [
    ...Object.entries(PUBLIC_YIELD_SERIES).map(([maturity, fredId]) => [maturity as PublicYieldMaturity, fredId] as const),
    ['cpi', PUBLIC_CPI_SERIES] as const,
  ];
  const loaded = await Promise.all(jobs.map(async ([key, fredId]) => {
    try {
      return [key, await loadSeries(fredId, nowMs)] as const;
    } catch (e: unknown) {
      console.warn(`[public-fred] ${fredId} failed:`, e instanceof Error ? e.message : e);
      return [key, [] as RatePoint[]] as const;
    }
  }));
  const byKey = new Map(loaded);
  const yields = {} as PublicFredMacro['yields'];
  for (const maturity of Object.keys(PUBLIC_YIELD_SERIES) as PublicYieldMaturity[]) {
    const points = byKey.get(maturity) ?? [];
    const latest = points[0];
    yields[YIELD_KEYS[maturity]] = {
      value: latest?.value ?? null,
      date: latest?.date ?? null,
      history: monthlyAverages(points, 12, nowMs),
    };
  }
  const cpiPoints = byKey.get('cpi') ?? [];
  const cpi = levelReading(cpiPoints, 12);
  const inflationPoints = cpiYearOverYear(cpiPoints);
  const inflationRate = levelReading(inflationPoints, 24);
  const asOf = newestObservationDate([
    ...Object.values(yields).map((row) => row.date),
    cpi.date,
    inflationRate.date,
  ]);
  return { source: FRED_PUBLIC_SOURCE, asOf, yields, cpi, inflationRate };
}

function formatSeries(input: {
  indicator: PublicFredIndicator;
  name: string;
  category: string;
  unit: string;
  interval: string;
  maturity: string | null;
  points: RatePoint[];
  nowMs: number;
}) {
  const latest = input.points[0];
  const previous = input.points[1];
  const change = latest && previous ? round2(latest.value - previous.value) : null;
  const asOf = latest?.date ?? null;
  return {
    timestamp: new Date(input.nowMs).toISOString(),
    indicator: input.indicator,
    name: input.name,
    category: input.category,
    unit: input.unit,
    interval: input.interval,
    maturity: input.maturity,
    latest: latest ? { date: latest.date, value: latest.value } : null,
    change,
    trend: change == null ? null : change > 0 ? 'rising' : change < 0 ? 'falling' : 'flat',
    history: input.points.slice(0, 24),
    source: FRED_PUBLIC_SOURCE,
    asOf,
  };
}

export async function readPublicFredIndicator(
  indicator: PublicFredIndicator,
  opts: { maturity?: string; interval?: string | null; nowMs?: number } = {},
) {
  const nowMs = opts.nowMs ?? Date.now();
  if (indicator === 'TREASURY_YIELD') {
    const maturity = opts.maturity && opts.maturity in PUBLIC_YIELD_SERIES ? opts.maturity as PublicYieldMaturity : '10year';
    const points = await loadSeries(PUBLIC_YIELD_SERIES[maturity], nowMs);
    const monthly = opts.interval === 'monthly';
    return formatSeries({
      indicator,
      name: 'Treasury Yields',
      category: 'rates',
      unit: '%',
      interval: monthly ? 'monthly' : 'daily',
      maturity,
      points: monthly ? monthlyAverages(points, 24, nowMs) : points,
      nowMs,
    });
  }
  const levels = await loadSeries(PUBLIC_CPI_SERIES, nowMs);
  if (indicator === 'CPI') {
    return formatSeries({
      indicator,
      name: 'Consumer Price Index',
      category: 'inflation',
      unit: 'index',
      interval: 'monthly',
      maturity: null,
      points: levels,
      nowMs,
    });
  }
  return formatSeries({
    indicator,
    name: 'Inflation Rate',
    category: 'inflation',
    unit: '%',
    interval: 'monthly',
    maturity: null,
    points: cpiYearOverYear(levels),
    nowMs,
  });
}
