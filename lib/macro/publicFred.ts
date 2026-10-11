/**
 * Public macro readings from FRED. No database writes.
 * Inflation is the CPI index year-over-year percent, not a separate series.
 * Real GDP is the quarter-on-quarter annualised growth rate.
 */

import { monthlyAverages, type RatePoint } from '@/lib/macro/avRateSeries';
import { fetchFredObservations } from '@/lib/macro/fred';
import { FRED_PUBLIC_SOURCE, FRED_UNAVAILABLE, newestObservationDate } from '@/lib/macro/fredSource';

export { FRED_PUBLIC_SOURCE, FRED_UNAVAILABLE, PUBLIC_FRED_FAILURE_TTL_MS, fredReadingCitation, fredSourceLine, newestObservationDate } from '@/lib/macro/fredSource';

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
  seriesId: string;
  /** True when the FRED read failed. An empty successful history stays false. */
  unavailable: boolean;
}

export interface FredSeriesFailure {
  series: string;
  label: string;
}

export const PUBLIC_SERIES_LABELS: Record<string, string> = {
  DGS3MO: '3-month Treasury',
  DGS2: '2-year Treasury',
  DGS5: '5-year Treasury',
  DGS10: '10-year Treasury',
  DGS30: '30-year Treasury',
  CPIAUCSL: 'CPI',
  DFF: 'Federal funds',
  UNRATE: 'Unemployment',
  A191RL1Q225SBEA: 'Real GDP growth',
};

export interface PublicFredMacro {
  source: typeof FRED_PUBLIC_SOURCE;
  asOf: string | null;
  /** Every requested series failed. Callers return null and skip the long cache. */
  unavailable: boolean;
  failedSeries: FredSeriesFailure[];
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

function observationStart(nowMs: number): string {
  const d = new Date(nowMs);
  d.setUTCMonth(d.getUTCMonth() - 40);
  return d.toISOString().slice(0, 10);
}

async function loadSeries(fredId: string, nowMs: number): Promise<{ points: RatePoint[]; failed: boolean }> {
  try {
    const rows = await fetchFredObservations(fredId, observationStart(nowMs));
    return { points: fredPoints(rows), failed: false };
  } catch (e: unknown) {
    console.warn(`[public-fred] ${fredId} failed:`, e instanceof Error ? e.message : e);
    return { points: [], failed: true };
  }
}

function seriesReading(seriesId: string, points: RatePoint[], failed: boolean, history: RatePoint[]): PublicSeriesReading {
  if (failed) return { value: null, date: null, history: [], seriesId, unavailable: true };
  const latest = points[0];
  return {
    value: latest?.value ?? null,
    date: latest?.date ?? null,
    history,
    seriesId,
    unavailable: false,
  };
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
    const result = await loadSeries(fredId, nowMs);
    return [key, fredId, result] as const;
  }));
  const byKey = new Map(loaded.map(([key, , result]) => [key, result]));
  const failedSeries: FredSeriesFailure[] = loaded
    .filter(([, , result]) => result.failed)
    .map(([, fredId]) => ({ series: fredId, label: PUBLIC_SERIES_LABELS[fredId] ?? fredId }));
  const yields = {} as PublicFredMacro['yields'];
  for (const maturity of Object.keys(PUBLIC_YIELD_SERIES) as PublicYieldMaturity[]) {
    const row = byKey.get(maturity) ?? { points: [], failed: true };
    yields[YIELD_KEYS[maturity]] = seriesReading(PUBLIC_YIELD_SERIES[maturity], row.points, row.failed, monthlyAverages(row.points, 12, nowMs));
  }
  const cpiRow = byKey.get('cpi') ?? { points: [], failed: true };
  const cpi = seriesReading(PUBLIC_CPI_SERIES, cpiRow.points, cpiRow.failed, cpiRow.points.slice(0, 12));
  const inflationPoints = cpiYearOverYear(cpiRow.points);
  const inflationRate = seriesReading(PUBLIC_CPI_SERIES, inflationPoints, cpiRow.failed, inflationPoints.slice(0, 24));
  const fedRow = byKey.get('fedFunds') ?? { points: [], failed: true };
  const fedFunds = seriesReading(PUBLIC_FED_FUNDS_SERIES, fedRow.points, fedRow.failed, monthlyAverages(fedRow.points, 12, nowMs));
  const unemploymentRow = byKey.get('unemployment') ?? { points: [], failed: true };
  const unemployment = seriesReading(PUBLIC_UNEMPLOYMENT_SERIES, unemploymentRow.points, unemploymentRow.failed, unemploymentRow.points.slice(0, 24));
  const gdpRow = byKey.get('realGdp') ?? { points: [], failed: true };
  const realGdp = seriesReading(PUBLIC_REAL_GDP_GROWTH_SERIES, gdpRow.points, gdpRow.failed, gdpRow.points.slice(0, 8));
  const asOf = newestObservationDate([
    ...Object.values(yields).map((row) => row.date),
    cpi.date,
    inflationRate.date,
    fedFunds.date,
    unemployment.date,
    realGdp.date,
  ]);
  return {
    source: FRED_PUBLIC_SOURCE,
    asOf,
    unavailable: failedSeries.length === jobs.length,
    failedSeries,
    yields,
    cpi,
    inflationRate,
    fedFunds,
    unemployment,
    realGdp,
  };
}

function formatSeries(input: {
  indicator: PublicFredIndicator;
  seriesId: string;
  name: string;
  category: string;
  unit: string;
  interval: string;
  maturity: string | null;
  points: RatePoint[];
  failed: boolean;
  nowMs: number;
}) {
  const latest = input.failed ? undefined : input.points[0];
  const previous = input.failed ? undefined : input.points[1];
  const change = latest && previous ? round2(latest.value - previous.value) : null;
  const asOf = latest?.date ?? null;
  return {
    timestamp: new Date(input.nowMs).toISOString(),
    indicator: input.indicator,
    seriesId: input.seriesId,
    name: input.name,
    category: input.category,
    unit: input.unit,
    interval: input.interval,
    maturity: input.maturity,
    latest: latest ? { date: latest.date, value: latest.value } : null,
    change,
    trend: input.failed || change == null ? null : change > 0 ? 'rising' : change < 0 ? 'falling' : 'flat',
    history: input.failed ? [] : input.points.slice(0, 24),
    source: FRED_PUBLIC_SOURCE,
    asOf,
    unavailable: input.failed,
    label: input.failed ? FRED_UNAVAILABLE : null,
  };
}

export async function readPublicFredIndicator(
  indicator: PublicFredIndicator,
  opts: { maturity?: string; interval?: string | null; nowMs?: number } = {},
) {
  const nowMs = opts.nowMs ?? Date.now();
  if (indicator === 'TREASURY_YIELD') {
    const maturity = opts.maturity && opts.maturity in PUBLIC_YIELD_SERIES ? opts.maturity as PublicYieldMaturity : '10year';
    const loaded = await loadSeries(PUBLIC_YIELD_SERIES[maturity], nowMs);
    const monthly = opts.interval === 'monthly';
    return formatSeries({
      indicator,
      seriesId: PUBLIC_YIELD_SERIES[maturity],
      name: 'Treasury Yields',
      category: 'rates',
      unit: '%',
      interval: monthly ? 'monthly' : 'daily',
      maturity,
      points: monthly ? monthlyAverages(loaded.points, 24, nowMs) : loaded.points,
      failed: loaded.failed,
      nowMs,
    });
  }
  if (indicator === 'FEDERAL_FUNDS_RATE') {
    const loaded = await loadSeries(PUBLIC_FED_FUNDS_SERIES, nowMs);
    const monthly = opts.interval === 'monthly';
    return formatSeries({
      indicator,
      seriesId: PUBLIC_FED_FUNDS_SERIES,
      name: 'Federal Funds Rate',
      category: 'rates',
      unit: '%',
      interval: monthly ? 'monthly' : 'daily',
      maturity: null,
      points: monthly ? monthlyAverages(loaded.points, 24, nowMs) : loaded.points,
      failed: loaded.failed,
      nowMs,
    });
  }
  if (indicator === 'UNEMPLOYMENT') {
    const loaded = await loadSeries(PUBLIC_UNEMPLOYMENT_SERIES, nowMs);
    return formatSeries({
      indicator,
      seriesId: PUBLIC_UNEMPLOYMENT_SERIES,
      name: 'Unemployment Rate',
      category: 'employment',
      unit: '%',
      interval: 'monthly',
      maturity: null,
      points: loaded.points,
      failed: loaded.failed,
      nowMs,
    });
  }
  if (indicator === 'REAL_GDP') {
    const loaded = await loadSeries(PUBLIC_REAL_GDP_GROWTH_SERIES, nowMs);
    return formatSeries({
      indicator,
      seriesId: PUBLIC_REAL_GDP_GROWTH_SERIES,
      name: 'Real GDP, quarter-on-quarter annualised',
      category: 'growth',
      unit: '%',
      interval: 'quarterly',
      maturity: null,
      points: loaded.points,
      failed: loaded.failed,
      nowMs,
    });
  }
  const levels = await loadSeries(PUBLIC_CPI_SERIES, nowMs);
  if (indicator === 'CPI') {
    return formatSeries({
      indicator,
      seriesId: PUBLIC_CPI_SERIES,
      name: 'Consumer Price Index',
      category: 'inflation',
      unit: 'index',
      interval: 'monthly',
      maturity: null,
      points: levels.points,
      failed: levels.failed,
      nowMs,
    });
  }
  return formatSeries({
    indicator,
    seriesId: PUBLIC_CPI_SERIES,
    name: 'Inflation Rate',
    category: 'inflation',
    unit: '%',
    interval: 'monthly',
    maturity: null,
    points: cpiYearOverYear(levels.points),
    failed: levels.failed,
    nowMs,
  });
}
