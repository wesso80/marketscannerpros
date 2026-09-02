// South Korea M2 provider — official Bank of Korea ECOS. Genuine M2 (광의통화)
// monthly series. The ECOS API requires a registered authentication key, so this
// adapter is CREDENTIAL-GATED and FAILS CLOSED until ECOS_API_KEY (+ the exact
// statistic/item codes) are configured. It never substitutes IMF/OECD broad
// money. Native unit: KRW billions (십억원). FX: KRW ÷ USDKRW.
import { validateM2Series, fetchJson, type ProviderM2Raw } from './globalM2ProviderTypes';

export const KOREA_M2_SOURCE = {
  id: 'KR',
  provider: 'BOK-ECOS',
  sourceSeries: 'ECOS 101Y003 M2 (평잔, 계절조정) — configurable',
  sourceUrl: 'https://ecos.bok.or.kr/',
  nativeCurrency: 'KRW',
  nativeUnit: 'billions-KRW',
} as const;

interface EcosRow { TIME: string; DATA_VALUE: string; UNIT_NAME?: string; ITEM_NAME1?: string }
interface EcosResp { StatisticSearch?: { row?: EcosRow[] }; RESULT?: { CODE: string; MESSAGE: string } }

/** Parse a BoK ECOS StatisticSearch JSON payload (TIME "YYYYMM"). Fail-closed. */
export function parseEcosM2(json: EcosResp): { month: string; nativeM2: number }[] {
  if (json.RESULT) throw new Error(`ECOS: ${json.RESULT.CODE} ${json.RESULT.MESSAGE}`);
  const rows = json.StatisticSearch?.row ?? [];
  const out: { month: string; nativeM2: number }[] = [];
  for (const r of rows) {
    const m = String(r.TIME).match(/^(\d{4})(\d{2})$/);
    const value = Number(r.DATA_VALUE);
    if (!m || !Number.isFinite(value)) continue;
    out.push({ month: `${m[1]}-${m[2]}`, nativeM2: value });
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface KoreaM2Deps {
  fetchJson?: () => Promise<EcosResp>;
  apiKey?: string;
  statCode?: string;
  itemCode?: string;
}

function resultErr(retrievedAt: string, error: string): ProviderM2Raw {
  return { ok: false, ...KOREA_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error };
}

/** Fetch South Korea M2 (BoK ECOS). Fails closed unless a source is injected or
 *  ECOS_API_KEY + codes are configured. Never substitutes broad money. */
export async function fetchKoreaM2(deps: KoreaM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const apiKey = deps.apiKey ?? process.env.ECOS_API_KEY ?? '';
  const statCode = deps.statCode ?? process.env.ECOS_M2_STAT_CODE ?? '101Y003';
  const itemCode = deps.itemCode ?? process.env.ECOS_M2_ITEM_CODE ?? '';

  let fetchJsonFn = deps.fetchJson;
  if (!fetchJsonFn) {
    if (!apiKey || !itemCode) {
      return resultErr(retrievedAt,
        'BoK ECOS M2 unavailable: set ECOS_API_KEY and confirmed ECOS_M2_STAT_CODE/ECOS_M2_ITEM_CODE. ' +
        'No IMF/OECD broad-money substitution is permitted.');
    }
    const url = `https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(apiKey)}/json/kr/1/600/${encodeURIComponent(statCode)}/M/201001/209912/${encodeURIComponent(itemCode)}`;
    fetchJsonFn = () => fetchJson<EcosResp>(url);
  }
  try {
    const m2 = parseEcosM2(await fetchJsonFn());
    // Korea M2 in KRW billions (십억원): ~1,500,000 (2010s) to ~4,200,000 (2026).
    validateM2Series(m2, { minNative: 500_000, maxNative: 10_000_000, minDepth: 13 });
    return { ok: true, ...KOREA_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return resultErr(retrievedAt, e instanceof Error ? e.message : String(e));
  }
}
