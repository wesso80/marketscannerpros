import { describe, it, expect } from 'vitest';
import { parseBcbSgs, fetchBrazilM2 } from '@/lib/intelligence/data/providers/bcbM2';
import { parseStatCanVector, fetchCanadaM2 } from '@/lib/intelligence/data/providers/statcanM2';
import { parseRbaD3, fetchAustraliaM2 } from '@/lib/intelligence/data/providers/rbaM2';
import { parseEcosM2, fetchKoreaM2 } from '@/lib/intelligence/data/providers/bokM2';
import { fetchIndiaM2 } from '@/lib/intelligence/data/providers/rbiM2';
import { convertM2ToUsd, normalizeM2BlocFull, type DailyFxPoint } from '@/lib/intelligence/data/globalM2Normalize';
import { buildWave3Bundle } from '@/lib/intelligence/data/globalM2Pipeline';
import type { ProviderM2Raw, ProviderFxRaw } from '@/lib/intelligence/data/providers/globalM2ProviderTypes';

/* ── Fixtures ──────────────────────────────────────────────────────────────── */
const MON = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
function months(n: number, endY = 2026, endM = 6): string[] {
  const out: string[] = [];
  let y = endY, m = endM;
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${MON[m - 1]}`); m--; if (m === 0) { m = 12; y--; } }
  return out;
}
function m2raw(id: string, provider: string, unit: string, base: number, step: number, n = 18): ProviderM2Raw {
  const ms = months(n);
  const m2 = ms.map((month, i) => ({ month, nativeM2: base + i * step }));
  return { ok: true, id, provider, sourceSeries: 'S', sourceUrl: 'u', nativeCurrency: 'X', nativeUnit: unit, m2, latestObservationMonth: ms[ms.length - 1], retrievedAt: 'now' };
}
function fail(id: string, provider: string, error: string): ProviderM2Raw {
  return { ok: false, id, provider, sourceSeries: 'S', sourceUrl: 'u', nativeCurrency: 'X', nativeUnit: 'x', m2: [], latestObservationMonth: null, retrievedAt: 'now', error };
}
function fx(pair: string, rate: number, n = 20): ProviderFxRaw {
  const ms = months(n);
  return { ok: true, pair, daily: ms.map((mo) => ({ date: `${mo}-28`, rate })), retrievedAt: 'now' };
}

/* ── Brazil (BCB SGS 27842) ────────────────────────────────────────────────── */
describe('Brazil BCB SGS M2', () => {
  it('parses DD/MM/YYYY rows ascending and dedups', () => {
    const out = parseBcbSgs([{ data: '01/07/2026', valor: '7680857903' }, { data: '01/06/2026', valor: '7657462757' }]);
    expect(out.map((o) => o.month)).toEqual(['2026-06', '2026-07']);
    expect(out[1].nativeM2).toBe(7680857903);
  });
  it('fetch ok with sufficient history', async () => {
    const rows = months(14).map((mo, i) => ({ data: `01/${mo.slice(5)}/${mo.slice(0, 4)}`, valor: String(5_000_000_000 + i * 10_000_000) }));
    const r = await fetchBrazilM2({ fetchRows: async () => rows });
    expect(r.ok).toBe(true);
    expect(r.nativeUnit).toBe('thousands-BRL');
  });
  it('fails closed on short history', async () => {
    const r = await fetchBrazilM2({ fetchRows: async () => [{ data: '01/06/2026', valor: '7000000000' }] });
    expect(r.ok).toBe(false);
  });
});

/* ── Canada (StatCan v41552796 M2 gross) ───────────────────────────────────── */
describe('Canada StatCan M2 gross', () => {
  it('parses vectorDataPoint refPer→month', () => {
    const out = parseStatCanVector([{ status: 'SUCCESS', object: { vectorId: 41552796, vectorDataPoint: [{ refPer: '2026-05-01', value: 2832736 }, { refPer: '2026-04-01', value: 2816934 }] } }]);
    expect(out).toEqual([{ month: '2026-04', nativeM2: 2816934 }, { month: '2026-05', nativeM2: 2832736 }]);
  });
  it('fetch ok with history and correct unit', async () => {
    const pts = months(14).map((mo, i) => ({ refPer: `${mo}-01`, value: 2_500_000 + i * 5_000 }));
    const r = await fetchCanadaM2({ fetchVector: async () => [{ status: 'SUCCESS', object: { vectorId: 41552796, vectorDataPoint: pts } }] });
    expect(r.ok).toBe(true);
    expect(r.nativeUnit).toBe('millions-CAD');
    expect(r.sourceSeries).toContain('41552796');
  });
  it('fails closed on empty vector', async () => {
    const r = await fetchCanadaM2({ fetchVector: async () => [{ status: 'SUCCESS', object: { vectorId: 41552796, vectorDataPoint: [] } }] });
    expect(r.ok).toBe(false);
  });
});

/* ── Australia (RBA D3 M3 SA, PROXY) ───────────────────────────────────────── */
const RBA_CSV = [
  'Title,,,M3',
  'Description,,,M3',
  'Frequency,,,Monthly',
  'Type,,,Original',
  'Units,,,$ billion',
  'Source,,,RBA',
  'Publication date,,,31-Aug-2026',
  'Series ID,DMACN,DMAM1S,DMAM3S',
  ...months(14).map((mo, i) => `${mo.slice(8) || '15'}/${mo.slice(5, 7)}/${mo.slice(0, 4)},5.0,10.0,${(3000 + i * 5).toFixed(1)}`),
].join('\n');
describe('Australia RBA D3 M3', () => {
  it('parses the requested series column only', () => {
    const out = parseRbaD3(RBA_CSV, 'DMAM3S');
    expect(out.length).toBe(14);
    expect(out[out.length - 1].nativeM2).toBeCloseTo(3065, 0);
  });
  it('classifies as PROXY (M3, no AU M2) and fetches ok', async () => {
    const r = await fetchAustraliaM2({ fetchCsv: async () => RBA_CSV });
    expect(r.ok).toBe(true);
    expect(r.nativeUnit).toBe('billions-AUD');
    expect(r.sourceSeries).toContain('M3');
  });
  it('fails closed when the series column is absent', async () => {
    const r = await fetchAustraliaM2({ fetchCsv: async () => 'Series ID,DMACN\n01/06/2026,5.0' });
    expect(r.ok).toBe(false);
  });
});

/* ── South Korea (BoK ECOS, credential-gated) ──────────────────────────────── */
describe('Korea BoK ECOS M2', () => {
  it('parses TIME YYYYMM rows', () => {
    const out = parseEcosM2({ StatisticSearch: { row: [{ TIME: '202606', DATA_VALUE: '4012345.6' }, { TIME: '202605', DATA_VALUE: '4000000' }] } });
    expect(out.map((o) => o.month)).toEqual(['2026-05', '2026-06']);
  });
  it('throws on ECOS RESULT error (fail-closed parse)', () => {
    expect(() => parseEcosM2({ RESULT: { CODE: 'INFO-100', MESSAGE: 'bad key' } })).toThrow();
  });
  it('fails closed without an API key/item code', async () => {
    const r = await fetchKoreaM2({ apiKey: '', itemCode: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECOS_API_KEY/);
  });
  it('fetches ok with injected source', async () => {
    const rows = months(14).map((mo) => ({ TIME: mo.replace('-', ''), DATA_VALUE: String(4_000_000) }));
    const r = await fetchKoreaM2({ fetchJson: async () => ({ StatisticSearch: { row: rows } }) });
    expect(r.ok).toBe(true);
    expect(r.nativeUnit).toBe('billions-KRW');
  });
});

/* ── India (RBI, fail-closed / no substitution) ────────────────────────────── */
describe('India RBI — fail closed', () => {
  it('fails closed (no genuine current M2) and does not substitute', async () => {
    const r = await fetchIndiaM2();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/discontinued M2/);
  });
  it('accepts an explicitly injected series (tests only)', async () => {
    const r = await fetchIndiaM2({ fetchM2: async () => months(14).map((mo, i) => ({ month: mo, nativeM2: 7_000_000 + i })) });
    expect(r.ok).toBe(true);
  });
});

/* ── FX direction + MONTH_END_LAST_VALID + no forward leakage ──────────────── */
describe('Wave-3 FX directions', () => {
  it('divide vs multiply', () => {
    expect(convertM2ToUsd(1000, 1.38, 'divide')).toBeCloseTo(724.64, 1);   // CAD/CAD÷USDCAD
    expect(convertM2ToUsd(1000, 0.69, 'multiply')).toBeCloseTo(690, 1);     // AUD×AUDUSD
    expect(convertM2ToUsd(1000, 83, 'divide')).toBeCloseTo(12.05, 1);       // INR÷USDINR
    expect(convertM2ToUsd(1000, 1350, 'divide')).toBeCloseTo(0.7407, 3);    // KRW÷USDKRW
    expect(convertM2ToUsd(1000, 5.16, 'divide')).toBeCloseTo(193.8, 1);     // BRL÷USDBRL
  });
  it('Canada divide and Australia multiply normalize to USD with no forward FX leakage', () => {
    const ca = normalizeM2BlocFull({
      id: 'CA', name: 'Canada', nativeCurrency: 'CAD', nativeUnit: 'millions-CAD', classification: 'EXACT',
      provider: 'StatCan', sourceSeries: 'v41552796', retrievedAt: 'now', nativeUnitScale: 1e6,
      fxDirection: 'divide', fxPair: 'USDCAD',
      dailyFx: [{ date: '2026-06-15', rate: 1.38 }, { date: '2026-07-10', rate: 1.30 }] as DailyFxPoint[],
      m2: [{ month: '2026-05', nativeM2: 2_800_000 }, { month: '2026-06', nativeM2: 2_830_000 }],
    });
    const jun = ca.observations.find((o) => o.month === '2026-06')!;
    expect(jun.fxObservationDate).toBe('2026-06-15');            // never the July close
    expect(jun.usdM2).toBeCloseTo((2_830_000 * 1e6) / 1.38, 0);

    const au = normalizeM2BlocFull({
      id: 'AU', name: 'Australia', nativeCurrency: 'AUD', nativeUnit: 'billions-AUD', classification: 'PROXY',
      provider: 'RBA', sourceSeries: 'DMAM3S', retrievedAt: 'now', nativeUnitScale: 1e9,
      fxDirection: 'multiply', fxPair: 'AUDUSD',
      dailyFx: [{ date: '2026-06-20', rate: 0.69 }] as DailyFxPoint[],
      m2: [{ month: '2026-06', nativeM2: 3_480 }],
    });
    expect(au.observations[0].usdM2).toBeCloseTo(3_480 * 1e9 * 0.69, 0);
  });
});

/* ── Multi-provider Wave-3 integration ─────────────────────────────────────── */
function fullDeps(extra: Partial<Parameters<typeof buildWave3Bundle>[0]> = {}) {
  return {
    us: async () => m2raw('US', 'FRED', 'billions-USD', 22000, 20),
    china: async () => m2raw('CN', 'PBOC', '100-million-CNY', 3_000_000, 5000),
    swiss: async () => m2raw('CH', 'SNB', 'millions-CHF', 1_100_000, 1000),
    euro: async () => m2raw('EU', 'ECB', 'millions-EUR', 16_000_000, 20000),
    uk: async () => m2raw('GB', 'BOE', 'millions-GBP', 3_200_000, 4000),
    japan: async () => m2raw('JP', 'BOJ', '100-million-JPY', 12_000_000, 8000),
    canada: async () => m2raw('CA', 'StatCan', 'millions-CAD', 2_800_000, 3000),
    australia: async () => m2raw('AU', 'RBA', 'billions-AUD', 3400, 4),
    india: async () => m2raw('IN', 'RBI', 'crore-INR', 25_000_000, 30000),
    korea: async () => m2raw('KR', 'BOK-ECOS', 'billions-KRW', 4_000_000, 5000),
    brazil: async () => m2raw('BR', 'BCB', 'thousands-BRL', 7_000_000_000, 10_000_000),
    usdcny: async () => fx('USDCNY', 7.1), usdchf: async () => fx('USDCHF', 0.81),
    eurusd: async () => fx('EURUSD', 1.14), gbpusd: async () => fx('GBPUSD', 1.33),
    usdjpy: async () => fx('USDJPY', 150), usdcad: async () => fx('USDCAD', 1.38),
    audusd: async () => fx('AUDUSD', 0.69), usdinr: async () => fx('USDINR', 83),
    usdkrw: async () => fx('USDKRW', 1350), usdbrl: async () => fx('USDBRL', 5.16),
    ...extra,
  };
}
describe('Wave-3 integration', () => {
  it('all eleven present → 11 valid, coverage-eligible when threshold met', async () => {
    const b = await buildWave3Bundle(fullDeps(), { interpretationThreshold: 40 });
    expect(b.result.validBlocCount).toBe(11);
    expect(b.missingBlocIds).toHaveLength(0);
    expect(b.eligibility.interpretationEligible).toBe(true);
    expect(b.result.quality.parityStatus).toBe('DATA_PARITY_PENDING');
  });
  it('default JP/IN/KR fail closed → 8 valid, <95% PARTIAL', async () => {
    // Deterministic injected failures (no live BOJ/RBI/ECOS network); failed blocs must be dropped, not substituted.
    const b = await buildWave3Bundle(fullDeps({
      japan: async () => fail('JP', 'BOJ', 'fetch failed for www.stat-search.boj.or.jp in 500ms'),
      india: async () => fail('IN', 'RBI', 'India M2 DATA_UNAVAILABLE: RBI discontinued M2/M4 in 2017'),
      korea: async () => fail('KR', 'BOK-ECOS', 'BoK ECOS M2 unavailable: set ECOS_API_KEY'),
    }));
    expect(b.result.validBlocCount).toBe(8);
    expect(b.missingBlocIds.sort()).toEqual(['IN', 'JP', 'KR']);
    expect(b.eligibility.interpretationEligible).toBe(false);
    expect(b.eligibility.calculationStatus).toBe('PARTIAL');
  });
});
