// Switzerland M2 provider — official SNB snbmonagg, Monetary aggregate M2 (GM2),
// Level, In CHF millions, monthly. Classified EXACT (SNB M2 = the series
// ECONOMICS:CHM2 sources). No silent substitution.
import { validateM2Series, fetchJson, type ProviderM2Raw } from './globalM2ProviderTypes';

const SNB_URL = 'https://data.snb.ch/api/cube/snbmonagg/data/json/en';

export const SWISS_M2_SOURCE = {
  id: 'CH',
  provider: 'SNB',
  sourceSeries: 'snbmonagg{B,GM2} (Monetary aggregate M2, Level)',
  sourceUrl: SNB_URL,
  nativeCurrency: 'CHF',
  nativeUnit: 'millions-CHF',
} as const;

interface SnbCube {
  timeseries: {
    header: { dim: string; dimItem: string }[];
    metadata: { key: string; frequency: string; unit: string };
    values: { date: string; value: number }[];
  }[];
}

/** Select the M2 Level series from an SNB snbmonagg cube payload. */
export function selectSnbM2Series(cube: SnbCube) {
  return cube.timeseries.find((t) => {
    const key = t.metadata?.key ?? '';
    const isM2Key = /\{B,GM2\}$/.test(key);
    const dims = t.header?.map((h) => h.dimItem) ?? [];
    const isM2Header = dims.includes('Monetary aggregate M2') && dims.includes('Level');
    return isM2Key || isM2Header;
  }) ?? null;
}

export interface SwissM2Deps {
  fetchCube?: () => Promise<SnbCube>;
}

/** Fetch Swiss M2 (SNB) as an ascending monthly native series in CHF millions. */
export async function fetchSwissM2(deps: SwissM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchCube = deps.fetchCube ?? (() => fetchJson<SnbCube>(SNB_URL));
  try {
    const cube = await fetchCube();
    const series = selectSnbM2Series(cube);
    if (!series) throw new Error('SNB: Monetary aggregate M2 (Level) series not found');
    if (!/CHF million/i.test(series.metadata.unit)) {
      throw new Error(`SNB: unexpected unit "${series.metadata.unit}" (expected CHF millions)`);
    }
    const m2 = series.values
      .filter((v) => Number.isFinite(v.value))
      .map((v) => ({ month: v.date.slice(0, 7), nativeM2: v.value }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
    // Swiss M2 in CHF millions spans ~200,000 (1980s) to ~1,500,000 (2020s).
    validateM2Series(m2, { minNative: 50_000, maxNative: 3_000_000, minDepth: 13 });
    return { ok: true, ...SWISS_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...SWISS_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
