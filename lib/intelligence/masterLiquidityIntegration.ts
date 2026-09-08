// Phase 4E — pure input mapper that wires the native Liquidity Transmission
// resolved result into the Master v1.2 fusion contract.
//
// This module is orchestration-only. It never changes Master formulas, never
// changes Liquidity engine formulas, and never rescales the score. Its sole
// job is to swap the `macro` slot in `MasterEngineInput[]` from mock to the
// native `masterLink` (== transmissionRiskOn), and to propagate honest
// source-quality metadata to the Master UI via `components[]`.
//
// Failure semantics (Phase 4E §7):
//   - OK / PARTIAL with a result → LIVE (or STALE if any pack/M2 is stale).
//   - DATA_UNAVAILABLE / ENGINE_ERROR / CREDENTIAL_REQUIRED / result==null →
//     status = 'UNAVAILABLE', orientation = 50 (neutral), full diagnostic in
//     components. We never substitute an old mock, an old TradingView number,
//     or a fabricated live score. Master computes with an honest neutral so
//     the aggregate result is degraded but not deceptive.

import type { MasterEngineInput } from './engines/master';
import type { EngineResult, EngineStatusFlag, SemanticState } from './types';
import type { LiquidityTransmissionResolved } from './liquidityTransmissionService';

/** Source label appended to the Master API response when native Liquidity replaces mock. */
export type MasterLiquiditySource =
  | 'native-live'
  | 'native-stale'
  | 'native-partial-upstream'
  | 'native-unavailable';

export interface MasterLiquidityIntegration {
  /** Full input array with `macro` swapped for native (or preserved on failure). */
  inputs: MasterEngineInput[];
  /** Components attached to the macro engine row after computeMaster runs. */
  macroComponents: EngineResult['components'];
  /** Coarse source label for the aggregate API response. */
  source: MasterLiquiditySource;
  /** Status flag written into the macro input / engine row. */
  status: EngineStatusFlag;
  /** True when the native masterLink number actually replaced the input orientation. */
  applied: boolean;
  /** Freeform reason string surfaced when unavailable. */
  reason?: string;
  /** Full-precision native masterLink used (null when unavailable). */
  masterLink: number | null;
  /** Upstream calculatedAt / observedAt from the resolved service. */
  calculatedAt: string;
  /** Raw parity marker; always DATA_PARITY_PENDING per Phase 4C/4D. */
  parityStatus: 'DATA_PARITY_PENDING';
}

/**
 * Swap the `macro` (Liquidity/Transmission) slot in the Master input array with
 * the validated native masterLink. Preserves full precision. Never rescales.
 * Never changes any other input slot.
 */
export function applyNativeLiquidityToMasterInputs(
  inputs: MasterEngineInput[],
  resolved: LiquidityTransmissionResolved,
): MasterLiquidityIntegration {
  const canUse =
    resolved.result != null &&
    (resolved.status === 'OK' || resolved.status === 'PARTIAL');

  const parityStatus = 'DATA_PARITY_PENDING' as const;

  if (!canUse) {
    return {
      inputs: inputs.map((i) =>
        i.key === 'macro'
          ? { ...i, raw: 0, orientation: 50, status: 'UNAVAILABLE', confidence: undefined }
          : i,
      ),
      macroComponents: buildUnavailableComponents(resolved),
      source: 'native-unavailable',
      status: 'UNAVAILABLE',
      applied: false,
      reason: resolved.reason ?? resolved.status,
      masterLink: null,
      calculatedAt: resolved.calculatedAt,
      parityStatus,
    };
  }

  const result = resolved.result!;
  const stale = isStale(resolved);
  const upstreamEligible = resolved.m2Meta.interpretationEligible === true;
  const engineStatus: EngineStatusFlag = stale ? 'STALE' : 'LIVE';
  const source: MasterLiquiditySource = stale
    ? 'native-stale'
    : upstreamEligible
    ? 'native-live'
    : 'native-partial-upstream';

  const nextInputs = inputs.map((i) =>
    i.key === 'macro'
      ? {
          ...i,
          // §2 + §12: raw and orientation both take the FULL-PRECISION
          // transmissionRiskOn. No rounding here — computeMaster rounds only
          // for display. Do NOT feed validatedRiskOn or downstreamRiskOn.
          raw: result.masterLink,
          orientation: result.masterLink,
          status: engineStatus,
          confidence: result.confidence / 100,
        }
      : i,
  );

  return {
    inputs: nextInputs,
    macroComponents: buildLiveComponents(resolved),
    source,
    status: engineStatus,
    applied: true,
    masterLink: result.masterLink,
    calculatedAt: resolved.calculatedAt,
    parityStatus,
  };
}

/** True when any pack or the upstream M2 is stale. Used to label the macro row STALE. */
export function isStale(resolved: LiquidityTransmissionResolved): boolean {
  if (resolved.m2Meta.stale === true) return true;
  if (resolved.packs.some((p) => p.stale === true)) return true;
  return false;
}

/* ── Component builders — surface source-quality metadata in the Master row ── */

function buildLiveComponents(resolved: LiquidityTransmissionResolved): EngineResult['components'] {
  const result = resolved.result!;
  const m = resolved.m2Meta;
  const upstream = m.interpretationEligible === true
    ? 'LIVE'
    : 'LIVE · PARTIAL UPSTREAM';

  const packs = resolved.packs;
  const exactCount = packs.filter((p) => !p.missing && p.classification === 'EXACT').length;
  const altCount = packs.filter((p) => !p.missing && p.classification === 'ALTERNATIVE').length;
  const proxyCount = packs.filter((p) => !p.missing && p.classification === 'PROXY').length;
  const derivedCount = packs.filter((p) => !p.missing && p.classification === 'DERIVED').length;
  const missingCount = packs.filter((p) => p.missing).length;
  const staleCount = packs.filter((p) => p.stale).length;

  const components: NonNullable<EngineResult['components']> = [
    {
      label: 'Source',
      value: 'NATIVE',
      state: 'positive',
      detail: `LiquidityTransmissionResolved.result.masterLink @ ${resolved.calculatedAt}`,
    },
    {
      label: 'Master Link',
      value: round2(result.masterLink),
      state: orientToSemantic(result.masterLink),
      detail: 'transmissionRiskOn — 0.35·m2Bias + 0.65·validated',
    },
    {
      label: 'Validated',
      value: round2(result.validated),
      state: orientToSemantic(result.validated),
    },
    {
      label: 'Downstream',
      value: round2(result.downstream),
      state: orientToSemantic(result.downstream),
    },
    {
      label: 'Risk–Liquidity Gap',
      value: `${result.riskLiquidityGap >= 0 ? '+' : ''}${round2(result.riskLiquidityGap)}`,
      state: Math.abs(result.riskLiquidityGap) >= 15 ? 'warning' : 'neutral',
    },
    {
      label: 'Cycle',
      value: result.liquidityCycle,
      state: 'neutral',
    },
    {
      label: 'Late-cycle',
      value: `${round2(result.lateCycleScore)} ${result.lateCycleState}`,
      state: riskToSemantic(result.lateCycleScore),
      detail: result.stage8Active ? 'Stage 8 ACTIVE' : undefined,
    },
    {
      label: 'Parity',
      value: 'DATA_PARITY_PENDING',
      state: 'warning',
      detail: 'Source deltas vs. TradingView (proxies, alternatives, derived)',
    },
    {
      label: 'Upstream M2',
      value: upstream,
      state: m.interpretationEligible ? 'positive' : 'warning',
      detail: `${m.validBlocCount}/11 blocs · est. weighted ${
        m.estimatedWeightedCoveragePercent != null
          ? `${m.estimatedWeightedCoveragePercent.toFixed(1)}%`
          : '—'
      }`,
    },
    {
      label: 'Confidence',
      value: `${result.confidence} ${result.confidenceLabel}`,
      state:
        result.confidenceLabel === 'HIGH'
          ? 'strong-positive'
          : result.confidenceLabel === 'MODERATE'
          ? 'positive'
          : 'warning',
    },
    {
      label: 'Inputs (Exact/Alt/Proxy/Derived)',
      value: `${exactCount} / ${altCount} / ${proxyCount} / ${derivedCount}`,
      state: 'neutral',
      detail: `${missingCount} missing · ${staleCount} stale`,
    },
    {
      label: 'Providers',
      value: resolved.providersUsed.length > 0 ? resolved.providersUsed.join(' · ') : '—',
      state: 'neutral',
    },
  ];
  return components;
}

function buildUnavailableComponents(resolved: LiquidityTransmissionResolved): EngineResult['components'] {
  return [
    {
      label: 'Source',
      value: 'NATIVE (UNAVAILABLE)',
      state: 'negative',
      detail: resolved.reason ?? resolved.status,
    },
    {
      label: 'Master Link',
      value: '—',
      state: 'negative',
      detail: 'Native Liquidity Transmission could not produce a result. Orientation forced to neutral 50; no stale substitution.',
    },
    {
      label: 'Parity',
      value: 'DATA_PARITY_PENDING',
      state: 'warning',
    },
    {
      label: 'Upstream M2',
      value: resolved.m2Meta.status ?? 'UNAVAILABLE',
      state: 'negative',
    },
  ];
}

/* ── Semantic helpers (local — duplicated intentionally to keep the file pure) ─ */

function orientToSemantic(score: number): SemanticState {
  if (score >= 68) return 'strong-positive';
  if (score >= 56) return 'positive';
  if (score > 44) return 'neutral';
  if (score > 32) return 'warning';
  return 'negative';
}

function riskToSemantic(score: number): SemanticState {
  if (score < 30) return 'strong-positive';
  if (score < 50) return 'neutral';
  if (score < 70) return 'warning';
  return 'critical';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
