import { describe, it, expect } from 'vitest';
import {
  resolveLiquidityTransmission, resetLiquidityTransmissionCache, collapseToDailyClose,
} from '@/lib/intelligence/liquidityTransmissionService';
import {
  memoryMasterLinkHistoryStore,
} from '@/lib/intelligence/data/liquidityTransmissionHistoryStore';
import type { LiquidityAssetFetchers, AssetSeriesResult } from '@/lib/intelligence/data/providers/liquidityAssetProviders';
import type { DailyBar } from '@/lib/intelligence/data/liquidityConfirmedBars';
import type { GlobalM2Result } from '@/lib/intelligence/engines/globalM2';

function series(startDay: string, count: number, close: (i: number) => number): DailyBar[] {
  const out: DailyBar[] = [];
  const t0 = Date.parse(startDay + 'T00:00:00Z');
  for (let i = 0; i < count; i++) {
    const d = new Date(t0 + i * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, close: close(i) });
  }
  return out;
}
function ok(bars: DailyBar[]): AssetSeriesResult {
  return { bars, provider: 'alpha-vantage', status: 'OK', observationCount: bars.length };
}

function baseFetchers(): LiquidityAssetFetchers {
  const bars = series('2026-01-01', 250, (i) => 100 + i * 0.1);
  return {
    alphaVantage: async () => ok(bars),
    fred: async () => ok(bars),
    coingecko: async () => ok(bars),
    derivedTotal2: async () => ok(bars),
  };
}

function fakeGlobalM2(): GlobalM2Result {
  return {
    totalUsd: 114.8e12,
    oneMonthPct: 0.23, threeMonthPct: 2.5, threeMonthAnnualizedPct: 10.14, yoyPct: 8.38,
    accel1M: 0.05, accel3M: 1.2, accel3MPrevious: 0.5,
    accelerationState: 'ACCEL', liquidityCycle: 'LATE EXPANSION', turnState: 'STABLE',
    validBlocCount: 9, blocs: [],
    quality: {
      coveragePercent: 82, observedWeightedShare: null,
      estimatedWeightedCoveragePercent: 94.4, weightedCoverageBasis: 'REFERENCE_WEIGHTS',
      weightedCoverageEstimated: true, weightedCoveragePercent: 94.4,
      exactBlocCount: 6, alternativeBlocCount: 2, proxyBlocCount: 1, missingBlocCount: 2,
      exactWeightedShare: 0.8, alternativeWeightedShare: 0.1, proxyWeightedShare: 0.04, missingWeightedShare: 0.06,
      staleBlocCount: 1, blocMonths: {}, newestObservationMonth: '2026-06', oldestObservationMonth: '2026-06',
      parityStatus: 'FORMULA_VALIDATED',
    },
    calculatedAt: '2026-09-07T00:00:00Z',
  };
}

/* ── Determinism + shape ───────────────────────────────────────────────────── */
describe('resolveLiquidityTransmission — determinism and shape', () => {
  it('injected deps bypass the module cache and produce deterministic output', async () => {
    resetLiquidityTransmissionCache();
    const deps = {
      fetchers: baseFetchers(),
      globalM2: async () => fakeGlobalM2(),
      historyStore: memoryMasterLinkHistoryStore(),
      nowIso: '2026-09-07T12:00:00Z',
      persist: false,
    };
    const a = await resolveLiquidityTransmission(deps);
    const b = await resolveLiquidityTransmission(deps);
    expect(a.result).not.toBeNull();
    expect(a.result!.masterLink).toBeCloseTo(b.result!.masterLink, 12);
    expect(a.result!.masterLink).toBe(a.result!.transmissionRiskOn); // alias
    expect(a.result!.clockStage).toBe(b.result!.clockStage);
    expect(a.status).toBe('OK');
  });

  it('emits full pack metadata for every asset with source/classification', async () => {
    const r = await resolveLiquidityTransmission({
      fetchers: baseFetchers(), globalM2: async () => fakeGlobalM2(),
      historyStore: memoryMasterLinkHistoryStore(), nowIso: '2026-09-07T00:00:00Z', persist: false,
    });
    expect(r.packs.length).toBe(14);
    const dxy = r.packs.find((p) => p.key === 'dxy')!;
    expect(dxy.pineSymbol).toBe('TVC:DXY');
    expect(dxy.classification).toBe('PROXY');
    expect(dxy.provider).toBe('alpha-vantage');
    expect(dxy.reason).toBeTruthy();
    const vix = r.packs.find((p) => p.key === 'vix')!;
    expect(vix.classification).toBe('EXACT');
    expect(vix.provider).toBe('fred');
    // Provider list is deduped.
    expect(new Set(r.providersUsed).size).toBe(r.providersUsed.length);
  });
});

/* ── Failure modes ────────────────────────────────────────────────────────── */
describe('resolveLiquidityTransmission — failure semantics', () => {
  it('PARTIAL when some assets fail — engine still computes with neutral fallbacks', async () => {
    const bars = series('2026-01-01', 250, (i) => 100 + i * 0.1);
    const fetchers: LiquidityAssetFetchers = {
      alphaVantage: async (sym) => sym === 'HYG' || sym === 'LQD'
        ? { bars: null, provider: 'alpha-vantage', status: 'PROVIDER_UNREACHABLE', error: 'unreachable' }
        : ok(bars),
      fred: async () => ok(bars),
      coingecko: async () => ok(bars),
      derivedTotal2: async () => ok(bars),
    };
    const r = await resolveLiquidityTransmission({
      fetchers, globalM2: async () => fakeGlobalM2(),
      historyStore: memoryMasterLinkHistoryStore(), nowIso: '2026-09-07T00:00:00Z', persist: false,
    });
    expect(r.status).toBe('PARTIAL');
    expect(r.result).not.toBeNull();
    expect(r.missingKeys.sort()).toEqual(['hyg', 'lqd']);
    // Engine input for missing assets is neutral (null returns).
    expect(r.result!.drivers.find((d) => d.key === 'hyg')!.riskOn).toBe(50);
    expect(r.result!.drivers.find((d) => d.key === 'lqd')!.riskOn).toBe(50);
  });

  it('DATA_UNAVAILABLE when all assets missing, with no fake scores', async () => {
    const empty: LiquidityAssetFetchers = {
      alphaVantage: async () => ({ bars: null, provider: 'alpha-vantage', status: 'DATA_UNAVAILABLE' }),
      fred: async () => ({ bars: null, provider: 'fred', status: 'DATA_UNAVAILABLE' }),
      coingecko: async () => ({ bars: null, provider: 'coingecko', status: 'DATA_UNAVAILABLE' }),
      derivedTotal2: async () => ({ bars: null, provider: 'derived', status: 'DATA_UNAVAILABLE' }),
    };
    const r = await resolveLiquidityTransmission({
      fetchers: empty, globalM2: async () => null,
      historyStore: memoryMasterLinkHistoryStore(), nowIso: '2026-09-07T00:00:00Z', persist: false,
    });
    expect(r.status).toBe('DATA_UNAVAILABLE');
    // Engine still runs with all-neutral inputs — masterLink stays at 50 (== validated 50).
    expect(r.result!.masterLink).toBe(50);
    expect(r.result!.validated).toBe(50);
    expect(r.result!.m2BiasScore).toBe(50);
    expect(r.missingKeys.length).toBe(14);
  });

  it('propagates partial upstream M2 metadata (§11)', async () => {
    const r = await resolveLiquidityTransmission({
      fetchers: baseFetchers(),
      globalM2: async () => fakeGlobalM2(),
      historyStore: memoryMasterLinkHistoryStore(),
      nowIso: '2026-09-07T00:00:00Z',
      persist: false,
    });
    expect(r.m2Meta.status).toBe('LIVE'); // injected globalM2 supplied a valid result
    expect(r.m2Meta.parityStatus).toBe('DATA_PARITY_PENDING');
    expect(r.m2Meta.parityStatus).not.toBe('FULL_PARITY');
  });

  it('marks upstream M2 status LIVE/PARTIAL UPSTREAM when injected result is null', async () => {
    const r = await resolveLiquidityTransmission({
      fetchers: baseFetchers(),
      globalM2: async () => null,
      historyStore: memoryMasterLinkHistoryStore(),
      nowIso: '2026-09-07T00:00:00Z',
      persist: false,
    });
    expect(r.m2Meta.validBlocCount).toBe(0);
    expect(r.m2Meta.parityStatus).toBe('DATA_PARITY_PENDING');
    // Result still computes with neutral M2 fallbacks; masterLink stays in range.
    expect(r.result!.masterLink).toBeGreaterThanOrEqual(0);
    expect(r.result!.masterLink).toBeLessThanOrEqual(100);
  });
});

/* ── Stage-8 5D masterLink Δ ───────────────────────────────────────────────── */
describe('resolveLiquidityTransmission — stage-8 masterLink Δ from history', () => {
  it('null delta when no history exists', async () => {
    const r = await resolveLiquidityTransmission({
      fetchers: baseFetchers(), globalM2: async () => fakeGlobalM2(),
      historyStore: memoryMasterLinkHistoryStore(),
      nowIso: '2026-09-07T00:00:00Z', persist: false,
    });
    expect(r.previousMasterLink).toBeNull();
    expect(r.masterLinkDelta).toBeNull();
  });

  it('delta = today masterLink − latest history strictly before today', async () => {
    const seed = [
      { observedOn: '2026-09-05', masterLink: 60.0, writtenAt: '2026-09-05T00:00:00Z' },
      { observedOn: '2026-09-06', masterLink: 64.5, writtenAt: '2026-09-06T00:00:00Z' },
    ];
    const store = memoryMasterLinkHistoryStore(seed);
    const r = await resolveLiquidityTransmission({
      fetchers: baseFetchers(), globalM2: async () => fakeGlobalM2(),
      historyStore: store, nowIso: '2026-09-07T00:00:00Z', persist: false,
    });
    expect(r.previousMasterLink?.observedOn).toBe('2026-09-06');
    expect(r.previousMasterLink?.masterLink).toBe(64.5);
    expect(r.masterLinkDelta).toBeCloseTo(r.result!.masterLink - 64.5, 10);
  });

  it('persist=true writes today\'s masterLink to the injected store', async () => {
    const store = memoryMasterLinkHistoryStore();
    const r = await resolveLiquidityTransmission({
      fetchers: baseFetchers(), globalM2: async () => fakeGlobalM2(),
      historyStore: store, nowIso: '2026-09-07T00:00:00Z', persist: true,
    });
    const readBack = await store.readLatestBefore('2026-09-08');
    expect(readBack?.observedOn).toBe('2026-09-07');
    expect(readBack?.masterLink).toBeCloseTo(r.result!.masterLink, 10);
  });
});

/* ── Utility ───────────────────────────────────────────────────────────────── */
describe('collapseToDailyClose', () => {
  it('reduces intraday timestamps to one entry per UTC day (last wins)', () => {
    const day = (h: number) => Date.parse(`2026-09-05T${String(h).padStart(2, '0')}:00:00Z`);
    const out = collapseToDailyClose([
      [day(1), 100], [day(6), 105], [day(23), 110],
      [Date.parse('2026-09-06T02:00:00Z'), 120],
      [Date.parse('2026-09-06T23:59:00Z'), 125],
    ]);
    expect(out).toEqual([{ date: '2026-09-05', close: 110 }, { date: '2026-09-06', close: 125 }]);
  });
});
