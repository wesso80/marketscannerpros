// Phase 4D — pure mapper: LiquidityTransmissionResolved → page DTO.
//
// This module is presentation-only. It never recomputes engine math, never
// substitutes zeros for missing inputs, and never emits FULL_PARITY. Its sole
// job is to shape the frozen engine's result into a flat JSON contract the
// /intelligence/liquidity page can consume without importing engine internals.

import type {
  LiquidityTransmissionResolved, LiquidityTransmissionServiceStatus,
} from './liquidityTransmissionService';
import type {
  LiquidityTransmissionResult, TransmissionStageResult,
} from './engines/liquidityTransmission';
import type {
  LiquiditySourceClass, LiquidityProvider,
} from './data/providers/liquidityAssetProviders';

export const M2_INTERPRETATION_THRESHOLD = 95;
export const M2_TOTAL_BLOCS = 11;
export const CROSS_ASSET_TOTAL = 14;
export const PARITY_STATUS: 'DATA_PARITY_PENDING' = 'DATA_PARITY_PENDING';

export const TOTAL2_DERIVED_NOTE =
  'Derived from CoinGecko global crypto market capitalization minus Bitcoin market capitalization. '
  + 'This may differ slightly from TradingView CRYPTOCAP:TOTAL2 due to source composition and timestamp differences.';

export type StageGate = 'PASS' | 'PARTIAL' | 'FAIL' | 'ACTIVE' | 'WATCH' | 'CLEAR' | 'N/A';

export interface LiquidityHeadlineDto {
  masterLink: number;
  validated: number;
  downstream: number;
  riskLiquidityGap: number;
  flow: string;
  clock: string;
  clockStage: number;
  clockName: string;
  clockContext: string;
  liquidityCycle: string;
  lateCycleScore: number;
  lateCycleState: string;
  earlyWarningRisk: number;
  earlyWarningState: string;
  stage8Active: boolean;
  confidence: number;
  confidenceLabel: 'HIGH' | 'MODERATE' | 'LOW';
  dominantRiskOn: boolean;
  divergenceState: string;
  cryptoDelayWindow: string;
  m2BiasScore: number;
}

export interface LiquidityAlertsDto {
  broadRiskOn: boolean;
  broadRiskOff: boolean;
  divergenceWarning: boolean;
  earlyWarningElevated: boolean;
  earlyWarningHigh: boolean;
  cryptoWindowActive: boolean;
  activeCount: number;
}

export interface LiquidityStage8ExplanationDto {
  active: boolean;
  headline: string;
  conditions: {
    label: string;
    triggered: boolean;
    detail: string;
  }[];
  guidance: string;
}

export interface LiquidityStageDto {
  stage: number;
  name: string;
  driver: string;
  grade: string;
  score: number;
  state: string;
  gate: StageGate;
  active: boolean;
  cumulative: number | null;
  role: string;
  next: string;
}

export interface LiquidityM2UpstreamDto {
  status: string;
  parityStatus: string;
  interpretationThreshold: number;
  interpretationEligible: boolean;
  blocsAvailable: number;
  blocsTotal: number;
  blocAvailabilityPercent: number;
  estimatedWeightedCoveragePercent: number | null;
  /** Blocs excluded from the weighted coverage denominator (e.g. IN, KR). */
  coverageExcludedBlocs: string[];
  missingBlocs: string[];
  providersUsed: string[];
  stale: boolean;
}

export interface LiquiditySourceRowDto {
  key: string;
  pineSymbol: string;
  providerSymbol: string;
  provider: LiquidityProvider;
  sourceName: string;
  classification: LiquiditySourceClass;
  reason?: string;
  status: string;
  missing: boolean;
  stale: boolean;
  latestDaily: string | null;
  observationCount: number;
  note?: string;
}

export interface LiquidityQualityDto {
  coveragePercent: number;
  exactInputCount: number;
  alternativeInputCount: number;
  proxyInputCount: number;
  derivedInputCount: number;
  missingInputCount: number;
  staleInputCount: number;
  providersUsed: string[];
  sources: LiquiditySourceRowDto[];
}

export interface LiquidityHistoryDto {
  previousObservedOn: string | null;
  previousMasterLink: number | null;
  masterLinkDelta: number | null;
  historyBuilding: boolean;
}

export interface LiquidityTransmissionPageDto {
  enabled: boolean;
  available: boolean;
  status: LiquidityTransmissionServiceStatus;
  statusLabel: string;
  parityStatus: typeof PARITY_STATUS;
  environmentLabel: string;
  calculatedAt: string;
  reason?: string;
  headline: LiquidityHeadlineDto | null;
  playbook: string | null;
  alerts: LiquidityAlertsDto | null;
  stage8Explanation: LiquidityStage8ExplanationDto | null;
  stages: LiquidityStageDto[];
  m2Upstream: LiquidityM2UpstreamDto;
  quality: LiquidityQualityDto;
  history: LiquidityHistoryDto;
}

/* ── Public entry ─────────────────────────────────────────────────────────── */

export function mapLiquidityTransmissionToPageDto(
  resolved: LiquidityTransmissionResolved,
): LiquidityTransmissionPageDto {
  const available = resolved.result != null && resolved.status !== 'DATA_UNAVAILABLE'
    && resolved.status !== 'ENGINE_ERROR' && resolved.status !== 'CREDENTIAL_REQUIRED';

  const headline = resolved.result ? buildHeadline(resolved.result) : null;
  const alerts = resolved.result ? buildAlerts(resolved.result) : null;
  const stage8Explanation = resolved.result ? buildStage8Explanation(resolved.result) : null;
  const stages = resolved.result ? resolved.result.stages.map(mapStage) : [];
  const quality = buildQuality(resolved);
  const m2Upstream = buildM2Upstream(resolved);
  const history = buildHistory(resolved);

  return {
    enabled: resolved.environmentLabel !== 'UNAVAILABLE'
      || resolved.status === 'PARTIAL' || resolved.status === 'OK',
    available,
    status: resolved.status,
    statusLabel: buildStatusLabel(resolved),
    parityStatus: PARITY_STATUS,
    environmentLabel: resolved.environmentLabel,
    calculatedAt: resolved.calculatedAt,
    reason: resolved.reason,
    headline,
    playbook: resolved.result?.playbook ?? null,
    alerts,
    stage8Explanation,
    stages,
    m2Upstream,
    quality,
    history,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function buildHeadline(r: LiquidityTransmissionResult): LiquidityHeadlineDto {
  return {
    masterLink: round2(r.masterLink),
    validated: round2(r.validated),
    downstream: round2(r.downstream),
    riskLiquidityGap: round2(r.riskLiquidityGap),
    flow: r.flow,
    clock: `${r.clockStage}/8`,
    clockStage: r.clockStage,
    clockName: r.clockName,
    clockContext: r.clockContext,
    liquidityCycle: r.liquidityCycle,
    lateCycleScore: round2(r.lateCycleScore),
    lateCycleState: r.lateCycleState,
    earlyWarningRisk: round2(r.earlyWarningRisk),
    earlyWarningState: r.earlyWarningState,
    stage8Active: r.stage8Active,
    confidence: r.confidence,
    confidenceLabel: r.confidenceLabel,
    dominantRiskOn: r.dominantRiskOn,
    divergenceState: r.divergenceState,
    cryptoDelayWindow: r.cryptoDelayWindow,
    m2BiasScore: round2(r.m2BiasScore),
  };
}

function buildAlerts(r: LiquidityTransmissionResult): LiquidityAlertsDto {
  const a = r.alerts;
  const activeCount = (a.broadRiskOn ? 1 : 0) + (a.broadRiskOff ? 1 : 0)
    + (a.divergenceWarning ? 1 : 0) + (a.earlyWarningElevated ? 1 : 0)
    + (a.earlyWarningHigh ? 1 : 0) + (a.cryptoWindowActive ? 1 : 0);
  return { ...a, activeCount };
}

/**
 * Stage-8 explanation — research language only. Never states or implies an
 * imminent crash. Conditions are derived from the engine's already-computed
 * fields; no new scoring is introduced here.
 */
export function buildStage8Explanation(r: LiquidityTransmissionResult): LiquidityStage8ExplanationDto {
  const downstreamExtended = r.downstream > 70;
  const gapElevated = r.riskLiquidityGap >= 15;
  const m2Slowing = r.liquidityCycle === 'LATE EXPANSION' || r.liquidityCycle === 'DECELERATION';
  const validatedBelowThreshold = r.validated < 62;

  const conditions = [
    { label: 'Downstream extended', triggered: downstreamExtended,
      detail: `Downstream risk-on ${round2(r.downstream)}/100` },
    { label: 'Risk–liquidity gap elevated', triggered: gapElevated,
      detail: `Gap ${r.riskLiquidityGap >= 0 ? '+' : ''}${round2(r.riskLiquidityGap)}` },
    { label: 'M2 cycle slowing', triggered: m2Slowing,
      detail: `Liquidity cycle: ${r.liquidityCycle}` },
    { label: 'Validated liquidity below threshold', triggered: validatedBelowThreshold,
      detail: `Validated ${round2(r.validated)}/100 (threshold 62)` },
  ];

  const headline = r.stage8Active
    ? 'Downstream risk assets are running materially ahead of validated liquidity support.'
    : 'Downstream and validated liquidity remain in balance.';
  const guidance = r.stage8Active
    ? 'Late-cycle/divergence risk elevated. Research signal only; watch for reset or new cycle.'
    : 'No late-cycle divergence signal at this time.';

  return { active: r.stage8Active, headline, conditions, guidance };
}

function mapStage(s: TransmissionStageResult): LiquidityStageDto {
  return {
    stage: s.stage,
    name: s.name,
    driver: s.driver,
    grade: s.grade,
    score: round2(s.score),
    state: s.state,
    gate: stateToGate(s.stage, s.state),
    active: s.active,
    cumulative: s.cumulative == null ? null : round2(s.cumulative),
    role: s.role,
    next: s.next,
  };
}

/**
 * Map a stage state label to a research-grade gate summary. Stage-8 uses the
 * warningState vocabulary; stages 1..7 use the transmission state vocabulary.
 */
export function stateToGate(stage: number, state: string): StageGate {
  if (stage === 8) {
    if (state === 'WARNING') return 'ACTIVE';
    if (state === 'ELEVATED') return 'WATCH';
    if (state === 'WATCH') return 'WATCH';
    if (state === 'CLEAR') return 'CLEAR';
    return 'N/A';
  }
  if (state === 'CONFIRMED') return 'PASS';
  if (state === 'SUPPORTIVE') return 'PARTIAL';
  if (state === 'MIXED') return 'PARTIAL';
  if (state === 'WEAKENING') return 'FAIL';
  if (state === 'OPPOSING') return 'FAIL';
  return 'N/A';
}

function buildM2Upstream(resolved: LiquidityTransmissionResolved): LiquidityM2UpstreamDto {
  const m = resolved.m2Meta;
  const blocsAvailable = m.validBlocCount;
  const blocsTotal = M2_TOTAL_BLOCS;
  const blocAvailabilityPercent = blocsTotal > 0 ? (blocsAvailable / blocsTotal) * 100 : 0;
  const weighted = m.estimatedWeightedCoveragePercent;
  const interpretationEligible = m.interpretationEligible === true;
  return {
    status: m.status ?? 'UNKNOWN',
    parityStatus: m.parityStatus ?? PARITY_STATUS,
    interpretationThreshold: M2_INTERPRETATION_THRESHOLD,
    interpretationEligible,
    blocsAvailable,
    blocsTotal,
    blocAvailabilityPercent: round2(blocAvailabilityPercent),
    estimatedWeightedCoveragePercent: weighted == null ? null : round2(weighted),
    coverageExcludedBlocs: m.coverageExcludedBlocIds ?? [],
    missingBlocs: m.missingBlocs ?? [],
    providersUsed: m.providersUsed ?? [],
    stale: m.stale ?? false,
  };
}

function buildQuality(resolved: LiquidityTransmissionResolved): LiquidityQualityDto {
  const packs = resolved.packs;
  let exactInputCount = 0, alternativeInputCount = 0, proxyInputCount = 0, derivedInputCount = 0;
  let missingInputCount = 0, staleInputCount = 0;
  const sources: LiquiditySourceRowDto[] = [];
  for (const p of packs) {
    if (p.missing) missingInputCount++;
    if (p.stale) staleInputCount++;
    if (!p.missing) {
      if (p.classification === 'EXACT') exactInputCount++;
      else if (p.classification === 'ALTERNATIVE') alternativeInputCount++;
      else if (p.classification === 'PROXY') proxyInputCount++;
      else if (p.classification === 'DERIVED') derivedInputCount++;
    }
    sources.push({
      key: p.key,
      pineSymbol: p.pineSymbol,
      providerSymbol: p.providerSymbol,
      provider: p.provider,
      sourceName: p.sourceName,
      classification: p.classification,
      reason: p.reason,
      status: p.status,
      missing: p.missing,
      stale: p.stale,
      latestDaily: p.latestDaily,
      observationCount: p.observationCount,
      note: p.classification === 'DERIVED' ? TOTAL2_DERIVED_NOTE : undefined,
    });
  }
  const present = packs.length - missingInputCount;
  const coveragePercent = packs.length > 0 ? (present / packs.length) * 100 : 0;
  return {
    coveragePercent: round2(coveragePercent),
    exactInputCount, alternativeInputCount, proxyInputCount, derivedInputCount,
    missingInputCount, staleInputCount,
    providersUsed: resolved.providersUsed,
    sources,
  };
}

function buildHistory(resolved: LiquidityTransmissionResolved): LiquidityHistoryDto {
  return {
    previousObservedOn: resolved.previousMasterLink?.observedOn ?? null,
    previousMasterLink: resolved.previousMasterLink
      ? round2(resolved.previousMasterLink.masterLink) : null,
    masterLinkDelta: resolved.masterLinkDelta == null ? null : round2(resolved.masterLinkDelta),
    historyBuilding: resolved.masterLinkDelta == null,
  };
}

function buildStatusLabel(resolved: LiquidityTransmissionResolved): string {
  if (resolved.status === 'DATA_UNAVAILABLE') return 'DATA TEMPORARILY UNAVAILABLE';
  if (resolved.status === 'CREDENTIAL_REQUIRED') return 'CREDENTIAL REQUIRED';
  if (resolved.status === 'ENGINE_ERROR') return 'DATA TEMPORARILY UNAVAILABLE';
  const upstream = resolved.m2Meta.interpretationEligible === true
    ? 'LIVE' : 'LIVE · PARTIAL UPSTREAM';
  return upstream;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
