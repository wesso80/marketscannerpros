// United Kingdom M2 provider — official Bank of England IADB, series LPMVWYH =
// "Monetary financial institutions' sterling and all foreign currency M2 (UK
// estimate of EMU aggregate) liabilities to private and public sectors,
// £ millions, NOT seasonally adjusted". This is a genuine M2 aggregate on the
// EMU-harmonised definition (NOT headline M4). Classified ALTERNATIVE: it is an
// all-currency, EMU-harmonised, NSA M2 estimate, not identical to US M2.
import { validateM2Series, fetchText, type ProviderM2Raw } from './globalM2ProviderTypes';

const BOE_SERIES = 'LPMVWYH';
const BOE_URL =
  `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes` +
  `&Datefrom=01/Jan/1999&Dateto=now&SeriesCodes=${BOE_SERIES}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;

export const UK_M2_SOURCE = {
  id: 'GB',
  provider: 'BOE',
  sourceSeries: `${BOE_SERIES} (M2, UK estimate of EMU aggregate, NSA)`,
  sourceUrl: BOE_URL,
  nativeCurrency: 'GBP',
  nativeUnit: 'millions-GBP',
} as const;

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Parse a BOE IADB CSV ("DATE,LPMVWYH" header; rows "31 Jan 2026,3152508"). */
export function parseBoeCsv(csv: string): { month: string; nativeM2: number }[] {
  const out: { month: string; nativeM2: number }[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const m = line.match(/^\s*\d{1,2}\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s*,\s*([-\d.]+)\s*$/);
    if (!m) continue;
    const mm = MONTHS[m[1].toLowerCase()];
    const value = Number(m[3]);
    if (!mm || !Number.isFinite(value)) continue;
    out.push({ month: `${m[2]}-${mm}`, nativeM2: value });
  }
  // BOE reports one observation per month; keep the last per month, ascending.
  const byMonth = new Map<string, number>();
  for (const o of out) byMonth.set(o.month, o.nativeM2);
  return [...byMonth.entries()].map(([month, nativeM2]) => ({ month, nativeM2 })).sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface UkM2Deps {
  fetchCsv?: () => Promise<string>;
}

/** Fetch UK M2 (BOE LPMVWYH) as an ascending monthly native series in £ millions. */
export async function fetchUkM2(deps: UkM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchCsv = deps.fetchCsv ?? (() => fetchText(BOE_URL));
  try {
    const m2 = parseBoeCsv(await fetchCsv());
    // UK M2 (EMU estimate) in £ millions: ~600,000 (1999) to ~3,300,000 (2020s).
    validateM2Series(m2, { minNative: 300_000, maxNative: 6_000_000, minDepth: 13 });
    return { ok: true, ...UK_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...UK_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
