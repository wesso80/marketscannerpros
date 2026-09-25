import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeGlobalM2, GLOBAL_M2_CONFIG, GLOBAL_M2_EXCLUDED_BLOCS,
} from '@/lib/intelligence/engines/globalM2';
import { buildWave3Bundle, type Wave3Deps } from '@/lib/intelligence/data/globalM2Pipeline';
import { excludedBlocsLabel, excludedBlocsSuffix } from '@/lib/intelligence/globalM2Exclusions';
import type { ProviderM2Raw, ProviderFxRaw } from '@/lib/intelligence/data/providers/globalM2ProviderTypes';

/* ── Fixtures (deterministic, no network, no DB) ───────────────────────────── */
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
  return { ok: true, pair, daily: months(n).map((mo) => ({ date: `${mo}-28`, rate })), retrievedAt: 'now' };
}
const IN_FAIL = () => fail('IN', 'RBI', 'India M2 DATA_UNAVAILABLE: RBI discontinued M2/M4 in 2017; no genuine current M2 series.');
const KR_FAIL = () => fail('KR', 'BOK-ECOS', 'BoK ECOS M2 unavailable: set ECOS_API_KEY and confirmed ECOS_M2_STAT_CODE/ECOS_M2_ITEM_CODE.');

/** Production-like deps: the 9 obtainable blocs present, IN + KR failing closed. */
function prodLikeDeps(extra: Partial<Wave3Deps> = {}): Wave3Deps {
  return {
    us: async () => m2raw('US', 'FRED', 'billions-USD', 22000, 20),
    china: async () => m2raw('CN', 'PBOC', '100-million-CNY', 3_000_000, 5000),
    swiss: async () => m2raw('CH', 'SNB', 'millions-CHF', 1_100_000, 1000),
    euro: async () => m2raw('EU', 'ECB', 'millions-EUR', 16_000_000, 20000),
    uk: async () => m2raw('GB', 'BOE', 'millions-GBP', 3_200_000, 4000),
    japan: async () => m2raw('JP', 'BOJ', '100-million-JPY', 12_000_000, 8000),
    canada: async () => m2raw('CA', 'StatCan', 'millions-CAD', 2_800_000, 3000),
    australia: async () => m2raw('AU', 'RBA', 'billions-AUD', 3400, 4),
    india: async () => IN_FAIL(),
    korea: async () => KR_FAIL(),
    brazil: async () => m2raw('BR', 'BCB', 'thousands-BRL', 7_000_000_000, 10_000_000),
    usdcny: async () => fx('USDCNY', 7.1), usdchf: async () => fx('USDCHF', 0.81),
    eurusd: async () => fx('EURUSD', 1.14), gbpusd: async () => fx('GBPUSD', 1.33),
    usdjpy: async () => fx('USDJPY', 150), usdcad: async () => fx('USDCAD', 1.38),
    audusd: async () => fx('AUDUSD', 0.69), usdinr: async () => fx('USDINR', 83),
    usdkrw: async () => fx('USDKRW', 1350), usdbrl: async () => fx('USDBRL', 5.16),
    ...extra,
  };
}
const build = (deps: Wave3Deps) => buildWave3Bundle(deps, { persist: false });

// Reference weights: all 11 = 92.1; excluding IN (2.6) + KR (2.6) = 86.9.
const INCLUDED_TOTAL = 86.9;

describe('Global M2 excluded-bloc policy', () => {
  it('is an explicit named list: exactly IN and KR, each with a reason', () => {
    expect(GLOBAL_M2_EXCLUDED_BLOCS.map((b) => b.id)).toEqual(['IN', 'KR']);
    for (const b of GLOBAL_M2_EXCLUDED_BLOCS) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.reason.length).toBeGreaterThan(20);
    }
    expect(GLOBAL_M2_CONFIG.excludedBlocIds).toEqual(['IN', 'KR']);
  });
});

describe('Wave-3 eligibility with IN/KR excluded', () => {
  it('IN + KR missing, other 9 present → 100% weighted coverage, eligible, COMPLETE', async () => {
    const b = await build(prodLikeDeps());
    expect(b.result.validBlocCount).toBe(9);
    expect(b.missingBlocIds.sort()).toEqual(['IN', 'KR']);
    expect(b.result.quality.estimatedWeightedCoveragePercent).toBeCloseTo(100, 9);
    expect(b.result.quality.missingWeightedShare).toBeCloseTo(0, 9);
    expect(b.eligibility.weightedCoverageThreshold).toBe(95);
    expect(b.eligibility.interpretationEligible).toBe(true);
    expect(b.eligibility.headlineEligible).toBe(true);
    expect(b.eligibility.calculationStatus).toBe('COMPLETE');
    // Raw bloc-count coverage stays honest over the full 11-bloc universe.
    expect(b.result.quality.coveragePercent).toBeCloseTo((100 * 9) / 11, 9);
    expect(b.result.quality.missingBlocCount).toBe(2);
    // Still flagged as live-provider data, not TradingView-parity.
    expect(b.result.quality.parityStatus).toBe('DATA_PARITY_PENDING');
  });

  it('exposes the excluded list (codes, names, reasons) in the output', async () => {
    const b = await build(prodLikeDeps());
    expect(b.result.quality.excludedBlocIds).toEqual(['IN', 'KR']);
    expect(b.excludedBlocs).toEqual([
      { id: 'IN', name: 'India', reason: expect.stringMatching(/discontinued/) },
      { id: 'KR', name: 'South Korea', reason: expect.stringMatching(/ECOS/) },
    ]);
  });

  it('IN + KR + Japan missing (8.6% of included weight) → below 95% → PARTIAL', async () => {
    const b = await build(prodLikeDeps({ japan: async () => fail('JP', 'BOJ', 'fetch failed for www.stat-search.boj.or.jp in 500ms') }));
    expect(b.result.quality.estimatedWeightedCoveragePercent).toBeCloseTo((100 * (INCLUDED_TOTAL - 7.5)) / INCLUDED_TOTAL, 9);
    expect(b.eligibility.interpretationEligible).toBe(false);
    expect(b.eligibility.calculationStatus).toBe('PARTIAL');
  });

  it('several small blocs missing (CH+CA+AU+BR = 5.9% of included weight) → PARTIAL', async () => {
    const down = (id: string, p: string) => async () => fail(id, p, 'HTTP 503');
    const b = await build(prodLikeDeps({
      swiss: down('CH', 'SNB'), canada: down('CA', 'StatCan'), australia: down('AU', 'RBA'), brazil: down('BR', 'BCB'),
    }));
    expect(b.result.quality.estimatedWeightedCoveragePercent).toBeLessThan(95);
    expect(b.eligibility.calculationStatus).toBe('PARTIAL');
  });

  it('does not exclude by status: a NEW credential problem on another bloc still counts as missing', async () => {
    const b = await build(prodLikeDeps({ japan: async () => fail('JP', 'BOJ', 'BOJ_API app id credential required') }));
    expect(b.providerStatus.find((p) => p.id === 'JP')?.health).toBe('CREDENTIAL_REQUIRED');
    expect(b.excludedBlocs.map((x) => x.id)).toEqual(['IN', 'KR']);
    expect(b.eligibility.calculationStatus).toBe('PARTIAL');
  });

  it('an excluded bloc that does supply data is still summed into totals (math unchanged) but not into coverage', async () => {
    const withKr = await build(prodLikeDeps({ korea: async () => m2raw('KR', 'BOK-ECOS', 'billions-KRW', 4_000_000, 5000) }));
    const without = await build(prodLikeDeps());
    expect(withKr.result.validBlocCount).toBe(10);
    expect(withKr.result.totalUsd).toBeGreaterThan(without.result.totalUsd);
    expect(withKr.result.quality.estimatedWeightedCoveragePercent).toBeCloseTo(100, 9);
  });
});

describe('Engine re-normalisation is config-driven', () => {
  it('without exclusions the same 9 blocs give the old ~94.35% (86.9 / 92.1)', async () => {
    const b = await build(prodLikeDeps());
    const noExclusions = computeGlobalM2({ blocs: b.blocs }, { lagMonths: 1, nominalWeights: GLOBAL_M2_CONFIG.nominalWeights });
    expect(noExclusions.quality.estimatedWeightedCoveragePercent).toBeCloseTo((100 * INCLUDED_TOTAL) / 92.1, 9);
    expect(noExclusions.quality.excludedBlocIds).toEqual([]);
    // Coverage accounting never changes the M2 math itself.
    expect(noExclusions.totalUsd).toBe(b.result.totalUsd);
    expect(noExclusions.yoyPct).toBe(b.result.yoyPct);
    expect(noExclusions.liquidityCycle).toBe(b.result.liquidityCycle);
  });
});

describe('Exclusion labels', () => {
  it('formats the page label and the compact suffix', () => {
    expect(excludedBlocsLabel(GLOBAL_M2_EXCLUDED_BLOCS as any)).toBe('Excludes India and South Korea (sources unavailable)');
    expect(excludedBlocsLabel([])).toBeNull();
    expect(excludedBlocsLabel(undefined)).toBeNull();
    expect(excludedBlocsSuffix(['IN', 'KR'])).toBe(' (excl. IN, KR)');
    expect(excludedBlocsSuffix(undefined)).toBe('');
  });
});

/* ── API route output ──────────────────────────────────────────────────────── */
vi.mock('@/lib/intelligence/data/globalM2Pipeline', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/intelligence/data/globalM2Pipeline')>();
  return {
    ...actual,
    // The route calls buildWave3Bundle() with no args → feed it the production-like fixture.
    // Calls with explicit deps (the tests above) pass straight through.
    buildWave3Bundle: (deps?: Wave3Deps, opts?: Parameters<typeof actual.buildWave3Bundle>[1]) =>
      actual.buildWave3Bundle(deps ?? prodLikeDeps(), opts ?? { persist: false }),
  };
});

describe('GET /api/intelligence/global-m2', () => {
  const prev = process.env.INTELLIGENCE_LIVE_DATA;
  afterEach(() => { process.env.INTELLIGENCE_LIVE_DATA = prev; });

  it('returns excludedBlocs and the re-normalised eligibility', async () => {
    process.env.INTELLIGENCE_LIVE_DATA = 'true';
    const { GET } = await import('@/app/api/intelligence/global-m2/route');
    const body = await (await GET()).json();
    const d = body.data;
    expect(d.excludedBlocs.map((x: { id: string }) => x.id)).toEqual(['IN', 'KR']);
    expect(d.excludedBlocs[0]).toMatchObject({ name: 'India', reason: expect.any(String) });
    expect(d.estimatedWeightedCoveragePercent).toBeCloseTo(100, 9);
    expect(d.weightedCoverageThreshold).toBe(95);
    expect(d.interpretationEligible).toBe(true);
    expect(d.calculationStatus).toBe('COMPLETE');
    expect(d.coveragePercent).toBeCloseTo((100 * 9) / 11, 9);
    expect(d.missing.map((m: { id: string }) => m.id).sort()).toEqual(['IN', 'KR']);
  });

  it('disabled response still discloses the exclusion policy', async () => {
    process.env.INTELLIGENCE_LIVE_DATA = 'false';
    const { GET } = await import('@/app/api/intelligence/global-m2/route');
    const body = await (await GET()).json();
    expect(body.source).toBe('disabled');
    expect(body.data.excludedBlocs.map((x: { id: string }) => x.id)).toEqual(['IN', 'KR']);
  });
});
