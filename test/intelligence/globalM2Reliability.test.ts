import { describe, it, expect } from 'vitest';
import { classifyProviderFailure } from '@/lib/intelligence/data/globalM2Health';
import { memoryGlobalM2Store } from '@/lib/intelligence/data/globalM2Store';
import { buildWave3Bundle } from '@/lib/intelligence/data/globalM2Pipeline';
import type { ProviderM2Raw, ProviderFxRaw } from '@/lib/intelligence/data/providers/globalM2ProviderTypes';

const MON = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
function months(n: number, endY = 2026, endM = 6): string[] {
  const out: string[] = []; let y = endY, m = endM;
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${MON[m - 1]}`); m--; if (m === 0) { m = 12; y--; } }
  return out;
}
function m2raw(id: string, provider: string, unit: string, base: number, step: number, n = 18): ProviderM2Raw {
  const ms = months(n);
  return { ok: true, id, provider, sourceSeries: 'S', sourceUrl: 'u', nativeCurrency: 'X', nativeUnit: unit, m2: ms.map((month, i) => ({ month, nativeM2: base + i * step })), latestObservationMonth: ms[ms.length - 1], retrievedAt: 'now' };
}
function fail(id: string, provider: string, error: string): ProviderM2Raw {
  return { ok: false, id, provider, sourceSeries: 'S', nativeCurrency: 'X', nativeUnit: 'u', m2: [], latestObservationMonth: null, retrievedAt: 'now', error };
}
function fx(pair: string, rate: number, n = 20): ProviderFxRaw {
  return { ok: true, pair, daily: months(n).map((mo) => ({ date: `${mo}-28`, rate })), retrievedAt: 'now' };
}
function liveDeps(over: Record<string, () => Promise<ProviderM2Raw>> = {}) {
  return {
    us: async () => m2raw('US', 'FRED', 'billions-USD', 22000, 20),
    china: async () => m2raw('CN', 'PBOC', '100-million-CNY', 3_000_000, 5000),
    swiss: async () => m2raw('CH', 'SNB', 'millions-CHF', 1_100_000, 1000),
    euro: async () => m2raw('EU', 'ECB', 'millions-EUR', 16_000_000, 20000),
    uk: async () => m2raw('GB', 'BOE', 'millions-GBP', 3_200_000, 4000),
    canada: async () => m2raw('CA', 'StatCan', 'millions-CAD', 2_800_000, 3000),
    brazil: async () => m2raw('BR', 'BCB', 'thousands-BRL', 7_000_000_000, 10_000_000),
    // Injected fails keep the test deterministic (no live RBA/BOJ/ECOS/RBI network).
    australia: async () => fail('AU', 'RBA', 'HTTP 403 (text/html) for www.rba.gov.au in 500ms'),
    japan: async () => fail('JP', 'BOJ', 'fetch failed for www.stat-search.boj.or.jp in 500ms'),
    india: async () => fail('IN', 'RBI', 'India M2 DATA_UNAVAILABLE: RBI discontinued M2/M4 in 2017'),
    korea: async () => fail('KR', 'BOK-ECOS', 'BoK ECOS M2 unavailable: set ECOS_API_KEY'),
    usdcny: async () => fx('USDCNY', 7.1), usdchf: async () => fx('USDCHF', 0.81),
    eurusd: async () => fx('EURUSD', 1.14), gbpusd: async () => fx('GBPUSD', 1.33),
    usdcad: async () => fx('USDCAD', 1.38), usdbrl: async () => fx('USDBRL', 5.16),
    usdjpy: async () => fx('USDJPY', 150), audusd: async () => fx('AUDUSD', 0.69),
    usdinr: async () => fx('USDINR', 83), usdkrw: async () => fx('USDKRW', 1350),
    ...over,
  };
}

describe('Provider health classification', () => {
  it('maps failures to explicit health states (never flat "missing")', () => {
    expect(classifyProviderFailure('BoK ECOS M2 unavailable: set ECOS_API_KEY and confirmed codes')).toBe('CREDENTIAL_REQUIRED');
    expect(classifyProviderFailure('BOJ metadata: "M3/Average Amounts Outstanding/Money Stock" is not M2')).toBe('DATA_UNAVAILABLE');
    expect(classifyProviderFailure('India M2 DATA_UNAVAILABLE: RBI discontinued M2/M4 in 2017')).toBe('DEFINITION_UNAVAILABLE');
    expect(classifyProviderFailure('HTTP 403 (text/html) for www.rba.gov.au in 812ms')).toBe('PROVIDER_UNREACHABLE');
    expect(classifyProviderFailure('PBOC: no year pages parsed (fetch failed; fetch failed)')).toBe('PROVIDER_UNREACHABLE');
    expect(classifyProviderFailure('something odd')).toBe('DATA_UNAVAILABLE');
  });
});

describe('Persisted source-of-truth fallback', () => {
  it('serves STALE last-known-good when a live provider fails but history is persisted', async () => {
    const seeded = memoryGlobalM2Store({
      CN: { observations: months(15).map((month, i) => ({ month, usdM2: 52_000e9 + i * 1e11 })), latestFetchedAt: '2026-08-01T00:00:00.000Z' },
    });
    const b = await buildWave3Bundle(
      liveDeps({ china: async () => fail('CN', 'PBOC', 'PBOC: no year pages parsed (fetch failed)') }),
      { store: seeded, persist: true },
    );
    const cn = b.providerStatus.find((p) => p.id === 'CN')!;
    expect(cn.ok).toBe(true);
    expect(cn.health).toBe('STALE');
    expect(b.result.blocs.some((bl) => bl.id === 'CN')).toBe(true);
  });

  it('reports PROVIDER_UNREACHABLE (not served) when a provider fails with no persisted history', async () => {
    const b = await buildWave3Bundle(
      liveDeps({ china: async () => fail('CN', 'PBOC', 'PBOC: no year pages parsed (HTTP 403)') }),
      { store: memoryGlobalM2Store(), persist: true },
    );
    const cn = b.providerStatus.find((p) => p.id === 'CN')!;
    expect(cn.ok).toBe(false);
    expect(cn.health).toBe('PROVIDER_UNREACHABLE');
    expect(b.result.blocs.some((bl) => bl.id === 'CN')).toBe(false);
  });

  it('persists successfully-normalized live blocs to the store', async () => {
    const store = memoryGlobalM2Store();
    await buildWave3Bundle(liveDeps(), { store, persist: true });
    const us = await store.read('US');
    expect(us).not.toBeNull();
    expect(us!.observations.length).toBeGreaterThanOrEqual(13);
  });

  it('persist:false keeps deterministic behaviour (no store access)', async () => {
    const b = await buildWave3Bundle(liveDeps(), { persist: false });
    // US/CN/CH/EU/GB/CA/BR live (7); JP/IN/KR/AU default fail-closed/unreachable.
    expect(b.result.validBlocCount).toBe(7);
    expect(b.providerStatus.find((p) => p.id === 'CN')?.health).toBe('LIVE');
  });
});
