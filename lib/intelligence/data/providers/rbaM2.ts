// Australia provider — official Reserve Bank of Australia, statistical table D3
// "Monetary Aggregates", series DMAM3S = "M3, seasonally adjusted". Australia
// does NOT publish an "M2" aggregate (RBA publishes M1, M3, and Broad Money);
// M3 is the closest official mid-tier aggregate to the M2 concept, so this bloc
// is classified PROXY (not a literal M2). TradingView ECONOMICS:AUM2 is n/a.
// Native unit: AUD billions. FX: AUD × AUDUSD (multiply).
import { validateM2Series, fetchText, type ProviderM2Raw } from './globalM2ProviderTypes';

const RBA_URL = 'https://www.rba.gov.au/statistics/tables/csv/d3-data.csv';
const RBA_SERIES = 'DMAM3S';

export const AUSTRALIA_M3_SOURCE = {
  id: 'AU',
  provider: 'RBA',
  sourceSeries: `${RBA_SERIES} (table D3, M3 seasonally adjusted — closest to M2; AU publishes no M2)`,
  sourceUrl: RBA_URL,
  nativeCurrency: 'AUD',
  nativeUnit: 'billions-AUD',
} as const;

/** Parse the RBA D3 CSV for one series id column (rows dated DD/MM/YYYY). */
export function parseRbaD3(csv: string, seriesId: string): { month: string; nativeM2: number }[] {
  const lines = csv.split(/\r?\n/);
  const idRow = lines.find((l) => l.startsWith('Series ID,'));
  if (!idRow) throw new Error('RBA D3: Series ID row not found');
  const col = idRow.split(',').indexOf(seriesId);
  if (col < 1) throw new Error(`RBA D3: series ${seriesId} column not found`);
  const byMonth = new Map<string, number>();
  for (const l of lines) {
    const m = l.match(/^(\d{2})\/(\d{2})\/(\d{4}),/);
    if (!m) continue;
    const cell = l.split(',')[col];
    const value = Number(cell);
    if (cell === undefined || cell === '' || !Number.isFinite(value)) continue;
    byMonth.set(`${m[3]}-${m[2]}`, value);
  }
  return [...byMonth.entries()].map(([month, nativeM2]) => ({ month, nativeM2 })).sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface AustraliaM2Deps {
  fetchCsv?: () => Promise<string>;
}

/** Fetch Australia M3 SA (RBA D3) as an ascending monthly series in AUD billions. */
export async function fetchAustraliaM2(deps: AustraliaM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchCsv = deps.fetchCsv ?? (() => fetchText(RBA_URL));
  try {
    const m2 = parseRbaD3(await fetchCsv(), RBA_SERIES);
    // Australia M3 in AUD billions: ~10 (1960s) to ~3,000 (2026).
    validateM2Series(m2, { minNative: 5, maxNative: 8_000, minDepth: 13 });
    return { ok: true, ...AUSTRALIA_M3_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...AUSTRALIA_M3_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
