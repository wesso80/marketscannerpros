// Euro Area M2 provider — official ECB Data Portal (SDW), dataflow BSI, series
// BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E = "Monetary aggregate M2, Stocks" (M20),
// euro area (changing composition), outstanding amounts, EUR millions, working-
// day & seasonally adjusted. Genuine M2 (not M3). Classified ALTERNATIVE: it is
// the euro-area harmonised M2 definition, not identical to US M2.
import { validateM2Series, fetchText, type ProviderM2Raw } from './globalM2ProviderTypes';

const ECB_KEY = 'M.U2.Y.V.M20.X.1.U2.2300.Z01.E';
const ECB_URL = `https://data-api.ecb.europa.eu/service/data/BSI/${ECB_KEY}?startPeriod=2000-01&format=csvdata`;

export const EURO_M2_SOURCE = {
  id: 'EU',
  provider: 'ECB',
  sourceSeries: `BSI.${ECB_KEY} (Monetary aggregate M2, Stocks)`,
  sourceUrl: ECB_URL,
  nativeCurrency: 'EUR',
  nativeUnit: 'millions-EUR',
} as const;

/** Parse an ECB `format=csvdata` payload. TIME_PERIOD is column 12, OBS_VALUE
 *  column 13 — both precede the quoted TITLE columns, so a plain split is safe. */
export function parseEcbCsvData(csv: string): { month: string; nativeM2: number }[] {
  const out: { month: string; nativeM2: number }[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line.startsWith('BSI.')) continue;
    const f = line.split(',');
    const month = f[12];
    const value = Number(f[13]);
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(value)) continue;
    out.push({ month, nativeM2: value });
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface EuroM2Deps {
  fetchCsv?: () => Promise<string>;
}

/** Fetch Euro Area M2 (ECB) as an ascending monthly native series in EUR millions. */
export async function fetchEuroM2(deps: EuroM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchCsv = deps.fetchCsv ?? (() => fetchText(ECB_URL));
  try {
    const m2 = parseEcbCsvData(await fetchCsv());
    // Euro-area M2 in EUR millions: ~4,500,000 (2000) to ~16,500,000 (2020s).
    validateM2Series(m2, { minNative: 1_000_000, maxNative: 40_000_000, minDepth: 13 });
    return { ok: true, ...EURO_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...EURO_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
