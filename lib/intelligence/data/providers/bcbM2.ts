// Brazil M2 provider — official Banco Central do Brasil, SGS series 27842
// "Meios de pagamento ampliados - M2 - saldos em fim de período". Genuine
// nationally-defined M2 (M1 + remunerated deposits + private securities).
// Native unit: R$ thousand (the SGS series returns values in thousands of BRL,
// confirmed by scale — ~7.68e9 → R$7.68T in 2026). Classified EXACT.
import { validateM2Series, fetchJson, type ProviderM2Raw } from './globalM2ProviderTypes';

const SGS_CODE = 27842;
const BR_URL = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SGS_CODE}/dados?formato=json&dataInicial=01/01/2010`;

export const BRAZIL_M2_SOURCE = {
  id: 'BR',
  provider: 'BCB',
  sourceSeries: `SGS ${SGS_CODE} (Meios de pagamento ampliados - M2 - fim de período)`,
  sourceUrl: BR_URL,
  nativeCurrency: 'BRL',
  nativeUnit: 'thousands-BRL',
} as const;

interface SgsRow { data: string; valor: string }

/** Parse a BCB SGS JSON payload ([{data:"DD/MM/YYYY", valor:"123"}]). */
export function parseBcbSgs(rows: SgsRow[]): { month: string; nativeM2: number }[] {
  const byMonth = new Map<string, number>();
  for (const r of rows ?? []) {
    const m = r.data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const value = Number(String(r.valor).replace(/\./g, '').replace(',', '.'));
    if (!m || !Number.isFinite(value)) continue;
    byMonth.set(`${m[3]}-${m[2]}`, value);
  }
  return [...byMonth.entries()].map(([month, nativeM2]) => ({ month, nativeM2 })).sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface BrazilM2Deps {
  fetchRows?: () => Promise<SgsRow[]>;
}

/** Fetch Brazil M2 (BCB SGS 27842) as an ascending monthly series in R$ thousand. */
export async function fetchBrazilM2(deps: BrazilM2Deps = {}): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchRows = deps.fetchRows ?? (() => fetchJson<SgsRow[]>(BR_URL));
  try {
    const m2 = parseBcbSgs(await fetchRows());
    // Brazil M2 in R$ thousand: ~1,200,000,000 (2010) to ~7,700,000,000 (2026).
    validateM2Series(m2, { minNative: 500_000_000, maxNative: 50_000_000_000, minDepth: 13 });
    return { ok: true, ...BRAZIL_M2_SOURCE, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt };
  } catch (e) {
    return { ok: false, ...BRAZIL_M2_SOURCE, m2: [], latestObservationMonth: null, retrievedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
