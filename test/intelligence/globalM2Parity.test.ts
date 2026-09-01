import { describe, it, expect } from 'vitest';
import {
  computeGlobalM2,
  GLOBAL_M2_CONFIG,
  type GlobalM2BlocInput,
  type M2Classification,
} from '@/lib/intelligence/engines/globalM2';
import { normalizeM2Bloc, alignMonthlyFx, convertM2ToUsd } from '@/lib/intelligence/data/globalM2Normalize';

/**
 * GLOBAL M2 CORE — parity harness for the port of
 * Global_M2_Cross_Asset_Liquidity_Engine_v2.4.2_INTRADAY_SAFE.pine.
 * Growth is computed on USD-converted M2 (FX-before-return, per currency.USD).
 */

function monthAt(i: number): string {
  const m = 1 + i;
  const yy = 2025 + Math.floor((m - 1) / 12);
  const mm = ((m - 1) % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

function usdBloc(id: string, usd: number[], classification: M2Classification = 'EXACT', extra: Partial<GlobalM2BlocInput> = {}): GlobalM2BlocInput {
  return {
    id, name: id, nativeCurrency: 'USD', classification, provider: 'test', sourceSeries: 'test',
    observations: usd.map((v, i) => ({ month: monthAt(i), nativeM2: v, fxRate: null, usdM2: v })),
    ...extra,
  };
}

function run(blocs: GlobalM2BlocInput[], lag = 1) {
  return computeGlobalM2({ blocs }, { lagMonths: lag, nominalWeights: GLOBAL_M2_CONFIG.nominalWeights });
}

const pc = (a: number, b: number) => 100 * (a / b - 1);

describe('A. Individual bloc arithmetic (USD growth)', () => {
  // cur = 14-1-1 = 12. L0=obs12=112, L1=obs11=110, L3=obs9=106, L12=obs0=100.
  const arr = [100, 100, 100, 100, 100, 100, 100, 100, 100, 106, 108, 110, 112, 113];
  const r = run([usdBloc('US', arr)]);
  it('1M / 3M / YoY equal the single bloc USD ROC exactly', () => {
    expect(r.oneMonthPct).toBe(pc(112, 110));
    expect(r.threeMonthPct).toBe(pc(112, 106));
    expect(r.yoyPct).toBe(pc(112, 100));
    expect(r.totalUsd).toBe(112);
  });
});

describe('B. Dynamic USD-balance weighting', () => {
  const A = usdBloc('US', [100, 100, 100, 100, 100, 110, 110]); // cur=5 L0=110,L1=100 -> r1=10
  const B = usdBloc('CN', [100, 100, 100, 100, 100, 105, 105]); // cur=5 L0=105,L1=100 -> r1=5
  const r = run([A, B]);
  it('1M is the USD-level-weighted average of bloc changes', () => {
    const expected = (110 * pc(110, 100) + 105 * pc(105, 100)) / (110 + 105);
    expect(r.oneMonthPct).toBeCloseTo(expected, 10);
    expect(r.totalUsd).toBe(215);
  });
});

describe('C. Missing-bloc reweighting', () => {
  const A = usdBloc('US', [100, 100, 100, 100, 100, 110, 110]);
  const B = usdBloc('CN', [100, 100, 100, 100, 100, 105, 105]);
  const D = usdBloc('BR', [100]); // only 1 obs -> cur<0 -> excluded (NA)
  it('excludes the missing bloc from numerator AND denominator', () => {
    const withD = run([A, B, D]);
    const without = run([A, B]);
    expect(withD.oneMonthPct).toBe(without.oneMonthPct);
    expect(withD.validBlocCount).toBe(2);
    expect(withD.totalUsd).toBe(215);
  });
  it('metadata discloses degraded + weighted coverage (missing China collapses weight)', () => {
    const missingChina = run([A]); // only US valid
    expect(missingChina.quality.missingBlocCount).toBe(10);
    // China (~37% nominal) missing -> weighted coverage far below 11/11.
    expect(missingChina.quality.missingWeightedShare).toBeGreaterThan(30);
    expect(missingChina.quality.weightedCoveragePercent).toBeLessThan(70);
  });
});

describe('D. Parity lag semantics', () => {
  const arr = [100, 101, 103, 106, 110, 115, 121, 128]; // n=8
  it('lag shifts the confirmed observation and the rate', () => {
    const l1 = run([usdBloc('US', arr)], 1); // cur=6 L0=121 L1=115
    const l2 = run([usdBloc('US', arr)], 2); // cur=5 L0=115 L1=110
    const l3 = run([usdBloc('US', arr)], 3); // cur=4 L0=110 L1=106
    expect(l1.blocs[0].observationMonth).toBe(monthAt(6));
    expect(l2.blocs[0].observationMonth).toBe(monthAt(5));
    expect(l3.blocs[0].observationMonth).toBe(monthAt(4));
    expect(l1.oneMonthPct).toBeCloseTo(pc(121, 115), 10);
    expect(l2.oneMonthPct).toBeCloseTo(pc(115, 110), 10);
    expect(l3.oneMonthPct).toBeCloseTo(pc(110, 106), 10);
  });
});

describe('E. Annualisation is 3M × 4 (not CAGR)', () => {
  const arr = [100, 100, 100, 100, 100, 100, 100, 100, 100, 106, 108, 110, 112, 113];
  const r = run([usdBloc('US', arr)]);
  it('threeMonthAnnualizedPct === threeMonthPct * 4', () => {
    expect(r.threeMonthAnnualizedPct).toBe((r.threeMonthPct as number) * 4);
  });
});

describe('F. Acceleration = current vs previous annualised 3M', () => {
  // cur=5. L0=110,L1=108,L2=105,L3=100,L4=90,L5=100.
  const arr = [100, 90, 100, 105, 108, 110, 999];
  const r = run([usdBloc('US', arr)]);
  it('accel3M and accel3MPrevious reproduce the Pine difference', () => {
    const r3 = pc(110, 100), r3Prev = pc(108, 90), r3PrevPrev = pc(105, 100);
    expect(r.accel3M).toBeCloseTo(r3 * 4 - r3Prev * 4, 9);
    expect(r.accel3MPrevious).toBeCloseTo(r3Prev * 4 - r3PrevPrev * 4, 9);
  });
});

describe('G. Liquidity cycle — every state', () => {
  const cases: Record<string, number[]> = {
    'EARLY EXPANSION': [100, 110, 100, 104, 108, 106, 999],
    'ACCELERATION': [100, 100, 100, 101, 102, 106, 999],
    'LATE EXPANSION': [100, 90, 100, 105, 108, 110, 999],
    'DECELERATION': [100, 90, 100, 104, 110, 106, 999],
    'BOTTOMING': [100, 110, 110, 100, 90, 100, 999],
    'CONTRACTION': [100, 110, 110, 100, 105, 100, 999],
  };
  for (const [state, arr] of Object.entries(cases)) {
    it(`classifies ${state}`, () => {
      expect(run([usdBloc('US', arr)]).liquidityCycle).toBe(state);
    });
  }
});

describe('H. Turn state — all four', () => {
  const cases: Record<string, number[]> = {
    'UPSIDE TURN': [100, 100, 100, 105, 102, 106, 999],
    'DOWNSIDE TURN': [100, 100, 100, 103, 106, 102, 999],
    'IMPROVING': [100, 100, 100, 102, 104, 106, 999],
    'WEAKENING': [100, 100, 100, 106, 104, 102, 999],
  };
  for (const [state, arr] of Object.entries(cases)) {
    it(`classifies ${state}`, () => {
      expect(run([usdBloc('US', arr)]).turnState).toBe(state);
    });
  }
});

describe('I. FX-before-return semantics', () => {
  it('growth reflects per-month USD conversion, not local return then convert', () => {
    // Native M2 flat at 1000; local currency strengthens in the final month.
    const months = Array.from({ length: 7 }, (_, i) => monthAt(i));
    const fx = alignMonthlyFx(months.map((m, i) => ({ month: m, rate: i === 5 ? 98 : 100 })));
    const bloc = normalizeM2Bloc({
      id: 'JP', name: 'Japan', nativeCurrency: 'JPY', classification: 'ALTERNATIVE',
      provider: 'test', sourceSeries: 'test', fxDirection: 'divide',
      m2: months.map((m) => ({ month: m, nativeM2: 1000 })), fxByMonth: fx,
    });
    const r = run([bloc]);
    // cur=5: usd[5]=1000/98=10.2040..., usd[4]=1000/100=10 -> r1 = +2.0408%.
    expect(r.oneMonthPct).toBeCloseTo(pc(1000 / 98, 1000 / 100), 8);
    // Local-return-then-convert would be 0% (native is flat). Prove they differ.
    expect(r.oneMonthPct).not.toBe(0);
    expect(Math.abs(r.oneMonthPct as number)).toBeGreaterThan(1.5);
  });

  it('convertM2ToUsd applies multiply/divide/none correctly', () => {
    expect(convertM2ToUsd(100, 1.1, 'multiply')).toBeCloseTo(110, 10); // EURUSD
    expect(convertM2ToUsd(1000, 150, 'divide')).toBeCloseTo(6.6667, 3); // USDJPY
    expect(convertM2ToUsd(500, null, 'none')).toBe(500); // USD bloc
    expect(Number.isNaN(convertM2ToUsd(100, 0, 'divide'))).toBe(true); // zero rate -> NaN
  });
});

describe('J. No premature rounding inside the engine', () => {
  const arr = [100, 100, 100, 100, 100, 100, 100, 100, 100, 106, 108, 110, 112, 113];
  const r = run([usdBloc('US', arr)]);
  it('retains full float precision', () => {
    expect(r.oneMonthPct).toBe(100 * (112 / 110 - 1)); // exact, not 1.82
    expect(r.oneMonthPct).not.toBe(1.82);
  });
});

describe('Data quality flags', () => {
  it('parityStatus is FORMULA_VALIDATED and never FULL_PARITY in this phase', () => {
    const r = run([usdBloc('US', [100, 100, 100, 100, 100, 110])]);
    expect(r.quality.parityStatus).toBe('FORMULA_VALIDATED');
  });
  it('counts classifications and stale blocs', () => {
    const r = run([
      usdBloc('US', [100, 100, 100, 100, 100, 110], 'EXACT'),
      usdBloc('CN', [100, 100, 100, 100, 100, 105], 'EXACT', { stale: true }),
      usdBloc('GB', [100, 100, 100, 100, 100, 102], 'PROXY'),
    ]);
    expect(r.quality.exactBlocCount).toBe(2);
    expect(r.quality.proxyBlocCount).toBe(1);
    expect(r.quality.staleBlocCount).toBe(1);
  });
});

// ── K. TradingView reference scaffold (NOT asserted — inputs pending) ─────────
// Recent deployed TradingView GM2 output. Kept as a reference for a future
// full-pipeline snapshot once raw per-country bars + FX are captured. parity
// remains DATA_PARITY_PENDING; formulas are NOT tuned to hit these.
export const TV_GLOBAL_M2_REFERENCE = {
  totalUsdTrillions: 114.84,
  oneMonthPct: 0.28,
  threeMonthAnnualizedPct: 9.93,
  yoyPct: 8.54,
  accel3M: -0.83,
  liquidityCycle: 'LATE EXPANSION',
  parityStatus: 'DATA_PARITY_PENDING' as const,
};

// ── K. TradingView reference scaffold (NOT asserted — inputs pending) ─────────
describe('L. Missing calendar month — no fabricated observation', () => {
  const rawMonths = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-07', '2026-08'];
  const bloc = normalizeM2Bloc({
    id: 'US', name: 'United States', nativeCurrency: 'USD', classification: 'EXACT',
    provider: 'test', sourceSeries: 'test', fxDirection: 'none',
    m2: rawMonths.map((m, i) => ({ month: m, nativeM2: 100 + i })),
  });
  it('does not insert a synthetic month and keeps only source observations', () => {
    expect(bloc.observations).toHaveLength(7);
    expect(bloc.observations.map((o) => o.month)).toEqual(rawMonths);
    expect(bloc.observations.some((o) => o.month === '2026-06')).toBe(false);
  });
  it('lag indexing walks source observations across the calendar gap', () => {
    const r = run([bloc], 1); // cur=5 -> mNow month = 2026-07, prev obs = 2026-05
    expect(r.blocs[0].observationMonth).toBe('2026-07');
    expect(r.oneMonthPct).toBeCloseTo(pc(105, 104), 10);
  });
  it('is deterministic', () => {
    expect(run([bloc], 1)).toEqual(run([bloc], 1));
  });
});

describe('M. Reference weights are metadata only (cannot alter calculations)', () => {
  const A = usdBloc('US', [100, 100, 100, 100, 100, 100, 100, 100, 100, 106, 108, 110, 112, 113], 'EXACT');
  const B = usdBloc('CN', [200, 200, 200, 200, 200, 200, 200, 200, 200, 210, 214, 218, 220, 221], 'EXACT');
  const input = { blocs: [A, B] };
  const rDefault = computeGlobalM2(input, { lagMonths: 1, nominalWeights: GLOBAL_M2_CONFIG.nominalWeights });
  const rWeird = computeGlobalM2(input, { lagMonths: 1, nominalWeights: { US: 99, CN: 1 } });
  const rEmpty = computeGlobalM2(input, { lagMonths: 1, nominalWeights: {} });
  it('totalUsd / 1M / 3M / YoY / acceleration / cycle are identical regardless of weights', () => {
    for (const r of [rWeird, rEmpty]) {
      expect(r.totalUsd).toBe(rDefault.totalUsd);
      expect(r.oneMonthPct).toBe(rDefault.oneMonthPct);
      expect(r.threeMonthPct).toBe(rDefault.threeMonthPct);
      expect(r.yoyPct).toBe(rDefault.yoyPct);
      expect(r.accel3M).toBe(rDefault.accel3M);
      expect(r.liquidityCycle).toBe(rDefault.liquidityCycle);
    }
  });
  it('only the weighted-coverage estimate (metadata) changes, and its basis is labelled', () => {
    expect(rWeird.quality.estimatedWeightedCoveragePercent).not.toBe(rDefault.quality.estimatedWeightedCoveragePercent);
    expect(rDefault.quality.weightedCoverageBasis).toBe('REFERENCE_WEIGHTS');
    expect(rDefault.quality.weightedCoverageEstimated).toBe(true);
    expect(rEmpty.quality.weightedCoverageBasis).toBe('UNAVAILABLE');
    expect(rDefault.quality.observedWeightedShare?.exact).toBeCloseTo(100, 6);
  });
});

describe('K. TradingView scaffold', () => {
  it.skip('full 11-bloc parity vs TradingView (needs raw country bars + FX)', () => {
    expect(TV_GLOBAL_M2_REFERENCE.totalUsdTrillions).toBeCloseTo(114.84, 2);
  });
});
