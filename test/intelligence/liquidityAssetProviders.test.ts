import { describe, it, expect } from 'vitest';
import {
  loadLiquidityAssetSeries, LIQUIDITY_PROVIDER_MAP,
  type LiquidityAssetKey, type AssetSeriesResult, type LiquidityAssetFetchers,
} from '@/lib/intelligence/data/providers/liquidityAssetProviders';
import {
  buildLiquidityTransmissionInput, mapGlobalM2ToInput,
} from '@/lib/intelligence/data/liquidityTransmissionInputBuilder';
import type { DailyBar } from '@/lib/intelligence/data/liquidityConfirmedBars';
import type { GlobalM2Result } from '@/lib/intelligence/engines/globalM2';

/* Synthetic 365-day daily series so ROC(20) has plenty of history. */
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

function fakeGlobalM2(): GlobalM2Result {
  return {
    totalUsd: 114.8e12,
    oneMonthPct: 0.23, threeMonthPct: 2.5, threeMonthAnnualizedPct: 10.14, yoyPct: 8.38,
    accel1M: 0.05, accel3M: 1.2, accel3MPrevious: 0.5,
    accelerationState: 'ACCEL', liquidityCycle: 'LATE EXPANSION', turnState: 'STABLE',
    validBlocCount: 9,
    blocs: [], // detail unused by the mapper
    quality: {
      coveragePercent: 82,
      observedWeightedShare: null,
      estimatedWeightedCoveragePercent: 94.4,
      weightedCoverageBasis: 'REFERENCE_WEIGHTS', weightedCoverageEstimated: true,
      weightedCoveragePercent: 94.4,
      exactBlocCount: 6, alternativeBlocCount: 2, proxyBlocCount: 1, missingBlocCount: 2,
      exactWeightedShare: 0.8, alternativeWeightedShare: 0.1, proxyWeightedShare: 0.04, missingWeightedShare: 0.06,
      staleBlocCount: 1, blocMonths: {},
      newestObservationMonth: '2026-06', oldestObservationMonth: '2026-06',
      parityStatus: 'FORMULA_VALIDATED',
    },
    calculatedAt: '2026-09-07T00:00:00Z',
  };
}

/* ── loadLiquidityAssetSeries ──────────────────────────────────────────────── */
describe('loadLiquidityAssetSeries — provider orchestration', () => {
  it('routes each asset to its declared provider and reports providersUsed', async () => {
    const trace: string[] = [];
    const fetchers: LiquidityAssetFetchers = {
      alphaVantage: async (sym) => { trace.push(`av:${sym}`); return ok(series('2026-01-01', 250, (i) => 100 + i)); },
      fred: async (sym) => { trace.push(`fred:${sym}`); return ok(series('2026-01-01', 250, (i) => 20 + i * 0.05)); },
      coingecko: async (id) => { trace.push(`cg:${id}`); return ok(series('2026-01-01', 250, (i) => 30000 + i * 100)); },
      derivedTotal2: async () => { trace.push('derived:total2'); return ok(series('2026-01-01', 250, (i) => 1e12 + i * 1e9)); },
    };
    const load = await loadLiquidityAssetSeries(fetchers);
    // Every declared key must have a series result.
    expect(Object.keys(load.series).sort()).toEqual(Object.keys(LIQUIDITY_PROVIDER_MAP).sort());
    expect(load.missingKeys).toEqual([]);
    expect(load.providersUsed.sort()).toEqual(['alpha-vantage', 'coingecko', 'derived', 'fred']);
    // VIX must route to FRED VIXCLS (EXACT); SPX must route to Alpha Vantage SPY (PROXY).
    expect(trace).toContain('fred:VIXCLS');
    expect(trace).toContain('av:SPY');
    expect(trace).toContain('cg:bitcoin');
    expect(trace).toContain('derived:total2');
  });

  it('degrades explicitly when a fetcher is not configured', async () => {
    const load = await loadLiquidityAssetSeries({}); // no fetchers at all
    // Every asset must be reported missing with a credential-required status.
    expect(load.missingKeys.length).toBe(Object.keys(LIQUIDITY_PROVIDER_MAP).length);
    expect(load.providersUsed).toEqual([]);
    for (const key of Object.keys(LIQUIDITY_PROVIDER_MAP) as LiquidityAssetKey[]) {
      expect(load.series[key]?.status).toBe('CREDENTIAL_REQUIRED');
    }
  });

  it('reports individual provider failures without polluting others', async () => {
    const fetchers: LiquidityAssetFetchers = {
      alphaVantage: async (sym) => sym === 'HYG'
        ? { bars: null, provider: 'alpha-vantage', status: 'PROVIDER_UNREACHABLE', error: 'rate-limited' }
        : ok(series('2026-01-01', 250, (i) => 100 + i)),
      fred: async () => ok(series('2026-01-01', 250, (i) => 15 + i * 0.01)),
      coingecko: async () => ok(series('2026-01-01', 250, (i) => 30000 + i * 100)),
      derivedTotal2: async () => ({ bars: null, provider: 'derived', status: 'DATA_UNAVAILABLE', error: 'analyst-plan-required' }),
    };
    const load = await loadLiquidityAssetSeries(fetchers);
    expect(load.missingKeys.sort()).toEqual(['hyg', 'total2']);
    // errors list carries the raw provider message.
    expect(load.errors.find((e) => e.key === 'hyg')?.error).toBe('rate-limited');
    expect(load.errors.find((e) => e.key === 'total2')?.error).toBe('analyst-plan-required');
  });

  it('classification set is honest: EXACT only where the provider matches Pine 1:1', () => {
    const cls = Object.fromEntries(
      Object.entries(LIQUIDITY_PROVIDER_MAP).map(([k, v]) => [k, v.classification]),
    );
    // Grade-A drivers where AV has an EXACT ETF match.
    expect(cls.eem).toBe('EXACT');
    expect(cls.vgk).toBe('EXACT');
    // Credit — HYG/LQD are the real Pine tickers, so EXACT.
    expect(cls.hyg).toBe('EXACT');
    expect(cls.lqd).toBe('EXACT');
    // VIX (FRED VIXCLS) is EXACT — same series.
    expect(cls.vix).toBe('EXACT');
    // Spot metals proxied to ETFs.
    expect(cls.gold).toBe('PROXY');
    expect(cls.silver).toBe('PROXY');
    // Indices proxied.
    expect(cls.spx).toBe('PROXY');
    expect(cls.ndx).toBe('PROXY');
    expect(cls.dxy).toBe('PROXY');
    expect(cls.copper).toBe('PROXY');
    // Crypto majors — CoinGecko aggregate vs. Bitstamp = ALTERNATIVE.
    expect(cls.btc).toBe('ALTERNATIVE');
    expect(cls.eth).toBe('ALTERNATIVE');
    // TOTAL2 must be DERIVED, never EXACT.
    expect(cls.total2).toBe('DERIVED');
  });
});

/* ── mapGlobalM2ToInput ────────────────────────────────────────────────────── */
describe('mapGlobalM2ToInput — upstream M2 pass-through', () => {
  it('derives prev-period fields from accel and preserves quality metadata', () => {
    const m2 = mapGlobalM2ToInput(fakeGlobalM2(), {
      status: 'LIVE/PARTIAL UPSTREAM', interpretationEligible: false,
      stale: false, providersUsed: ['FRED', 'PBOC', 'SNB'],
    });
    expect(m2.globalM2USD).toBeCloseTo(114.8e12, 5);
    expect(m2.oneMonthPct).toBe(0.23);
    expect(m2.threeMonthAnnPct).toBe(10.14);
    // prev = current − accel
    expect(m2.oneMonthPctPrev).toBeCloseTo(0.23 - 0.05, 10);
    expect(m2.threeMonthAnnPctPrev).toBeCloseTo(10.14 - 1.2, 10);
    expect(m2.yoyPct).toBe(8.38);
    expect(m2.validBlocCount).toBe(9);
    expect(m2.status).toBe('LIVE/PARTIAL UPSTREAM');
    expect(m2.coveragePercent).toBe(82);
    expect(m2.interpretationEligible).toBe(false);
    expect(m2.providersUsed).toEqual(['FRED', 'PBOC', 'SNB']);
  });

  it('handles missing upstream engine result honestly', () => {
    const m2 = mapGlobalM2ToInput(null, {
      status: 'PROVIDER_UNREACHABLE', interpretationEligible: false, stale: true,
    });
    expect(m2.globalM2USD).toBeNull();
    expect(m2.oneMonthPct).toBeNull();
    expect(m2.threeMonthAnnPct).toBeNull();
    expect(m2.threeMonthAnnPctPrev).toBeNull();
    expect(m2.validBlocCount).toBe(0);
    expect(m2.stale).toBe(true);
    expect(m2.interpretationEligible).toBe(false);
  });
});

/* ── buildLiquidityTransmissionInput ──────────────────────────────────────── */
describe('buildLiquidityTransmissionInput — mapping', () => {
  it('produces AssetPack per key with confirmed ROC and per-asset metadata', async () => {
    const bars = series('2026-01-01', 250, (i) => 100 + i * 0.1);
    const load = await loadLiquidityAssetSeries({
      alphaVantage: async () => ok(bars),
      fred: async () => ok(bars),
      coingecko: async () => ok(bars),
      derivedTotal2: async () => ok(bars),
    });
    const m2Input = mapGlobalM2ToInput(fakeGlobalM2(), {
      status: 'LIVE', interpretationEligible: true, providersUsed: ['FRED'],
    });
    const built = buildLiquidityTransmissionInput(load, m2Input, '2026-09-07T00:00:00Z');
    // 14 AssetPacks present with numeric ROC values.
    expect(built.packs.length).toBe(14);
    for (const p of built.packs) {
      expect(p.missing).toBe(false);
      expect(typeof p.r20 === 'number').toBe(true);
      expect(typeof p.r5 === 'number').toBe(true);
    }
    // Metadata carries source provenance.
    const dxy = built.packs.find((p) => p.key === 'dxy')!;
    expect(dxy.classification).toBe('PROXY');
    expect(dxy.provider).toBe('alpha-vantage');
    expect(dxy.pineSymbol).toBe('TVC:DXY');
    // Engine input shape.
    expect(built.input.dxy.r20).toBe(dxy.r20);
    expect(built.input.m2.globalM2USD).toBeCloseTo(114.8e12, 5);
  });

  it('missing provider result yields a neutral AssetPack + missing metadata', async () => {
    const bars = series('2026-01-01', 250, (i) => 100 + i * 0.1);
    const fetchers: LiquidityAssetFetchers = {
      alphaVantage: async (sym) => sym === 'HYG'
        ? { bars: null, provider: 'alpha-vantage', status: 'PROVIDER_UNREACHABLE', error: 'x' }
        : ok(bars),
      fred: async () => ok(bars),
      coingecko: async () => ok(bars),
      derivedTotal2: async () => ok(bars),
    };
    const load = await loadLiquidityAssetSeries(fetchers);
    const built = buildLiquidityTransmissionInput(load, mapGlobalM2ToInput(fakeGlobalM2(), { status: 'LIVE', interpretationEligible: true }), '2026-09-07T00:00:00Z');
    const hyg = built.packs.find((p) => p.key === 'hyg')!;
    expect(hyg.missing).toBe(true);
    expect(built.input.hyg).toEqual({ m1: null, r20: null, r5: null, stale: false });
    // All other assets still present.
    expect(built.packs.filter((p) => p.missing).map((p) => p.key)).toEqual(['hyg']);
  });

  it('flags provider series as stale when latest confirmed bar is older than 7d', async () => {
    // Series ends 2026-08-01 — 37 days before as-of 2026-09-07 → stale.
    const staleBars = series('2026-05-01', 93, (i) => 50 + i);
    const freshBars = series('2026-01-01', 250, (i) => 100 + i * 0.1);
    const fetchers: LiquidityAssetFetchers = {
      alphaVantage: async (sym) => sym === 'VGK' ? ok(staleBars) : ok(freshBars),
      fred: async () => ok(freshBars),
      coingecko: async () => ok(freshBars),
      derivedTotal2: async () => ok(freshBars),
    };
    const load = await loadLiquidityAssetSeries(fetchers);
    const built = buildLiquidityTransmissionInput(load, mapGlobalM2ToInput(fakeGlobalM2(), { status: 'LIVE', interpretationEligible: true }), '2026-09-07T00:00:00Z');
    const vgk = built.packs.find((p) => p.key === 'vgk')!;
    expect(vgk.stale).toBe(true);
    expect(built.input.vgk.stale).toBe(true);
    // Stale flag is metadata only — ROC values are still calculated.
    expect(typeof vgk.r5 === 'number').toBe(true);
  });

  it('m2Meta.parityStatus is always DATA_PARITY_PENDING (never FULL_PARITY)', async () => {
    const bars = series('2026-01-01', 250, (i) => 100 + i);
    const load = await loadLiquidityAssetSeries({
      alphaVantage: async () => ok(bars), fred: async () => ok(bars),
      coingecko: async () => ok(bars), derivedTotal2: async () => ok(bars),
    });
    const built = buildLiquidityTransmissionInput(load, mapGlobalM2ToInput(fakeGlobalM2(), { status: 'LIVE', interpretationEligible: true }), '2026-09-07T00:00:00Z');
    expect(built.m2Meta.parityStatus).toBe('DATA_PARITY_PENDING');
    expect(['FORMULA_VALIDATED', 'DATA_PARITY_PENDING']).toContain(built.m2Meta.parityStatus);
  });
});
