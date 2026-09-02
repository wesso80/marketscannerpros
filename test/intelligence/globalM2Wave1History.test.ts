import { describe, it, expect } from 'vitest';
import {
  fetchChinaM2History, fetchChinaM2Latest, pbocMoneyBankingUrl, PBOC_MONEY_SUPPLY_ARCHIVE,
} from '@/lib/intelligence/data/providers/pbocM2';
import { normalizeM2BlocFull } from '@/lib/intelligence/data/globalM2Normalize';
import { computeGlobalM2, GLOBAL_M2_CONFIG } from '@/lib/intelligence/engines/globalM2';
import { buildWave1Bundle } from '@/lib/intelligence/data/globalM2Pipeline';

const CURRENT_YEAR = new Date().getUTCFullYear();
const yearIdToYear = new Map(Object.entries(PBOC_MONEY_SUPPLY_ARCHIVE).map(([y, e]) => [e.yearId, Number(y)]));

function msTable(year: number, monthCount: number, base: number): string {
  const months = Array.from({ length: monthCount }, (_, i) => `${year}.${String(i + 1).padStart(2, '0')}`);
  const m2 = months.map((_, i) => (base + i * 5000).toFixed(2));
  const m1 = months.map((_, i) => (base * 0.35 + i * 2000).toFixed(2));
  return `<table>
    <tr><td>货币供应量</td></tr>
    <tr><td>单位：亿元人民币 Unit:100 Million Yuan</td></tr>
    <tr><td>项目 Item</td>${months.map((m) => `<td>${m}</td>`).join('')}</tr>
    <tr><td>货币和准货币（M2） Money &amp; Quasi-money</td>${m2.map((v) => `<td>${v}</td>`).join('')}</tr>
    <tr><td>货币（M1） Money</td>${m1.map((v) => `<td>${v}</td>`).join('')}</tr>
  </table>`;
}
function baseFor(y: number): number { return 3_000_000 + (y - 2024) * 200_000; }
function deriveYear(url: string): number | null {
  const alias = url.match(/\/(\d{4})ntjsj\//); if (alias) return Number(alias[1]);
  const idm = url.match(/116319\/(\d+)\//); if (idm && yearIdToYear.has(idm[1])) return yearIdToYear.get(idm[1])!;
  return null;
}
function pbocMock(): (url: string) => Promise<string> {
  return async (url: string) => {
    const ms = url.match(/\/ms\/(\d{4})\.htm/);
    if (ms) { const y = Number(ms[1]); return msTable(y, y === CURRENT_YEAR ? 7 : 12, baseFor(y)); }
    const y = deriveYear(url);
    if (y == null) throw new Error('404 ' + url);
    return `<td>货币供应量 Money Supply</td><td><a href="/ms/${y}.htm">htm</a></td>`;
  };
}

describe('PBOC previous-year discovery + manifest', () => {
  it('resolves current year via alias and prior years via verified manifest', () => {
    expect(pbocMoneyBankingUrl(CURRENT_YEAR, CURRENT_YEAR)).toContain(`${CURRENT_YEAR}ntjsj/hbtjgl`);
    expect(pbocMoneyBankingUrl(2025, CURRENT_YEAR)).toContain('/5570903/5570886/');
    expect(pbocMoneyBankingUrl(2024, CURRENT_YEAR)).toContain('/5225358/5225360/');
  });
  it('fails closed for an unknown historical year', () => {
    expect(pbocMoneyBankingUrl(2099, CURRENT_YEAR)).toBeNull();
  });
});

describe('PBOC multi-year history assembly', () => {
  it('multi-year history concatenation: 2024+2025+current joined into one series', async () => {
    const r = await fetchChinaM2History({ fetchHtml: pbocMock(), years: [2024, 2025, CURRENT_YEAR] });
    expect(r.ok).toBe(true);
    const months = r.m2.map((o) => o.month);
    expect(months[0]).toBe('2024-01');
    expect(months).toContain('2025-06');
    expect(months).toContain(`${CURRENT_YEAR}-01`);
  });

  it('year-boundary duplicate prevention: every month appears once', async () => {
    const r = await fetchChinaM2History({ fetchHtml: pbocMock(), years: [2024, 2025, CURRENT_YEAR, 2025] });
    const months = r.m2.map((o) => o.month);
    expect(new Set(months).size).toBe(months.length);
  });

  it('2025-12 → 2026-01 ordering: strictly ascending across the year boundary', async () => {
    const r = await fetchChinaM2History({ fetchHtml: pbocMock(), years: [2024, 2025, CURRENT_YEAR] });
    const months = r.m2.map((o) => o.month);
    for (let i = 1; i < months.length; i++) expect(months[i] > months[i - 1]).toBe(true);
    expect(months.indexOf('2026-01')).toBe(months.indexOf('2025-12') + 1);
  });

  it('12-month China lookback: ≥13 months so the YoY (r12) resolves', async () => {
    const r = await fetchChinaM2History({ fetchHtml: pbocMock(), years: [2024, 2025, CURRENT_YEAR] });
    expect(r.m2.length).toBeGreaterThanOrEqual(13);
    const bloc = normalizeM2BlocFull({
      id: 'CN', name: 'China', nativeCurrency: 'CNY', nativeUnit: '100-million-CNY', classification: 'EXACT',
      provider: 'PBOC', sourceSeries: 'M2', retrievedAt: 'now', nativeUnitScale: 1e8, fxDirection: 'none', fxPair: null,
      m2: r.m2,
    });
    const res = computeGlobalM2({ blocs: [bloc] }, GLOBAL_M2_CONFIG);
    expect(res.blocs[0].r12).not.toBeNull(); // YoY available
  });

  it('historical discovery failure → fail closed (no fabricated series)', async () => {
    const r = await fetchChinaM2History({ fetchHtml: pbocMock(), years: [2099] });
    expect(r.ok).toBe(false);
    expect(r.m2).toHaveLength(0);
  });
});

describe('PBOC incremental refresh', () => {
  it('refresh returns only the current year and never duplicates bootstrap history', async () => {
    const history = await fetchChinaM2History({ fetchHtml: pbocMock(), years: [2024, 2025, CURRENT_YEAR] });
    const latest = await fetchChinaM2Latest({ fetchHtml: pbocMock() });
    expect(latest.ok).toBe(true);
    // Every refreshed month already exists in history (no new/duplicate rows).
    const hist = new Set(history.m2.map((o) => o.month));
    for (const o of latest.m2) expect(hist.has(o.month)).toBe(true);
    expect(latest.m2.every((o) => o.month.startsWith(String(CURRENT_YEAR)))).toBe(true);
  });
});

/* ── Interpretation eligibility (coverage-gated) ─────────────────────────── */
function fx(pair: string) {
  return { ok: true, pair, daily: Array.from({ length: 24 }, (_, i) => ({ date: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-28`, rate: pair === 'USDCNY' ? 7.1 : 0.8 })), retrievedAt: 'now' };
}
function m2f(id: string, provider: string, unit: string, base: number) {
  const m2 = Array.from({ length: 15 }, (_, i) => ({ month: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, nativeM2: base + i * (base * 0.002) }));
  return { ok: true, id, provider, sourceSeries: 'M2', sourceUrl: 'u', nativeCurrency: 'X', nativeUnit: unit, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt: 'now' };
}
const threeBlocDeps = {
  us: async () => m2f('US', 'FRED', 'billions-USD', 22000),
  china: async () => m2f('CN', 'PBOC', '100-million-CNY', 3000000),
  swiss: async () => m2f('CH', 'SNB', 'millions-CHF', 1100000),
  usdcny: async () => fx('USDCNY'),
  usdchf: async () => fx('USDCHF'),
};

describe('Interpretation eligibility', () => {
  it('<95% estimated weighted coverage → PARTIAL, interpretation ineligible', async () => {
    const b = await buildWave1Bundle(threeBlocDeps); // default threshold 95, ~56% coverage
    expect(b.eligibility.interpretationEligible).toBe(false);
    expect(b.eligibility.headlineEligible).toBe(false);
    expect(b.eligibility.calculationStatus).toBe('PARTIAL');
  });
  it('≥ threshold → eligible (configurable threshold)', async () => {
    const b = await buildWave1Bundle(threeBlocDeps, { interpretationThreshold: 40 });
    expect(b.eligibility.interpretationEligible).toBe(true);
    expect(b.eligibility.calculationStatus).toBe('COMPLETE');
    expect(b.eligibility.weightedCoverageThreshold).toBe(40);
  });
});
