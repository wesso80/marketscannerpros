// Japan M2 provider — official BOJ Money Stock (dataset MD02, 货币... M2 average
// amounts outstanding), JPY, in 100-million-yen (億円). Classified ALTERNATIVE.
//
// SOURCE STATUS (verified 2026-09-02): there is currently NO free, no-auth,
// current, machine-readable BOJ M2 feed. FRED's Japan M2 is discontinued (ends
// 2013/2017); DBnomics does not carry BOJ Money Stock; IMF/OECD expose only
// broad money (~M3), not M2. The official BOJ Time-Series Data Search API
// (/getDataCode) requires a registered application ID. This adapter therefore
// FAILS CLOSED until BOJ_API_APP_ID and a confirmed MD02 M2 series code are
// provided — it never substitutes M3/broad money for M2 (data-integrity rule).
import { validateM2Series, fetchText, type ProviderM2Raw } from './globalM2ProviderTypes';

export const JAPAN_M2_SOURCE = {
  id: 'JP',
  provider: 'BOJ',
  sourceSeries: 'MD02 Money Stock / M2 (average amounts outstanding)',
  sourceUrl: 'https://www.stat-search.boj.or.jp/',
  nativeCurrency: 'JPY',
  nativeUnit: '100-million-JPY',
} as const;

/**
 * Parse a BOJ Time-Series download CSV for one series code. Supports the wide
 * format (a header row carries the series code; data rows begin with a
 * `YYYY/MM` date) and the narrow 2-column `date,value` format. Fail-closed:
 * throws if the code column cannot be located or no dated rows parse.
 */
export function parseBojM2Csv(csv: string, seriesCode: string): { month: string; nativeM2: number }[] {
  const rows = csv.split(/\r?\n/).map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
  const dateRe = /^(\d{4})\/(\d{1,2})(?:\/\d{1,2})?$/;

  let col = -1;
  for (const r of rows) {
    const idx = r.findIndex((c) => c === seriesCode);
    if (idx > 0) { col = idx; break; }
  }
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const dm = r[0]?.match(dateRe);
    if (!dm) continue;
    const raw = col >= 0 ? r[col] : r[1];
    const value = Number((raw ?? '').replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    byMonth.set(`${dm[1]}-${dm[2].padStart(2, '0')}`, value);
  }
  if (byMonth.size === 0) throw new Error('BOJ parse: no dated M2 observations found');
  return [...byMonth.entries()].map(([month, nativeM2]) => ({ month, nativeM2 })).sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface JapanM2Deps {
  /** Injected fetch of the raw BOJ CSV (tests). Live path requires app id + code. */
  fetchCsv?: () => Promise<string>;
  seriesCode?: string;
  appId?: string;
}

function resultErr(retrievedAt: string, error: string): ProviderM2Raw {
  return { ok: false, ...JAPAN_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error };
}

/** Fetch Japan M2 (BOJ). Fails closed unless a source is injected or a confirmed
 *  series code + BOJ_API_APP_ID are configured. Never substitutes broad money. */
export async function fetchJapanM2(deps: JapanM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const seriesCode = deps.seriesCode ?? process.env.BOJ_M2_SERIES_CODE ?? '';
  const appId = deps.appId ?? process.env.BOJ_API_APP_ID ?? '';

  let fetchCsv = deps.fetchCsv;
  if (!fetchCsv) {
    if (!appId || !seriesCode) {
      return resultErr(retrievedAt,
        'BOJ M2 source unavailable: set BOJ_API_APP_ID and a confirmed MD02 M2 series code (BOJ_M2_SERIES_CODE). ' +
        'No M3/broad-money substitution is permitted.');
    }
    const url = `https://www.stat-search.boj.or.jp/api/getDataCode/csv/${encodeURIComponent(seriesCode)}?appId=${encodeURIComponent(appId)}`;
    fetchCsv = () => fetchText(url);
  }

  try {
    const m2 = parseBojM2Csv(await fetchCsv(), seriesCode || 'M2');
    // Japan M2 in 億円 (100M yen): ~9,000,000 (2010s) to ~13,000,000 (2020s).
    validateM2Series(m2, { minNative: 3_000_000, maxNative: 30_000_000, minDepth: 13 });
    return { ok: true, ...JAPAN_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return resultErr(retrievedAt, e instanceof Error ? e.message : String(e));
  }
}
