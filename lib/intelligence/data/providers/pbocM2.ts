// China M2 provider — official PBOC 货币供应量 (货币和准货币 M2), 亿元, EXACT.
// Promotes the validated parser (commit fda2a196) into an adapter WITHOUT
// weakening its fail-closed validation. No IMF/broad-money/PDF/OCR fallback.
import { parsePbocMoneySupplyHtml } from '@/lib/intelligence/diagnostics/pbocMoneySupply';
import { validateM2Series, fetchText, type ProviderM2Raw } from './globalM2ProviderTypes';

const BASE = 'https://www.pbc.gov.cn';
const ROOT = `${BASE}/diaochatongjisi/116219/116319/index.html`;

/**
 * Versioned manifest of VALIDATED prior-year PBOC Money-Supply IDs.
 * The current year is discovered dynamically via the `{year}ntjsj/hbtjgl`
 * semantic alias. Prior years' year-landing + category (货币统计概览 / Money &
 * Banking Statistics) ids are JS-rendered on pbc.gov.cn and are NOT statically
 * discoverable, and no structured JSON/XML listing endpoint was found; these ids
 * were each verified against the official PBOC year pages. Unknown historical
 * years fail closed (never guessed). Extend as older years are verified.
 */
export interface PbocArchiveEntry { yearId: string; categoryId: string; source: string }
export const PBOC_MONEY_SUPPLY_ARCHIVE: Record<number, PbocArchiveEntry> = {
  2025: { yearId: '5570903', categoryId: '5570886', source: 'pbc.gov.cn' },
  2024: { yearId: '5225358', categoryId: '5225360', source: 'pbc.gov.cn' },
};

/** Build the Money & Banking Statistics (hbtjgl) category URL for a year. */
export function pbocMoneyBankingUrl(year: number, currentYear: number): string | null {
  if (year === currentYear) return `${BASE}/diaochatongjisi/116219/116319/${year}ntjsj/hbtjgl/index.html`;
  const a = PBOC_MONEY_SUPPLY_ARCHIVE[year];
  return a ? `${BASE}/diaochatongjisi/116219/116319/${a.yearId}/${a.categoryId}/index.html` : null;
}

export const CHINA_M2_SOURCE = {
  id: 'CN',
  provider: 'PBOC',
  sourceSeries: '货币供应量/货币和准货币(M2)',
  nativeCurrency: 'CNY',
  nativeUnit: '100-million-CNY',
  definitionBreakpoints: [
    '2011-10 caliber change (housing provident fund + non-depository FI deposits)',
    '2018-01 money-market-fund adjustment',
    '2025-01 M1 revision (M2 unaffected)',
  ],
} as const;

/** Resolve year → landing-page id from the root index (current year = {year}ntjsj). */
export function parsePbocYearIndex(rootHtml: string): Map<number, string> {
  const map = new Map<number, string>();
  const re = /116319\/([A-Za-z0-9]+)\/index\.html"[^>]*>[^<]*?(20\d\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rootHtml)) !== null) {
    const id = m[1]; const year = Number(m[2]);
    if (!map.has(year)) map.set(year, id);
  }
  return map;
}

/** Find the Money-Supply HTML attachment link on a 货币统计概览 (hbtjgl) page. */
export function findMoneySupplyHtmLink(hbtjglHtml: string): string | null {
  // Label-anchored (ASCII "Money Supply"), not DOM-position dependent.
  const m = /Money Supply[\s\S]{0,600}?href="([^"]+\.html?)"/i.exec(hbtjglHtml)
    ?? /货币供应量[\s\S]{0,600}?href="([^"]+\.html?)"/.exec(hbtjglHtml);
  return m ? m[1] : null;
}

function resolve(href: string): string {
  return href.startsWith('http') ? href : `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

export interface ChinaM2Deps {
  fetchHtml?: (url: string) => Promise<string>;
  /** Years to assemble (any order). Default: current + two prior for YoY depth. */
  years?: number[];
}

function resultOk(m2: { month: string; nativeM2: number }[], retrievedAt: string, minDepth: number): ProviderM2Raw {
  validateM2Series(m2, { minNative: 500_000, maxNative: 9_000_000, minDepth });
  return {
    ok: true, id: CHINA_M2_SOURCE.id, provider: CHINA_M2_SOURCE.provider, sourceSeries: CHINA_M2_SOURCE.sourceSeries,
    sourceUrl: ROOT, nativeCurrency: CHINA_M2_SOURCE.nativeCurrency, nativeUnit: CHINA_M2_SOURCE.nativeUnit,
    m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt,
  };
}
function resultErr(retrievedAt: string, error: string): ProviderM2Raw {
  return {
    ok: false, id: CHINA_M2_SOURCE.id, provider: CHINA_M2_SOURCE.provider, sourceSeries: CHINA_M2_SOURCE.sourceSeries,
    sourceUrl: ROOT, nativeCurrency: CHINA_M2_SOURCE.nativeCurrency, nativeUnit: CHINA_M2_SOURCE.nativeUnit,
    m2: [], latestObservationMonth: null, retrievedAt, error,
  };
}

/** Fetch + parse one year's Money-Supply table into month→value pairs. */
async function fetchYearMoneySupply(
  year: number, currentYear: number, fetchHtml: (u: string) => Promise<string>, retrievedAt: string,
): Promise<{ month: string; value: number }[]> {
  const url = pbocMoneyBankingUrl(year, currentYear);
  if (!url) throw new Error(`unresolved-year:${year}`); // fail closed
  const catHtml = await fetchHtml(url);
  const link = findMoneySupplyHtmLink(catHtml);
  if (!link) throw new Error(`money-supply-link-not-found:${year}`);
  const htmUrl = resolve(link);
  const parsed = parsePbocMoneySupplyHtml(await fetchHtml(htmUrl), htmUrl, retrievedAt); // fail-closed
  return parsed.observations.map((o) => ({ month: o.month, value: o.value }));
}

/** Assemble a multi-year monthly China M2 series (bootstrap). Later refreshes
 *  need only the current year via fetchChinaM2Latest. */
async function assemble(years: number[], deps: ChinaM2Deps, minDepth: number): Promise<ProviderM2Raw> {
  const retrievedAt = new Date().toISOString();
  const fetchHtml = deps.fetchHtml ?? ((u: string) => fetchText(u, 'gbk'));
  const currentYear = new Date().getUTCFullYear();
  const byMonth = new Map<string, number>();
  const errors: string[] = [];
  // Deduplicate at the year boundary: later years overwrite nothing (same month
  // never appears in two year tables), and the Map keys guarantee uniqueness.
  for (const year of [...new Set(years)].sort((a, b) => a - b)) {
    try {
      for (const o of await fetchYearMoneySupply(year, currentYear, fetchHtml, retrievedAt)) byMonth.set(o.month, o.value);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (byMonth.size === 0) return resultErr(retrievedAt, `PBOC: no year pages parsed (${errors.join('; ')})`);
  const m2 = [...byMonth.entries()].map(([month, nativeM2]) => ({ month, nativeM2 })).sort((a, b) => (a.month < b.month ? -1 : 1));
  try {
    return resultOk(m2, retrievedAt, minDepth);
  } catch (e) {
    return resultErr(retrievedAt, e instanceof Error ? e.message : String(e));
  }
}

/**
 * BOOTSTRAP: full available official history for the requested years (default
 * current + two prior → ≥13 months for YoY). Architected so extending back
 * toward 1999 only requires adding verified manifest entries — no parser change.
 */
export async function fetchChinaM2History(deps: ChinaM2Deps = {}): Promise<ProviderM2Raw> {
  const now = new Date().getUTCFullYear();
  const years = deps.years ?? [now, now - 1, now - 2];
  return assemble(years, deps, 13);
}

/** INCREMENTAL REFRESH: current year only (cheap monthly cron; no re-bootstrap). */
export async function fetchChinaM2Latest(deps: ChinaM2Deps = {}): Promise<ProviderM2Raw> {
  const now = new Date().getUTCFullYear();
  return assemble([now], { ...deps, years: [now] }, 1);
}

/** Pipeline entry: multi-year history (YoY-capable). */
export async function fetchChinaM2(deps: ChinaM2Deps = {}): Promise<ProviderM2Raw> {
  return fetchChinaM2History(deps);
}
