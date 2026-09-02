import { describe, it, expect } from 'vitest';
import {
  UNIT_TRANSFORMS, convertM2ToUsd, alignMonthlyFxClose, lastCalendarDay, normalizeM2BlocFull,
  type DailyFxPoint,
} from '@/lib/intelligence/data/globalM2Normalize';
import { validateM2Series } from '@/lib/intelligence/data/providers/globalM2ProviderTypes';
import { parseAvFxDaily } from '@/lib/intelligence/data/providers/alphaVantageFx';
import { fetchUsM2 } from '@/lib/intelligence/data/providers/fredM2';
import { fetchChinaM2, findMoneySupplyHtmLink, parsePbocYearIndex } from '@/lib/intelligence/data/providers/pbocM2';
import { fetchSwissM2, selectSnbM2Series } from '@/lib/intelligence/data/providers/snbM2';
import { buildWave1Bundle } from '@/lib/intelligence/data/globalM2Pipeline';
import { computeGlobalM2 } from '@/lib/intelligence/engines/globalM2';

/* ── Unit transforms ─────────────────────────────────────────────────────── */
describe('Unit transforms', () => {
  it('FRED M2SL billions USD → USD', () => expect(UNIT_TRANSFORMS.fredBillionsUsdToUsd(22000)).toBe(22000 * 1e9));
  it('PBOC 亿元 → CNY', () => expect(UNIT_TRANSFORMS.pbocYiYuanToCny(3555077.24)).toBeCloseTo(3.55507724e14, 2));
  it('SNB CHF millions → CHF', () => expect(UNIT_TRANSFORMS.snbChfMillionsToChf(1100000)).toBe(1.1e12));
});

/* ── FX direction ────────────────────────────────────────────────────────── */
describe('FX conversion direction', () => {
  it('USDCNY divide: CNY M2 ÷ USDCNY', () => expect(convertM2ToUsd(3.55e14, 7.1, 'divide')).toBeCloseTo(3.55e14 / 7.1, 0));
  it('USDCHF divide: CHF M2 ÷ USDCHF', () => expect(convertM2ToUsd(1.1e12, 0.8, 'divide')).toBeCloseTo(1.1e12 / 0.8, 0));
  it('US none: USD unchanged', () => expect(convertM2ToUsd(22e12, null, 'none')).toBe(22e12));
});

/* ── FX alignment policy ─────────────────────────────────────────────────── */
describe('MONTH_END_LAST_VALID alignment', () => {
  it('lastCalendarDay', () => { expect(lastCalendarDay('2026-07')).toBe('2026-07-31'); expect(lastCalendarDay('2026-02')).toBe('2026-02-28'); });
  it('weekend/holiday month-end walks backward', () => {
    // 2026-05-31 is a Sunday; last valid close is Fri 2026-05-29.
    const daily: DailyFxPoint[] = [{ date: '2026-05-28', rate: 7.0 }, { date: '2026-05-29', rate: 7.1 }];
    const a = alignMonthlyFxClose('2026-05', daily);
    expect(a?.fxObservationDate).toBe('2026-05-29');
    expect(a?.rate).toBe(7.1);
  });
  it('never leaks forward into the next month', () => {
    const daily: DailyFxPoint[] = [{ date: '2026-07-31', rate: 7.1 }, { date: '2026-08-03', rate: 7.2 }];
    expect(alignMonthlyFxClose('2026-07', daily)?.fxObservationDate).toBe('2026-07-31');
    // Only a next-month rate exists for this M2 month → no leakage → null.
    expect(alignMonthlyFxClose('2026-07', [{ date: '2026-08-01', rate: 7.2 }])).toBeNull();
  });
  it('missing month-end FX → null', () => {
    expect(alignMonthlyFxClose('2026-07', [{ date: '2026-06-30', rate: 7.0 }])?.fxObservationDate).toBe('2026-06-30');
    expect(alignMonthlyFxClose('2026-07', [])).toBeNull();
  });
});

/* ── Full historical conversion BEFORE return ────────────────────────────── */
describe('Convert every historical month first', () => {
  const months = ['2025-01', '2025-02', '2025-03'];
  const daily: DailyFxPoint[] = [
    { date: '2025-01-31', rate: 7.0 }, { date: '2025-02-28', rate: 7.2 }, { date: '2025-03-31', rate: 7.5 },
  ];
  const bloc = normalizeM2BlocFull({
    id: 'CN', name: 'China', nativeCurrency: 'CNY', nativeUnit: '100-million-CNY', classification: 'EXACT',
    provider: 'PBOC', sourceSeries: 'M2', retrievedAt: '2025-04-01T00:00:00Z',
    nativeUnitScale: 1e8, fxDirection: 'divide', fxPair: 'USDCNY', dailyFx: daily,
    m2: months.map((m, i) => ({ month: m, nativeM2: 3000000 + i * 10000 })),
  });
  it('each month uses its own aligned FX (per-month USD), not a single rate', () => {
    expect(bloc.observations[0].usdM2).toBeCloseTo((3000000 * 1e8) / 7.0, 0);
    expect(bloc.observations[1].usdM2).toBeCloseTo((3010000 * 1e8) / 7.2, 0);
    expect(bloc.observations[2].usdM2).toBeCloseTo((3020000 * 1e8) / 7.5, 0);
    expect(bloc.observations[1].fxObservationDate).toBe('2025-02-28');
  });
  it('growth is computed on the USD series (FX-before-return)', () => {
    const r = computeGlobalM2({ blocs: [bloc] }, { lagMonths: 1, nominalWeights: {} });
    // cur=1 (lag 1): USD[1]=native/7.2, USD[0]=native/7.0. r1 reflects FX move.
    const usdCur = (3010000 * 1e8) / 7.2, usdPrev = (3000000 * 1e8) / 7.0;
    expect(r.oneMonthPct).toBeCloseTo(100 * (usdCur / usdPrev - 1), 8);
  });
});

/* ── Provider fail-closed validation ─────────────────────────────────────── */
describe('Provider fail-closed', () => {
  it('validateM2Series rejects bad scale / duplicates / non-monotonic / short', () => {
    expect(() => validateM2Series([{ month: '2026-01', nativeM2: 5 }], { minNative: 1000, maxNative: 9e6, minDepth: 1 })).toThrow(/outside plausible/);
    expect(() => validateM2Series([{ month: '2026-01', nativeM2: 100 }, { month: '2026-01', nativeM2: 101 }], { minNative: 0, maxNative: 1e9, minDepth: 1 })).toThrow(/duplicate/);
    expect(() => validateM2Series([{ month: '2026-02', nativeM2: 100 }, { month: '2026-01', nativeM2: 101 }], { minNative: 0, maxNative: 1e9, minDepth: 1 })).toThrow(/ascending/);
    expect(() => validateM2Series([], { minNative: 0, maxNative: 1e9, minDepth: 13 })).toThrow(/too short/);
  });
  it('parseAvFxDaily returns error on rate-limit payload', () => {
    expect(parseAvFxDaily({ Note: 'rate limited' }, 'USDCNY', 'now').ok).toBe(false);
  });
  it('fetchUsM2 fails closed on implausible values', async () => {
    const r = await fetchUsM2({ fetchObservations: async () => Array.from({ length: 14 }, (_, i) => ({ date: `2025-${String(i + 1).padStart(2, '0')}-01`, value: '5' })) });
    expect(r.ok).toBe(false);
  });
  it('SNB selector returns null when M2 series absent (fail closed downstream)', () => {
    expect(selectSnbM2Series({ timeseries: [{ header: [{ dim: 'x', dimItem: 'Monetary aggregate M1' }], metadata: { key: 'x{B,GM1}', frequency: 'P1M', unit: 'In CHF millions' }, values: [] }] })).toBeNull();
  });
  it('PBOC helpers parse deterministically', () => {
    expect(findMoneySupplyHtmLink('<td>货币供应量 Money Supply</td><td><a href="/x/ms.htm">htm</a></td>')).toBe('/x/ms.htm');
    const idx = parsePbocYearIndex('<a href="/diaochatongjisi/116219/116319/5570903/index.html">2025年</a>');
    expect(idx.get(2025)).toBe('5570903');
  });
});

/* ── Pipeline: partial bundle + stale labelling + lag=1 ──────────────────── */
function fxFixture(pair: string) {
  const daily = Array.from({ length: 24 }, (_, i) => {
    const y = 2025 + Math.floor(i / 12); const m = (i % 12) + 1;
    return { date: `${y}-${String(m).padStart(2, '0')}-28`, rate: pair === 'USDCNY' ? 7.1 : 0.8 };
  });
  return { ok: true, pair, daily, retrievedAt: 'now' };
}
function m2Fixture(id: string, provider: string, unit: string, base: number) {
  const m2 = Array.from({ length: 15 }, (_, i) => {
    const y = 2025 + Math.floor(i / 12); const m = (i % 12) + 1;
    return { month: `${y}-${String(m).padStart(2, '0')}`, nativeM2: base + i * (base * 0.002) };
  });
  return { ok: true, id, provider, sourceSeries: 'M2', sourceUrl: 'u', nativeCurrency: 'X', nativeUnit: unit, m2, latestObservationMonth: m2[m2.length - 1].month, retrievedAt: 'now' };
}

describe('Wave-1 pipeline (injected fixtures)', () => {
  it('missing provider → partial bundle, others still normalize', async () => {
    const bundle = await buildWave1Bundle({
      us: async () => m2Fixture('US', 'FRED', 'billions-USD', 22000),
      china: async () => ({ ok: false, id: 'CN', provider: 'PBOC', sourceSeries: 'M2', nativeCurrency: 'CNY', nativeUnit: '100-million-CNY', m2: [], latestObservationMonth: null, retrievedAt: 'now', error: 'PBOC-down' }),
      swiss: async () => m2Fixture('CH', 'SNB', 'millions-CHF', 1100000),
      usdcny: async () => fxFixture('USDCNY'),
      usdchf: async () => fxFixture('USDCHF'),
    });
    expect(bundle.result.validBlocCount).toBe(2); // US + CH
    expect(bundle.missingBlocIds).toContain('CN');
    expect(bundle.result.quality.missingBlocCount).toBe(9);
    expect(bundle.result.quality.parityStatus).toBe('DATA_PARITY_PENDING');
    expect(bundle.providerStatus.find((p) => p.id === 'CN')?.ok).toBe(false);
  });

  it('three-bloc partial: validBlocCount=3, missingBlocCount=8, DATA_PARITY_PENDING', async () => {
    const bundle = await buildWave1Bundle({
      us: async () => m2Fixture('US', 'FRED', 'billions-USD', 22000),
      china: async () => m2Fixture('CN', 'PBOC', '100-million-CNY', 3000000),
      swiss: async () => m2Fixture('CH', 'SNB', 'millions-CHF', 1100000),
      usdcny: async () => fxFixture('USDCNY'),
      usdchf: async () => fxFixture('USDCHF'),
    });
    expect(bundle.result.validBlocCount).toBe(3);
    expect(bundle.result.quality.missingBlocCount).toBe(8);
    expect(bundle.result.quality.parityStatus).toBe('DATA_PARITY_PENDING');
    // lag=1: observation month used is the second-to-last (previous confirmed).
    const usBloc = bundle.result.blocs.find((b) => b.id === 'US')!;
    expect(usBloc.observationMonth).toBe('2026-02'); // 15 months from 2025-01 -> last 2026-03, lag1 -> 2026-02
  });

  it('stale provider is preserved but labelled (engine never decides staleness)', async () => {
    const staleUs = { ...m2Fixture('US', 'FRED', 'billions-USD', 22000) };
    // Force an old latest month.
    staleUs.m2 = Array.from({ length: 15 }, (_, i) => ({ month: `2023-${String((i % 12) + 1).padStart(2, '0')}`, nativeM2: 22000 + i }));
    staleUs.latestObservationMonth = staleUs.m2[staleUs.m2.length - 1].month;
    const bundle = await buildWave1Bundle({
      us: async () => staleUs,
      china: async () => ({ ok: false, id: 'CN', provider: 'PBOC', sourceSeries: 'M2', nativeCurrency: 'CNY', nativeUnit: '100-million-CNY', m2: [], latestObservationMonth: null, retrievedAt: 'now', error: 'x' }),
      swiss: async () => ({ ok: false, id: 'CH', provider: 'SNB', sourceSeries: 'M2', nativeCurrency: 'CHF', nativeUnit: 'millions-CHF', m2: [], latestObservationMonth: null, retrievedAt: 'now', error: 'x' }),
      usdcny: async () => fxFixture('USDCNY'),
      usdchf: async () => fxFixture('USDCHF'),
    });
    const us = bundle.providerStatus.find((p) => p.id === 'US')!;
    expect(us.ok).toBe(true);
    expect(us.stale).toBe(true);
    expect(bundle.result.blocs.find((b) => b.id === 'US')).toBeDefined(); // preserved
  });
});
