// Japan M2 provider — official Bank of Japan public Time-Series Data Search API
// (launched 2026-02-18, no application ID / API key required).
//
// Series: MD02 / MAM1NAM2M2MO = "M2/Average Amounts Outstanding/Money Stock",
// monthly, 100 million yen (億円). Genuine BOJ M2 — never M3 or broad liquidity.
// Metadata is validated BEFORE the data is accepted (fail-closed on any identity
// mismatch); magnitude checks are secondary. Native unit ×1e8 → JPY, ÷ USDJPY.
import { validateM2Series, fetchJson, type ProviderM2Raw } from './globalM2ProviderTypes';

const BOJ_API = 'https://www.stat-search.boj.or.jp/api/v1';
const DEFAULT_DB = 'MD02';
const DEFAULT_CODE = 'MAM1NAM2M2MO';

export const JAPAN_M2_SOURCE = {
  id: 'JP',
  provider: 'BOJ',
  sourceSeries: `${DEFAULT_DB}/${DEFAULT_CODE} (M2/Average Amounts Outstanding/Money Stock)`,
  sourceUrl: `${BOJ_API}/getDataCode?db=${DEFAULT_DB}&code=${DEFAULT_CODE}`,
  nativeCurrency: 'JPY',
  nativeUnit: '100-million-JPY',
} as const;

interface BojMetaRow {
  SERIES_CODE: string; NAME_OF_TIME_SERIES?: string; UNIT?: string;
  FREQUENCY?: string; CATEGORY?: string; START_OF_THE_TIME_SERIES?: string;
}
export interface BojMetaResp { STATUS?: number; RESULTSET?: BojMetaRow[] }
interface BojDataRow { SERIES_CODE: string; VALUES?: { SURVEY_DATES: number[]; VALUES: (number | string)[] } }
export interface BojDataResp { STATUS?: number; MESSAGE?: string; RESULTSET?: BojDataRow[] }

/** Fail-closed metadata identity check: the configured series MUST be genuine
 *  monthly M2 (Average Amounts Outstanding) Money Stock in 100 million yen. */
export function validateBojM2Metadata(meta: BojMetaResp, code: string): BojMetaRow {
  const row = (meta.RESULTSET ?? []).find((r) => r.SERIES_CODE === code);
  if (!row) throw new Error(`BOJ metadata: series ${code} not found in database`);
  const name = row.NAME_OF_TIME_SERIES ?? '';
  const cat = row.CATEGORY ?? '';
  if (!/\bM2\b/.test(name)) throw new Error(`BOJ metadata: "${name}" is not M2`);
  if (!/average amounts outstanding/i.test(name)) throw new Error(`BOJ metadata: ${code} is not Average Amounts Outstanding`);
  if (!/money stock/i.test(`${name} ${cat}`)) throw new Error(`BOJ metadata: ${code} is not Money Stock`);
  if ((row.FREQUENCY ?? '').toUpperCase() !== 'MONTHLY') throw new Error(`BOJ metadata: ${code} frequency "${row.FREQUENCY}" != MONTHLY`);
  if (!/100 million yen/i.test(row.UNIT ?? '')) throw new Error(`BOJ metadata: ${code} unit "${row.UNIT}" != 100 million yen`);
  return row;
}

/** Parse a BOJ getDataCode JSON payload (parallel SURVEY_DATES/VALUES arrays). */
export function parseBojDataCode(data: BojDataResp, code: string): { month: string; nativeM2: number }[] {
  const row = (data.RESULTSET ?? []).find((r) => r.SERIES_CODE === code) ?? data.RESULTSET?.[0];
  const dates = row?.VALUES?.SURVEY_DATES ?? [];
  const vals = row?.VALUES?.VALUES ?? [];
  const out: { month: string; nativeM2: number }[] = [];
  for (let i = 0; i < dates.length; i++) {
    const m = String(dates[i]).match(/^(\d{4})(\d{2})$/);
    const v = Number(vals[i]);
    if (!m || !Number.isFinite(v)) continue;
    out.push({ month: `${m[1]}-${m[2]}`, nativeM2: v });
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface JapanM2Deps {
  fetchMeta?: () => Promise<BojMetaResp>;
  fetchData?: () => Promise<BojDataResp>;
  db?: string;
  seriesCode?: string;
}

/** Fetch Japan M2 (BOJ public API). No credentials required. Validates official
 *  metadata identity first, then parses the monthly series (億円). */
export async function fetchJapanM2(deps: JapanM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const db = deps.db ?? process.env.BOJ_M2_DB ?? DEFAULT_DB;
  const code = deps.seriesCode ?? process.env.BOJ_M2_SERIES_CODE ?? DEFAULT_CODE;
  try {
    const meta = deps.fetchMeta
      ? await deps.fetchMeta()
      : await fetchJson<BojMetaResp>(`${BOJ_API}/getMetadata?db=${encodeURIComponent(db)}&format=json`);
    validateBojM2Metadata(meta, code); // fail closed on identity mismatch (not just magnitude)

    const data = deps.fetchData
      ? await deps.fetchData()
      : await fetchJson<BojDataResp>(`${BOJ_API}/getDataCode?db=${encodeURIComponent(db)}&code=${encodeURIComponent(code)}&format=json`);
    const m2 = parseBojDataCode(data, code);
    // Japan M2 in 億円: ~6,700,000 (2003) to ~13,000,000 (2026).
    validateM2Series(m2, { minNative: 3_000_000, maxNative: 30_000_000, minDepth: 13 });
    return { ok: true, ...JAPAN_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...JAPAN_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
