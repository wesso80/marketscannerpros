// Phase 4E — integration tests for the native Liquidity → Master input wiring.
// Verifies §13 A..N of the Phase 4E brief:
//   A. native masterLink reaches the Master raw Liquidity field
//   B. validatedRiskOn is NOT used accidentally
//   C. downstreamRiskOn is NOT used accidentally
//   D. full precision preserved (no rounding of orientation before Master)
//   E. quality metadata propagated via components[]
//   F. DATA_PARITY_PENDING propagated
//   G. partial upstream M2 propagated
//   H. missing Liquidity handled safely (UNAVAILABLE + neutral orientation)
//   I. stale Liquidity labelled explicitly
//   J. no fallback to mock in the native path
//   K. Master formulas unchanged (parity fixtures already assert this)
//   L. deterministic integration fixture
//   M. source timestamps exposed
//   N. existing Master orientation still correct for the swapped input

import { describe, it, expect } from 'vitest';
import {
  applyNativeLiquidityToMasterInputs,
  isStale,
} from '@/lib/intelligence/masterLiquidityIntegration';
import { computeMaster, type MasterEngineInput } from '@/lib/intelligence/engines/master';
import type { LiquidityTransmissionResolved } from '@/lib/intelligence/liquidityTransmissionService';
import type {
  LiquidityTransmissionResult,
} from '@/lib/intelligence/engines/liquidityTransmission';
import type { AssetPackMetadata } from '@/lib/intelligence/data/liquidityTransmissionInputBuilder';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

function baseInputs(): MasterEngineInput[] {
  return [
    { key: 'macro', label: 'Macro / Transmission', raw: 72.44, orientation: 72.44, weight: 25, bucket: 'context', role: '', gateRequired: 58, status: 'MOCK' },
    { key: 'fragility', label: 'Market Structure', raw: 50.89, orientation: 75.445, weight: 15, bucket: 'context', role: '', gateRequired: 58, status: 'MOCK' },
    { key: 'lead-lag', label: 'Cross-Asset Lead/Lag', raw: 0, orientation: 50, weight: 15, bucket: 'context', role: '', gateRequired: 55, status: 'MOCK' },
    { key: 'nq-pressure', label: 'NQ Pressure', raw: 3.85, orientation: 51.925, weight: 20, bucket: 'execution', role: '', gateRequired: 60, status: 'MOCK' },
    { key: 'auction', label: 'NQ Auction', raw: -26.38, orientation: 36.81, weight: 25, bucket: 'execution', role: '', gateRequired: 62, status: 'MOCK' },
  ];
}

function pack(
  key: AssetPackMetadata['key'],
  classification: AssetPackMetadata['classification'],
  over: Partial<AssetPackMetadata> = {},
): AssetPackMetadata {
  return {
    key,
    pineSymbol: `PINE:${key.toUpperCase()}`,
    provider: 'alpha-vantage',
    providerSymbol: key.toUpperCase(),
    sourceName: `${key} source`,
    classification,
    latestDaily: '2026-09-05',
    latestMonthly: '2026-08',
    observationCount: 250,
    monthlyObservationCount: 12,
    m1: 1, r20: 2, r5: 3,
    stale: false,
    missing: false,
    status: 'OK',
    ...over,
  };
}

function fullPacks(): AssetPackMetadata[] {
  return [
    pack('dxy', 'PROXY'),
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
    pack('total2', 'DERIVED', { provider: 'derived' }),
  ];
}

function makeResult(over: Partial<LiquidityTransmissionResult> = {}): LiquidityTransmissionResult {
  return {
    calculatedAt: '2026-09-07T00:00:00Z',
    flow: 'TRANSITION',
    masterLink: 55.220599,
    transmissionRiskOn: 55.220599,
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
    stages: [],
    playbook: 'TRANSITION · LATE-CYCLE / DIVERGENCE.',
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

function makeResolved(over: Partial<LiquidityTransmissionResolved> = {}): LiquidityTransmissionResolved {
  return {
    status: 'PARTIAL',
    environmentLabel: 'LOCAL LIVE',
    calculatedAt: '2026-09-07T00:00:00Z',
    result: makeResult(),
    packs: fullPacks(),
    m2Meta: {
      status: 'LIVE/PARTIAL UPSTREAM', coveragePercent: 82,
      estimatedWeightedCoveragePercent: 94.4, interpretationEligible: false,
      parityStatus: 'DATA_PARITY_PENDING', validBlocCount: 9,
      missingBlocs: ['india', 'south-korea'], stale: false,
      providersUsed: ['fred', 'ecb'], calculatedAt: '2026-09-07T00:00:00Z',
    },
    previousMasterLink: null,
    masterLinkDelta: null,
    providersUsed: ['alpha-vantage', 'fred', 'coingecko', 'derived'],
    missingKeys: [],
    errors: [],
    ...over,
  };
}

/* ── A/B/C/D — the native masterLink reaches the raw macro slot ───────────── */

describe('applyNativeLiquidityToMasterInputs — swap contract', () => {
  it('feeds the native masterLink into the macro raw + orientation, at full precision', () => {
    const inputs = baseInputs();
    const resolved = makeResolved();
    const out = applyNativeLiquidityToMasterInputs(inputs, resolved);
    const macro = out.inputs.find((i) => i.key === 'macro')!;
    expect(macro.raw).toBe(55.220599);
    expect(macro.orientation).toBe(55.220599);
    // Full precision: no rounding at the mapper layer.
    expect(macro.orientation).toBe(resolved.result!.masterLink);
    expect(macro.status).toBe('LIVE');
    expect(out.applied).toBe(true);
    expect(out.masterLink).toBe(55.220599);
    expect(out.parityStatus).toBe('DATA_PARITY_PENDING');
  });

  it('does NOT accidentally use validatedRiskOn or downstreamRiskOn', () => {
    const resolved = makeResolved();
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), resolved);
    const macro = out.inputs.find((i) => i.key === 'macro')!;
    expect(macro.orientation).not.toBe(resolved.result!.validated);   // 58.03
    expect(macro.orientation).not.toBe(resolved.result!.downstream);  // 72.5
    expect(macro.raw).not.toBe(resolved.result!.validated);
    expect(macro.raw).not.toBe(resolved.result!.downstream);
  });

  it('leaves every non-macro input untouched', () => {
    const inputs = baseInputs();
    const out = applyNativeLiquidityToMasterInputs(inputs, makeResolved());
    for (const key of ['fragility', 'lead-lag', 'nq-pressure', 'auction'] as const) {
      const before = inputs.find((i) => i.key === key)!;
      const after = out.inputs.find((i) => i.key === key)!;
      expect(after).toEqual(before);
    }
  });

  it('is deterministic — identical fixture yields identical output', () => {
    const a = applyNativeLiquidityToMasterInputs(baseInputs(), makeResolved());
    const b = applyNativeLiquidityToMasterInputs(baseInputs(), makeResolved());
    expect(a.inputs).toEqual(b.inputs);
    expect(a.macroComponents).toEqual(b.macroComponents);
    expect(a.source).toEqual(b.source);
  });
});

/* ── E/F/G — quality metadata propagated ─────────────────────────────────── */

describe('applyNativeLiquidityToMasterInputs — component metadata', () => {
  it('propagates parity status, upstream M2 partial, and provider counts', () => {
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), makeResolved());
    const components = out.macroComponents!;
    const byLabel = new Map(components.map((c) => [c.label, c]));
    // DATA_PARITY_PENDING everywhere.
    expect(byLabel.get('Parity')!.value).toBe('DATA_PARITY_PENDING');
    // LIVE · PARTIAL UPSTREAM because interpretationEligible=false.
    expect(byLabel.get('Upstream M2')!.value).toBe('LIVE · PARTIAL UPSTREAM');
    expect(byLabel.get('Upstream M2')!.detail).toContain('9/11');
    expect(byLabel.get('Upstream M2')!.detail).toContain('94.4%');
    // Native source marker.
    expect(byLabel.get('Source')!.value).toBe('NATIVE');
    // Input classification counts (EXACT/ALTERNATIVE/PROXY/DERIVED from packs).
    expect(byLabel.get('Inputs (Exact/Alt/Proxy/Derived)')!.value).toBe('5 / 2 / 6 / 1');
    // Providers.
    expect(String(byLabel.get('Providers')!.value)).toContain('alpha-vantage');
  });

  it('promotes Upstream M2 to plain LIVE when interpretationEligible', () => {
    const resolved = makeResolved();
    resolved.m2Meta.interpretationEligible = true;
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), resolved);
    const byLabel = new Map(out.macroComponents!.map((c) => [c.label, c]));
    expect(byLabel.get('Upstream M2')!.value).toBe('LIVE');
    expect(out.source).toBe('native-live');
  });

  it('exposes upstream calculatedAt for snapshot alignment', () => {
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), makeResolved());
    expect(out.calculatedAt).toBe('2026-09-07T00:00:00Z');
    const src = out.macroComponents!.find((c) => c.label === 'Source')!;
    expect(src.detail).toContain('2026-09-07T00:00:00Z');
  });
});

/* ── H — missing / unavailable liquidity ─────────────────────────────────── */

describe('applyNativeLiquidityToMasterInputs — unavailable', () => {
  it('DATA_UNAVAILABLE → status=UNAVAILABLE, orientation=50 neutral, applied=false', () => {
    const resolved: LiquidityTransmissionResolved = {
      status: 'DATA_UNAVAILABLE',
      environmentLabel: 'UNAVAILABLE',
      calculatedAt: '2026-09-07T00:00:00Z',
      result: null, packs: [],
      m2Meta: {
        status: 'UNAVAILABLE', interpretationEligible: false, parityStatus: 'DATA_PARITY_PENDING',
        validBlocCount: 0, missingBlocs: [], stale: false, providersUsed: [],
        calculatedAt: '2026-09-07T00:00:00Z',
      },
      previousMasterLink: null, masterLinkDelta: null,
      providersUsed: [], missingKeys: [], errors: [], reason: 'live-data-disabled',
    };
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), resolved);
    const macro = out.inputs.find((i) => i.key === 'macro')!;
    expect(macro.orientation).toBe(50);
    expect(macro.raw).toBe(0);
    expect(macro.status).toBe('UNAVAILABLE');
    expect(out.applied).toBe(false);
    expect(out.source).toBe('native-unavailable');
    expect(out.masterLink).toBeNull();
    expect(out.reason).toBe('live-data-disabled');
    // No fabricated live score.
    const components = out.macroComponents!;
    const src = components.find((c) => c.label === 'Source')!;
    expect(src.value).toBe('NATIVE (UNAVAILABLE)');
    expect(components.find((c) => c.label === 'Master Link')!.value).toBe('—');
  });

  it('ENGINE_ERROR also maps to UNAVAILABLE (no numbers)', () => {
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), {
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
    expect(out.applied).toBe(false);
    expect(out.source).toBe('native-unavailable');
    expect(out.status).toBe('UNAVAILABLE');
  });
});

/* ── I — stale liquidity labelled explicitly ─────────────────────────────── */

describe('applyNativeLiquidityToMasterInputs — stale', () => {
  it('flags STALE when any pack is stale', () => {
    const resolved = makeResolved();
    resolved.packs[2].stale = true; // eem stale
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), resolved);
    const macro = out.inputs.find((i) => i.key === 'macro')!;
    expect(macro.status).toBe('STALE');
    expect(out.source).toBe('native-stale');
    expect(out.applied).toBe(true);
    // The native score is still used — this is not a re-fabrication.
    expect(macro.orientation).toBe(resolved.result!.masterLink);
  });

  it('flags STALE when M2 is stale', () => {
    const resolved = makeResolved();
    resolved.m2Meta.stale = true;
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), resolved);
    expect(out.status).toBe('STALE');
    expect(isStale(resolved)).toBe(true);
  });

  it('LIVE when nothing is stale', () => {
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), makeResolved());
    expect(out.status).toBe('LIVE');
    expect(isStale(makeResolved())).toBe(false);
  });
});

/* ── J — no fallback to mock in the native path ──────────────────────────── */

describe('applyNativeLiquidityToMasterInputs — no mock fallback', () => {
  it('unavailable never restores mock numbers on the macro slot', () => {
    const inputs = baseInputs();
    const mockOrientation = inputs.find((i) => i.key === 'macro')!.orientation;
    expect(mockOrientation).toBe(72.44);
    const out = applyNativeLiquidityToMasterInputs(inputs, {
      status: 'DATA_UNAVAILABLE',
      environmentLabel: 'UNAVAILABLE',
      calculatedAt: '2026-09-07T00:00:00Z',
      result: null, packs: [], m2Meta: {
        status: 'UNAVAILABLE', interpretationEligible: false, parityStatus: 'DATA_PARITY_PENDING',
        validBlocCount: 0, missingBlocs: [], stale: false, providersUsed: [],
        calculatedAt: '2026-09-07T00:00:00Z',
      },
      previousMasterLink: null, masterLinkDelta: null,
      providersUsed: [], missingKeys: [], errors: [],
    });
    const macro = out.inputs.find((i) => i.key === 'macro')!;
    expect(macro.orientation).not.toBe(mockOrientation);
    expect(macro.orientation).toBe(50);
  });
});

/* ── K/N — Master formulas + orientation semantics preserved ─────────────── */

describe('applyNativeLiquidityToMasterInputs — Master formulas unchanged', () => {
  it('computeMaster consumes the swapped input and yields deterministic aggregate', () => {
    const resolved = makeResolved();
    const out = applyNativeLiquidityToMasterInputs(baseInputs(), resolved);
    const master = computeMaster(out.inputs, undefined, '2026-09-07T00:00:00Z');
    // Master formula uses orientation; verify the composite reflects the
    // native macro value (25% weight of 55.220599 dominates the context block).
    const macroRow = master.engines.find((e) => e.engine === 'macro')!;
    expect(macroRow.orientation).toBeCloseTo(55.22, 2);
    expect(macroRow.rawValue).toBeCloseTo(55.220599, 6);
    expect(macroRow.status).toBe('LIVE');
    expect(master.composite).toBeGreaterThan(0);
    expect(master.composite).toBeLessThanOrEqual(100);
    // Bias ladder still active (>=45 & <55 for the composite ⇒ NEUTRAL band possible).
    expect(['LONG', 'LEAN LONG', 'NEUTRAL', 'LEAN SHORT', 'SHORT']).toContain(master.bias);
  });

  it('changing macro from mock 72.44 to native 55.22 shifts context, not the formula', () => {
    const withMock = computeMaster(baseInputs(), undefined, '2026-09-07T00:00:00Z');
    const withNative = computeMaster(
      applyNativeLiquidityToMasterInputs(baseInputs(), makeResolved()).inputs,
      undefined,
      '2026-09-07T00:00:00Z',
    );
    // Context is a weighted mean including macro — must shift because macro
    // dropped from 72.44 to 55.22 but every other input is unchanged.
    expect(withNative.context).not.toBe(withMock.context);
    // Execution block does not include macro → identical.
    expect(withNative.execution).toBe(withMock.execution);
  });
});
