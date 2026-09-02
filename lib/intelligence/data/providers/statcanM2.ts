// Canada M2 provider — official Statistics Canada Web Data Service, table
// 10-10-0116-01, vector v41552796 = "M2 (gross) (currency outside banks,
// chartered bank demand and notice deposits, chartered bank personal term
// deposits, adjustments to M2 (gross))". Genuine Canadian M2. Native unit: CAD
// millions (StatCan scalarFactorCode 6). Classified EXACT.
import { validateM2Series, type ProviderM2Raw } from './globalM2ProviderTypes';

const CA_VECTOR = 41552796;
const CA_URL = 'https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods';

export const CANADA_M2_SOURCE = {
  id: 'CA',
  provider: 'StatCan',
  sourceSeries: `v${CA_VECTOR} (table 10-10-0116-01, M2 gross)`,
  sourceUrl: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1010011601',
  nativeCurrency: 'CAD',
  nativeUnit: 'millions-CAD',
} as const;

interface StatCanPoint { refPer: string; value: number }
interface StatCanResp { status: string; object: { vectorId: number; vectorDataPoint: StatCanPoint[] } }

/** Parse a StatCan getDataFromVectors response into ascending monthly points. */
export function parseStatCanVector(resp: StatCanResp[]): { month: string; nativeM2: number }[] {
  const pts = resp?.[0]?.object?.vectorDataPoint ?? [];
  const out: { month: string; nativeM2: number }[] = [];
  for (const p of pts) {
    const month = p.refPer?.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(p.value)) continue;
    out.push({ month, nativeM2: p.value });
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface CanadaM2Deps {
  fetchVector?: () => Promise<StatCanResp[]>;
}

/** Fetch Canada M2 gross (StatCan v41552796) as an ascending monthly series (CAD millions). */
export async function fetchCanadaM2(deps: CanadaM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchVector = deps.fetchVector ?? (async () => {
    const r = await fetch(CA_URL, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify([{ vectorId: CA_VECTOR, latestN: 480 }]),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for StatCan`);
    return (await r.json()) as StatCanResp[];
  });
  try {
    const m2 = parseStatCanVector(await fetchVector());
    // Canada M2 gross in CAD millions: ~400,000 (1990s) to ~2,900,000 (2026).
    validateM2Series(m2, { minNative: 100_000, maxNative: 5_000_000, minDepth: 13 });
    return { ok: true, ...CANADA_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...CANADA_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
