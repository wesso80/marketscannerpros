import { describe, it, expect } from 'vitest';
import { parseEcbCsvData, fetchEuroM2 } from '@/lib/intelligence/data/providers/ecbM2';
import { parseBoeCsv, fetchUkM2 } from '@/lib/intelligence/data/providers/boeM2';
import { parseBojM2Csv, fetchJapanM2 } from '@/lib/intelligence/data/providers/bojM2';
import { convertM2ToUsd } from '@/lib/intelligence/data/globalM2Normalize';
import { buildWave2Bundle, type Wave2Deps } from '@/lib/intelligence/data/globalM2Pipeline';
import type { ProviderM2Raw, ProviderFxRaw } from '@/lib/intelligence/data/providers/globalM2ProviderTypes';

/* ── fixtures ─────────────────────────────────────────────────────────────── */
const MON = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
function genMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-based, current month
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${MON[m]}`);
    m -= 1; if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}
function ecbLine(month: string, val: number): string {
  return `BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E,M,U2,Y,V,M20,X,1,U2,2300,Z01,E,${month},${val},A,F`;
}
function ecbCsv(n: number, base = 15_000_000, step = 40_000): string {
  const head = 'KEY,FREQ,REF_AREA,ADJUSTMENT,BS_REP_SECTOR,BS_ITEM,MATURITY_ORIG,DATA_TYPE,COUNT_AREA,BS_COUNT_SECTOR,CURRENCY_TRANS,BS_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS,OBS_CONF';
  return [head, ...genMonths(n).map((mo, i) => ecbLine(mo, base + i * step))].join('\n');
}
function boeCsv(n: number, base = 3_000_000, step = 5_000): string {
  const rows = genMonths(n).map((mo, i) => {
    const [y, m] = mo.split('-');
    const nm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
    return `28 ${nm} ${y},${base + i * step}`;
  });
  return ['DATE,LPMVWYH', ...rows].join('\n');
}
function bojCsv(n: number, code = 'MD02TEST', base = 12_000_000, step = 10_000): string {
  const rows = genMonths(n).map((mo, i) => {
    const [y, m] = mo.split('-');
    return `"${y}/${m}",${base + i * step}`;
  });
  return [`"Series code","${code}"`, ...rows].join('\n');
}
function fxRaw(pair: string, rate: number): ProviderFxRaw {
  return { ok: true, pair, retrievedAt: 'now', daily: genMonths(18).map((mo) => ({ date: `${mo}-28`, rate })) };
}
function m2raw(id: string, provider: string, unit: string, base: number, step: number, n = 15): ProviderM2Raw {
  const m2 = genMonths(n).map((month, i) => ({ month, nativeM2: base + i * step }));
  return { ok: true, id, provider, sourceSeries: `${id}-M2`, sourceUrl: 'u', nativeCurrency: 'X', nativeUnit: unit, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt: 'now' };
}
function sixDeps(over: Partial<Wave2Deps> = {}): Wave2Deps {
  return {
    us: async () => m2raw('US', 'FRED', 'billions-USD', 22_000, 40),
    china: async () => m2raw('CN', 'PBOC', '100-million-CNY', 3_500_000, 6_000),
    swiss: async () => m2raw('CH', 'SNB', 'millions-CHF', 1_100_000, 2_000),
    euro: async () => m2raw('EU', 'ECB', 'millions-EUR', 16_000_000, 30_000),
    uk: async () => m2raw('GB', 'BOE', 'millions-GBP', 3_200_000, 5_000),
    japan: async () => m2raw('JP', 'BOJ', '100-million-JPY', 12_000_000, 10_000),
    usdcny: async () => fxRaw('USDCNY', 7.1),
    usdchf: async () => fxRaw('USDCHF', 0.81),
    eurusd: async () => fxRaw('EURUSD', 1.14),
    gbpusd: async () => fxRaw('GBPUSD', 1.33),
    usdjpy: async () => fxRaw('USDJPY', 150),
    ...over,
  };
}

/* ── ECB (Euro Area) ─────────────────────────────────────────────────────── */
describe('ECB Euro Area M2 provider', () => {
  it('parses csvdata TIME_PERIOD/OBS_VALUE columns, ascending', () => {
    const rows = parseEcbCsvData(ecbCsv(3));
    expect(rows).toHaveLength(3);
    expect(rows[0].month < rows[2].month).toBe(true);
    expect(rows[2].nativeM2).toBe(15_000_000 + 2 * 40_000);
  });
  it('validates EUR-millions scale and depth (ok)', async () => {
    const r = await fetchEuroM2({ fetchCsv: async () => ecbCsv(24) });
    expect(r.ok).toBe(true);
    expect(r.nativeUnit).toBe('millions-EUR');
  });
  it('EURUSD is applied by multiply (USD-per-EUR)', () => {
    expect(convertM2ToUsd(16_000_000 * 1e6, 1.14, 'multiply')).toBeCloseTo(16_000_000 * 1e6 * 1.14, 2);
  });
  it('fails closed on malformed payload', async () => {
    const r = await fetchEuroM2({ fetchCsv: async () => 'garbage,no,bsi,rows' });
    expect(r.ok).toBe(false);
  });
  it('fails closed on insufficient history', async () => {
    const r = await fetchEuroM2({ fetchCsv: async () => ecbCsv(5) });
    expect(r.ok).toBe(false);
  });
});

/* ── BOE (United Kingdom) ────────────────────────────────────────────────── */
describe('BOE UK M2 provider (LPMVWYH)', () => {
  it('parses "DD Mon YYYY,value" rows into YYYY-MM', () => {
    const rows = parseBoeCsv(boeCsv(3));
    expect(rows).toHaveLength(3);
    expect(/^\d{4}-\d{2}$/.test(rows[0].month)).toBe(true);
  });
  it('validates £-millions scale and depth (ok)', async () => {
    const r = await fetchUkM2({ fetchCsv: async () => boeCsv(24) });
    expect(r.ok).toBe(true);
    expect(r.nativeUnit).toBe('millions-GBP');
  });
  it('GBPUSD is applied by multiply (USD-per-GBP)', () => {
    expect(convertM2ToUsd(3_200_000 * 1e6, 1.33, 'multiply')).toBeCloseTo(3_200_000 * 1e6 * 1.33, 2);
  });
  it('fails closed on header-only / malformed payload', async () => {
    const r = await fetchUkM2({ fetchCsv: async () => 'DATE,LPMVWYH' });
    expect(r.ok).toBe(false);
  });
});

/* ── BOJ (Japan) — fail-closed pending source ────────────────────────────── */
describe('BOJ Japan M2 provider', () => {
  it('parses the BOJ wide CSV (series-code column + YYYY/MM dates)', () => {
    const rows = parseBojM2Csv(bojCsv(3), 'MD02TEST');
    expect(rows).toHaveLength(3);
    expect(rows[0].month).toMatch(/^\d{4}-\d{2}$/);
  });
  it('USDJPY is applied by divide (JPY-per-USD)', () => {
    expect(convertM2ToUsd(12_000_000 * 1e8, 150, 'divide')).toBeCloseTo((12_000_000 * 1e8) / 150, 2);
  });
  it('parses a valid injected source when provided', async () => {
    const r = await fetchJapanM2({ fetchCsv: async () => bojCsv(24), seriesCode: 'MD02TEST' });
    expect(r.ok).toBe(true);
    expect(r.nativeUnit).toBe('100-million-JPY');
  });
  it('FAILS CLOSED (no app id / series code) and never substitutes broad money', async () => {
    const r = await fetchJapanM2();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BOJ_API_APP_ID/);
    expect(r.m2).toHaveLength(0);
  });
  it('fails closed on malformed payload', async () => {
    const r = await fetchJapanM2({ fetchCsv: async () => 'no,dated,rows', seriesCode: 'X' });
    expect(r.ok).toBe(false);
  });
});

/* ── Six-bloc partial integration (frozen engine) ────────────────────────── */
describe('Wave-2 six-bloc partial integration', () => {
  it('all six injected → 6 valid blocs; coverage < 95% keeps interpretation ineligible', async () => {
    const b = await buildWave2Bundle(sixDeps());
    expect(b.result.validBlocCount).toBe(6);
    expect(b.result.quality.missingBlocCount).toBe(5);
    expect(b.result.quality.estimatedWeightedCoveragePercent).toBeLessThan(95);
    expect(b.eligibility.interpretationEligible).toBe(false);
    expect(b.eligibility.calculationStatus).toBe('PARTIAL');
    expect(b.result.quality.parityStatus).toBe('DATA_PARITY_PENDING');
  });
  it('live-shaped path with real BOJ default fails Japan closed → 5 valid blocs', async () => {
    const deps = sixDeps();
    const { japan, ...rest } = deps; // drop the Japan fixture → provider default fail-closed
    void japan;
    const b = await buildWave2Bundle(rest as Wave2Deps);
    expect(b.result.validBlocCount).toBe(5);
    expect(b.providerStatus.find((p) => p.id === 'JP')?.ok).toBe(false);
    expect(b.missingBlocIds).toContain('JP');
  });
  it('flags a stale bloc without dropping it (provider publication lag policy)', async () => {
    const stale = m2raw('EU', 'ECB', 'millions-EUR', 16_000_000, 30_000, 15);
    stale.latestObservationMonth = '2023-01'; // well beyond the 3-month policy
    const b = await buildWave2Bundle(sixDeps({ euro: async () => stale }));
    expect(b.providerStatus.find((p) => p.id === 'EU')?.stale).toBe(true);
  });
});

/* ── TradingView USD delta (informational, NOT hard-tuned) ────────────────── */
describe('TV diagnostic USD delta (informational)', () => {
  it('EU/UK USD conversions land in a sane band vs TV references', async () => {
    const b = await buildWave2Bundle(sixDeps());
    const eu = b.result.blocs.find((x) => x.id === 'EU')!;
    const gb = b.result.blocs.find((x) => x.id === 'GB')!;
    const euDelta = Math.abs((eu.usdM2 - 18.78e12) / 18.78e12) * 100;
    const gbDelta = Math.abs((gb.usdM2 - 4.29e12) / 4.29e12) * 100;
    // Informational sanity band only — fixtures are synthetic, not tuned to TV.
    expect(euDelta).toBeLessThan(15);
    expect(gbDelta).toBeLessThan(15);
  });
});
