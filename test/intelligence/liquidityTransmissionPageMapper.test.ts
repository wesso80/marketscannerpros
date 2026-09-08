// Phase 4D — page mapper tests. Pure, no network. Verifies:
//   - Stage-8 rendering (headline + conditions)
//   - Global M2 dual-coverage (bloc availability vs estimated weighted coverage)
//   - DATA_PARITY_PENDING is always emitted (never FULL_PARITY)
//   - TOTAL2 is DERIVED with the required tooltip
//   - Source classifications match the LIQUIDITY_PROVIDER_MAP
//   - Unavailable / stale / missing states
//   - Active alerts flow through untouched
//   - masterLinkDelta null → HISTORY BUILDING

import { describe, it, expect } from 'vitest';
import {
  mapLiquidityTransmissionToPageDto,
  buildStage8Explanation,
  stateToGate,
  TOTAL2_DERIVED_NOTE,
  PARITY_STATUS,
  M2_INTERPRETATION_THRESHOLD,
  M2_TOTAL_BLOCS,
} from '@/lib/intelligence/liquidityTransmissionPageMapper';
import type { LiquidityTransmissionResolved } from '@/lib/intelligence/liquidityTransmissionService';
import type {
  LiquidityTransmissionResult, TransmissionStageResult,
} from '@/lib/intelligence/engines/liquidityTransmission';
import type { AssetPackMetadata } from '@/lib/intelligence/data/liquidityTransmissionInputBuilder';

function stage(
  n: number, opts: Partial<TransmissionStageResult> = {},
): TransmissionStageResult {
  return {
    stage: n,
    name: opts.name ?? `Stage ${n}`,
    driver: opts.driver ?? 'test driver',
    grade: opts.grade ?? 'A',
    riskOnScore: opts.riskOnScore ?? 60,
    score: opts.score ?? 60,
    cumulative: opts.cumulative ?? (n === 8 ? null : 60),
    state: opts.state ?? 'MIXED',
    role: opts.role ?? 'role text',
    next: opts.next ?? 'next text',
    confMonthPct: opts.confMonthPct ?? 1,
    live20d: opts.live20d ?? 2,
    live5d: opts.live5d ?? 3,
    active: opts.active ?? false,
  };
}

function pack(
  key: AssetPackMetadata['key'],
  classification: AssetPackMetadata['classification'],
  opts: Partial<AssetPackMetadata> = {},
): AssetPackMetadata {
  return {
    key,
    pineSymbol: opts.pineSymbol ?? `PINE:${key.toUpperCase()}`,
    provider: opts.provider ?? 'alpha-vantage',
    providerSymbol: opts.providerSymbol ?? key.toUpperCase(),
    sourceName: opts.sourceName ?? `${key} source`,
    classification,
    reason: opts.reason,
    latestDaily: opts.latestDaily ?? '2026-09-05',
    latestMonthly: opts.latestMonthly ?? '2026-08',
    observationCount: opts.observationCount ?? 250,
    monthlyObservationCount: opts.monthlyObservationCount ?? 12,
    m1: opts.m1 ?? 1, r20: opts.r20 ?? 2, r5: opts.r5 ?? 3,
    stale: opts.stale ?? false,
    missing: opts.missing ?? false,
    status: opts.status ?? 'OK',
    error: opts.error,
  };
}

function baseResult(over: Partial<LiquidityTransmissionResult> = {}): LiquidityTransmissionResult {
  return {
    calculatedAt: '2026-09-07T00:00:00Z',
    flow: 'TRANSITION',
    masterLink: 55.22,
    transmissionRiskOn: 55.22,
    validated: 58.03,
    downstream: 72.5,
    clockStage: 8,
    clockName: 'LATE-CYCLE / DIVERGENCE',
    clockContext: '8/8 LATE-CYCLE / DIVERGENCE · DECELERATION',
    liquidityCycle: 'DECELERATION',
    dominantRiskOn: true,
    m2BiasScore: 50,
    earlyWarningRisk: 70,
    earlyWarningState: 'WARNING',
    lateCycleScore: 70,
    lateCycleState: 'WARNING',
    stage8Active: true,
    riskLiquidityGap: 17.28,
    divergenceState: 'DIVERGENCE',
    cryptoDelayWindow: 'INACTIVE',
    usRiskOn: 51.09,
    cryptoMajorsRiskOn: 94.29,
    altRiskOn: 93.54,
    drivers: [],
    stages: [
      stage(1, { score: 50, state: 'MIXED' }),
      stage(2, { score: 50.22, state: 'MIXED' }),
      stage(3, { score: 30.42, state: 'OPPOSING' }),
      stage(4, { score: 64.66, state: 'SUPPORTIVE' }),
      stage(5, { score: 51.09, state: 'MIXED' }),
      stage(6, { score: 94.29, state: 'CONFIRMED' }),
      stage(7, { score: 93.54, state: 'CONFIRMED' }),
      stage(8, { score: 70, state: 'WARNING', active: true, cumulative: null }),
    ],
    playbook: 'TRANSITION · LATE-CYCLE / DIVERGENCE. Early-warning risk. Divergence: DIVERGENCE.',
    confidence: 91,
    confidenceLabel: 'HIGH',
    alerts: {
      broadRiskOn: false, broadRiskOff: false, divergenceWarning: true,
      earlyWarningElevated: true, earlyWarningHigh: true, cryptoWindowActive: false,
    },
    quality: {
      coveragePercent: 100, exactInputCount: 9, alternativeInputCount: 2, proxyInputCount: 3,
      missingInputCount: 0, staleInputCount: 0, providersUsed: ['alpha-vantage', 'fred', 'coingecko'],
      upstreamM2Status: 'LIVE/PARTIAL UPSTREAM', upstreamM2Coverage: 82,
      upstreamM2Stale: false, upstreamM2InterpretationEligible: false,
      calculationStatus: 'PARTIAL', parityStatus: 'DATA_PARITY_PENDING',
    },
    ...over,
  };
}

function fullPacks(): AssetPackMetadata[] {
  return [
    pack('dxy', 'PROXY', { reason: 'ICE DXY not licensed — UUP ETF proxy' }),
    pack('copper', 'PROXY'),
    pack('eem', 'EXACT'),
    pack('vgk', 'EXACT'),
    pack('hyg', 'EXACT'),
    pack('lqd', 'EXACT'),
    pack('gold', 'PROXY'),
    pack('silver', 'PROXY'),
    pack('vix', 'EXACT', { provider: 'fred' }),
    pack('spx', 'PROXY'),
    pack('ndx', 'PROXY'),
    pack('btc', 'ALTERNATIVE', { provider: 'coingecko' }),
    pack('eth', 'ALTERNATIVE', { provider: 'coingecko' }),
    pack('total2', 'DERIVED', { provider: 'derived', reason: 'Derived from CoinGecko global mcap minus BTC mcap' }),
  ];
}

function baseResolved(over: Partial<LiquidityTransmissionResolved> = {}): LiquidityTransmissionResolved {
  return {
    status: 'PARTIAL',
    environmentLabel: 'LOCAL LIVE',
    calculatedAt: '2026-09-07T00:00:00Z',
    result: baseResult(),
    packs: fullPacks(),
    m2Meta: {
      status: 'LIVE/PARTIAL UPSTREAM',
      coveragePercent: 82,
      estimatedWeightedCoveragePercent: 94.4,
      interpretationEligible: false,
      parityStatus: 'DATA_PARITY_PENDING',
      validBlocCount: 9,
      missingBlocs: ['india', 'south-korea'],
      stale: false,
      providersUsed: ['fred', 'ecb'],
      calculatedAt: '2026-09-07T00:00:00Z',
    },
    previousMasterLink: null,
    masterLinkDelta: null,
    providersUsed: ['alpha-vantage', 'fred', 'coingecko', 'derived'],
    missingKeys: [],
    errors: [],
    ...over,
  };
}

/* ── Parity + status ──────────────────────────────────────────────────────── */

describe('mapLiquidityTransmissionToPageDto — parity + status', () => {
  it('always emits DATA_PARITY_PENDING and never FULL_PARITY', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    expect(dto.parityStatus).toBe('DATA_PARITY_PENDING');
    expect(dto.parityStatus).not.toBe('FULL_PARITY');
    expect(dto.m2Upstream.parityStatus).toBe('DATA_PARITY_PENDING');
    expect(PARITY_STATUS).toBe('DATA_PARITY_PENDING');
  });

  it('LIVE · PARTIAL UPSTREAM label when M2 interpretation ineligible', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    expect(dto.statusLabel).toBe('LIVE · PARTIAL UPSTREAM');
    expect(dto.available).toBe(true);
    expect(dto.headline).not.toBeNull();
  });

  it('promotes to LIVE when interpretation eligible', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved({
      m2Meta: {
        ...baseResolved().m2Meta,
        interpretationEligible: true,
        estimatedWeightedCoveragePercent: 96,
      },
    }));
    expect(dto.statusLabel).toBe('LIVE');
  });
});

/* ── Stage-8 rendering ────────────────────────────────────────────────────── */

describe('mapLiquidityTransmissionToPageDto — Stage 8', () => {
  it('marks the four Stage-8 conditions from engine outputs', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    const s8 = dto.stage8Explanation!;
    expect(s8.active).toBe(true);
    expect(s8.headline).toContain('Downstream risk assets are running materially ahead');
    const labels = s8.conditions.map((c) => c.label);
    expect(labels).toContain('Downstream extended');
    expect(labels).toContain('Risk–liquidity gap elevated');
    expect(labels).toContain('M2 cycle slowing');
    expect(labels).toContain('Validated liquidity below threshold');
    for (const c of s8.conditions) expect(c.triggered).toBe(true);
    expect(s8.guidance).toMatch(/research signal/i);
    // Explicitly non-predictive language.
    expect(s8.guidance).not.toMatch(/imminent|crash|will fall/i);
    expect(s8.headline).not.toMatch(/imminent|crash|will fall/i);
  });

  it('inactive Stage 8 with none triggered on a clean balance', () => {
    const r = baseResult({
      stage8Active: false, downstream: 55, riskLiquidityGap: 3,
      liquidityCycle: 'EXPANSION', validated: 65,
    });
    const s8 = buildStage8Explanation(r);
    expect(s8.active).toBe(false);
    expect(s8.conditions.filter((c) => c.triggered).length).toBe(0);
    expect(s8.headline).toContain('balance');
  });

  it('Stage-8 gate maps to ACTIVE / WATCH / CLEAR (never PASS/FAIL)', () => {
    expect(stateToGate(8, 'WARNING')).toBe('ACTIVE');
    expect(stateToGate(8, 'ELEVATED')).toBe('WATCH');
    expect(stateToGate(8, 'WATCH')).toBe('WATCH');
    expect(stateToGate(8, 'CLEAR')).toBe('CLEAR');
    // Stages 1..7 use PASS / PARTIAL / FAIL.
    expect(stateToGate(1, 'CONFIRMED')).toBe('PASS');
    expect(stateToGate(2, 'SUPPORTIVE')).toBe('PARTIAL');
    expect(stateToGate(3, 'MIXED')).toBe('PARTIAL');
    expect(stateToGate(4, 'WEAKENING')).toBe('FAIL');
    expect(stateToGate(5, 'OPPOSING')).toBe('FAIL');
  });

  it('renders all 8 stages with score, state, gate, active from engine', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    expect(dto.stages.length).toBe(8);
    // Stage 8 is the active one in the base fixture.
    const s8 = dto.stages[7];
    expect(s8.stage).toBe(8);
    expect(s8.active).toBe(true);
    expect(s8.gate).toBe('ACTIVE');
    expect(s8.score).toBe(70);
    // Stage 6 is a confirmed pass.
    expect(dto.stages[5].gate).toBe('PASS');
    // Stage 3 is opposing → FAIL.
    expect(dto.stages[2].gate).toBe('FAIL');
  });
});

/* ── Global M2 dual coverage ──────────────────────────────────────────────── */

describe('mapLiquidityTransmissionToPageDto — M2 dual coverage', () => {
  it('exposes bloc availability and estimated weighted coverage separately', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    const m = dto.m2Upstream;
    expect(m.blocsAvailable).toBe(9);
    expect(m.blocsTotal).toBe(M2_TOTAL_BLOCS);
    expect(m.blocAvailabilityPercent).toBeCloseTo((9 / 11) * 100, 1);
    expect(m.estimatedWeightedCoveragePercent).toBe(94.4);
    // Two coverage concepts must be distinct — the bloc availability must not
    // be shown as economic (weighted) coverage.
    expect(m.blocAvailabilityPercent).not.toBe(m.estimatedWeightedCoveragePercent);
    expect(m.interpretationThreshold).toBe(M2_INTERPRETATION_THRESHOLD);
    expect(m.interpretationEligible).toBe(false);
    expect(m.missingBlocs).toEqual(['india', 'south-korea']);
  });

  it('handles missing weighted coverage without inventing a number', () => {
    const resolved = baseResolved();
    const dto = mapLiquidityTransmissionToPageDto({
      ...resolved,
      m2Meta: { ...resolved.m2Meta, estimatedWeightedCoveragePercent: undefined },
    });
    expect(dto.m2Upstream.estimatedWeightedCoveragePercent).toBeNull();
    expect(dto.m2Upstream.blocsAvailable).toBe(9);
  });
});

/* ── Source quality ───────────────────────────────────────────────────────── */

describe('mapLiquidityTransmissionToPageDto — source quality', () => {
  it('counts source classifications from packs (not Pine roles)', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    // Expected mapping from the LIQUIDITY_PROVIDER_MAP:
    // EXACT: eem, vgk, hyg, lqd, vix  → 5
    // PROXY: dxy, copper, gold, silver, spx, ndx → 6
    // ALTERNATIVE: btc, eth → 2
    // DERIVED: total2 → 1
    expect(dto.quality.exactInputCount).toBe(5);
    expect(dto.quality.proxyInputCount).toBe(6);
    expect(dto.quality.alternativeInputCount).toBe(2);
    expect(dto.quality.derivedInputCount).toBe(1);
    expect(dto.quality.missingInputCount).toBe(0);
    expect(dto.quality.sources.length).toBe(14);
  });

  it('TOTAL2 is DERIVED with the required tooltip', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    const total2 = dto.quality.sources.find((s) => s.key === 'total2')!;
    expect(total2.classification).toBe('DERIVED');
    expect(total2.note).toBe(TOTAL2_DERIVED_NOTE);
    expect(total2.note).toContain('Derived from CoinGecko');
    expect(total2.note).toContain('TradingView CRYPTOCAP:TOTAL2');
    expect(total2.note).not.toMatch(/exact/i);
  });

  it('non-derived sources carry no derivation note', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    const vix = dto.quality.sources.find((s) => s.key === 'vix')!;
    expect(vix.note).toBeUndefined();
  });

  it('coverage percent excludes missing packs', () => {
    const packs = fullPacks();
    packs[0].missing = true; // dxy missing
    packs[1].stale = true;   // copper stale
    const dto = mapLiquidityTransmissionToPageDto(baseResolved({} as never) as never);
    // With no injection this test uses the fully-present fixture; construct a
    // custom resolved to check missing/stale bookkeeping.
    const resolved = baseResolved({ packs } as never) as LiquidityTransmissionResolved;
    resolved.packs = packs;
    const dto2 = mapLiquidityTransmissionToPageDto(resolved);
    expect(dto2.quality.missingInputCount).toBe(1);
    expect(dto2.quality.staleInputCount).toBe(1);
    expect(dto2.quality.coveragePercent).toBeCloseTo((13 / 14) * 100, 1);
    expect(dto).toBeDefined();
  });
});

/* ── Alerts ───────────────────────────────────────────────────────────────── */

describe('mapLiquidityTransmissionToPageDto — alerts', () => {
  it('propagates engine alerts verbatim and counts active flags', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    const a = dto.alerts!;
    expect(a.divergenceWarning).toBe(true);
    expect(a.earlyWarningElevated).toBe(true);
    expect(a.earlyWarningHigh).toBe(true);
    expect(a.broadRiskOn).toBe(false);
    expect(a.broadRiskOff).toBe(false);
    expect(a.cryptoWindowActive).toBe(false);
    expect(a.activeCount).toBe(3);
  });
});

/* ── History delta ────────────────────────────────────────────────────────── */

describe('mapLiquidityTransmissionToPageDto — history', () => {
  it('null delta → HISTORY BUILDING flag', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved());
    expect(dto.history.masterLinkDelta).toBeNull();
    expect(dto.history.historyBuilding).toBe(true);
    expect(dto.history.previousMasterLink).toBeNull();
    expect(dto.history.previousObservedOn).toBeNull();
  });

  it('exposes prior masterLink + Δ when history exists', () => {
    const dto = mapLiquidityTransmissionToPageDto(baseResolved({} as never) as never);
    const resolved = baseResolved();
    resolved.previousMasterLink = { observedOn: '2026-09-02', masterLink: 60 };
    resolved.masterLinkDelta = resolved.result!.masterLink - 60;
    const dto2 = mapLiquidityTransmissionToPageDto(resolved);
    expect(dto2.history.previousObservedOn).toBe('2026-09-02');
    expect(dto2.history.previousMasterLink).toBe(60);
    expect(dto2.history.masterLinkDelta).toBeCloseTo(55.22 - 60, 2);
    expect(dto2.history.historyBuilding).toBe(false);
    expect(dto).toBeDefined();
  });
});

/* ── Unavailable + stale states ───────────────────────────────────────────── */

describe('mapLiquidityTransmissionToPageDto — unavailable + stale', () => {
  it('DATA_UNAVAILABLE → not available, no headline, statusLabel is DATA TEMPORARILY UNAVAILABLE', () => {
    const dto = mapLiquidityTransmissionToPageDto({
      status: 'DATA_UNAVAILABLE',
      environmentLabel: 'UNAVAILABLE',
      calculatedAt: '2026-09-07T00:00:00Z',
      result: null,
      packs: [],
      m2Meta: {
        status: 'UNAVAILABLE', interpretationEligible: false, parityStatus: 'DATA_PARITY_PENDING',
        validBlocCount: 0, missingBlocs: [], stale: false, providersUsed: [],
        calculatedAt: '2026-09-07T00:00:00Z',
      },
      previousMasterLink: null, masterLinkDelta: null,
      providersUsed: [], missingKeys: [], errors: [], reason: 'live-data-disabled',
    });
    expect(dto.available).toBe(false);
    expect(dto.headline).toBeNull();
    expect(dto.alerts).toBeNull();
    expect(dto.stage8Explanation).toBeNull();
    expect(dto.statusLabel).toBe('DATA TEMPORARILY UNAVAILABLE');
    expect(dto.parityStatus).toBe('DATA_PARITY_PENDING');
    // No stale numbers substituted.
    expect(dto.history.masterLinkDelta).toBeNull();
    expect(dto.history.historyBuilding).toBe(true);
    expect(dto.reason).toBe('live-data-disabled');
  });

  it('ENGINE_ERROR maps to DATA TEMPORARILY UNAVAILABLE (no numbers)', () => {
    const dto = mapLiquidityTransmissionToPageDto({
      status: 'ENGINE_ERROR',
      environmentLabel: 'UNAVAILABLE',
      calculatedAt: '2026-09-07T00:00:00Z',
      result: null, packs: fullPacks(),
      m2Meta: {
        status: 'UNAVAILABLE', interpretationEligible: false, parityStatus: 'DATA_PARITY_PENDING',
        validBlocCount: 0, missingBlocs: [], stale: false, providersUsed: [],
        calculatedAt: '2026-09-07T00:00:00Z',
      },
      previousMasterLink: null, masterLinkDelta: null,
      providersUsed: [], missingKeys: [], errors: [], reason: 'engine-error',
    });
    expect(dto.available).toBe(false);
    expect(dto.statusLabel).toBe('DATA TEMPORARILY UNAVAILABLE');
    // packs still enumerate; classifications remain honest.
    expect(dto.quality.sources.length).toBe(14);
  });

  it('carries stale packs through the quality panel without hiding them', () => {
    const packs = fullPacks();
    packs[2].stale = true; // eem stale
    packs[3].missing = true; // vgk missing
    const resolved: LiquidityTransmissionResolved = { ...baseResolved(), packs };
    const dto = mapLiquidityTransmissionToPageDto(resolved);
    const eem = dto.quality.sources.find((s) => s.key === 'eem')!;
    const vgk = dto.quality.sources.find((s) => s.key === 'vgk')!;
    expect(eem.stale).toBe(true);
    expect(vgk.missing).toBe(true);
    expect(dto.quality.staleInputCount).toBe(1);
    expect(dto.quality.missingInputCount).toBe(1);
  });
});
