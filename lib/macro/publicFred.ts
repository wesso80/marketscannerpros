/**
 * Public macro readings from FRED. No database writes.
 * Inflation is the CPI index year-over-year percent, not a separate series.
 * Real GDP is the quarter-on-quarter annualised growth rate.
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

/** Daily effective federal funds rate. Same series the FRED ingest map already uses. */
export const PUBLIC_FED_FUNDS_SERIES = 'DFF';

/** Monthly unemployment rate. */
export const PUBLIC_UNEMPLOYMENT_SERIES = 'UNRATE';

/**
 * Real GDP, percent change from the preceding quarter, seasonally adjusted annual rate.
 * This is the quarter-on-quarter annualised growth rate, so the level series GDPC1 is not required.
 */
export const PUBLIC_REAL_GDP_GROWTH_SERIES = 'A191RL1Q225SBEA';

const PUBLIC_FRED_INDICATORS = ['TREASURY_YIELD', 'FEDERAL_FUNDS_RATE', 'CPI', 'INFLATION', 'UNEMPLOYMENT', 'REAL_GDP'] as const;
export type PublicFredIndicator = typeof PUBLIC_FRED_INDICATORS[number];

export function isPublicFredIndicator(indicator: string | null): indicator is PublicFredIndicator {
  return (PUBLIC_FRED_INDICATORS as readonly string[]).includes(indicator ?? '');
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
  fedFunds: PublicSeriesReading;
  unemployment: PublicSeriesReading;
  /** Quarter-on-quarter annualised real GDP growth, percent. */
  realGdp: PublicSeriesReading;
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

type LoadedKey = PublicYieldMaturity | 'cpi' | 'fedFunds' | 'unemployment' | 'realGdp';

export async function loadPublicFredMacro(nowMs = Date.now()): Promise<PublicFredMacro> {
  const jobs: Array<readonly [LoadedKey, string]> = [
    ...Object.entries(PUBLIC_YIELD_SERIES).map(([maturity, fredId]) => [maturity as PublicYieldMaturity, fredId] as const),
    ['cpi', PUBLIC_CPI_SERIES] as const,
    ['fedFunds', PUBLIC_FED_FUNDS_SERIES] as const,
    ['unemployment', PUBLIC_UNEMPLOYMENT_SERIES] as const,
    ['realGdp', PUBLIC_REAL_GDP_GROWTH_SERIES] as const,
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
  const fedPoints = byKey.get('fedFunds') ?? [];
  const fedLatest = fedPoints[0];
  const fedFunds: PublicSeriesReading = {
    value: fedLatest?.value ?? null,
    date: fedLatest?.date ?? null,
    history: monthlyAverages(fedPoints, 12, nowMs),
  };
  const unemployment = levelReading(byKey.get('unemployment') ?? [], 24);
  const realGdp = levelReading(byKey.get('realGdp') ?? [], 8);
  const asOf = newestObservationDate([
    ...Object.values(yields).map((row) => row.date),
    cpi.date,
    inflationRate.date,
    fedFunds.date,
    unemployment.date,
    realGdp.date,
  ]);
  return { source: FRED_PUBLIC_SOURCE, asOf, yields, cpi, inflationRate, fedFunds, unemployment, realGdp };
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
  if (indicator === 'FEDERAL_FUNDS_RATE') {
    const points = await loadSeries(PUBLIC_FED_FUNDS_SERIES, nowMs);
    const monthly = opts.interval === 'monthly';
    return formatSeries({
      indicator,
      name: 'Federal Funds Rate',
      category: 'rates',
      unit: '%',
      interval: monthly ? 'monthly' : 'daily',
      maturity: null,
      points: monthly ? monthlyAverages(points, 24, nowMs) : points,
      nowMs,
    });
  }
  if (indicator === 'UNEMPLOYMENT') {
    return formatSeries({
      indicator,
      name: 'Unemployment Rate',
      category: 'employment',
      unit: '%',
      interval: 'monthly',
      maturity: null,
      points: await loadSeries(PUBLIC_UNEMPLOYMENT_SERIES, nowMs),
      nowMs,
    });
  }
  if (indicator === 'REAL_GDP') {
    return formatSeries({
      indicator,
      name: 'Real GDP, quarter-on-quarter annualised',
      category: 'growth',
      unit: '%',
      interval: 'quarterly',
      maturity: null,
      points: await loadSeries(PUBLIC_REAL_GDP_GROWTH_SERIES, nowMs),
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
