// Assembles LiquidityTransmissionInput from provider results + upstream Global
// M2. This module is the ONLY place that translates provider outputs into the
// pure engine's input contract. No provider logic and no formula logic lives
// here — only shape/quality mapping.

import type {
  LiquidityTransmissionInput, LiquidityM2Input, AssetPack,
} from '../engines/liquidityTransmission';
import type { GlobalM2Result } from '../engines/globalM2';
import { buildConfirmedAssetPack, type ConfirmedAssetPack } from './liquidityConfirmedBars';
import {
  LIQUIDITY_PROVIDER_MAP, type LiquidityAssetKey, type LiquidityAssetSeriesLoad,
  type LiquidityProvider, type LiquiditySourceClass,
} from './providers/liquidityAssetProviders';

const KEYS = Object.keys(LIQUIDITY_PROVIDER_MAP) as LiquidityAssetKey[];

export interface AssetPackMetadata {
  key: LiquidityAssetKey;
  pineSymbol: string;
  provider: LiquidityProvider;
  providerSymbol: string;
  sourceName: string;
  classification: LiquiditySourceClass;
  reason?: string;
  latestDaily: string | null;
  latestMonthly: string | null;
  observationCount: number;
  monthlyObservationCount: number;
  m1: number | null;
  r20: number | null;
  r5: number | null;
  stale: boolean;
  missing: boolean;
  error?: string;
  status: string;
}

export interface BuiltLiquidityInput {
  input: LiquidityTransmissionInput;
  packs: AssetPackMetadata[];
  m2Meta: {
    status: string;
    coveragePercent?: number;
    estimatedWeightedCoveragePercent?: number;
    interpretationEligible: boolean;
    parityStatus: string;
    validBlocCount: number;
    missingBlocs: string[];
    stale: boolean;
    providersUsed: string[];
    calculatedAt: string;
  };
}

/**
 * Map a Global M2 engine result to LiquidityM2Input. Prev-period fields (Pine
 * needs threeMonthAnnPctPrev / oneMonthPctPrev for cycle branches) are derived
 * from the accel fields the engine already emits: prev = current − accel.
 */
export function mapGlobalM2ToInput(
  m2: GlobalM2Result | null,
  meta: { status: string; interpretationEligible: boolean; stale?: boolean; providersUsed?: string[] },
): LiquidityM2Input {
  if (!m2) {
    return {
      globalM2USD: null, oneMonthPct: null, oneMonthPctPrev: null,
      threeMonthAnnPct: null, threeMonthAnnPctPrev: null, yoyPct: null,
      validBlocCount: 0, missingBlocs: [],
      status: meta.status, coveragePercent: undefined,
      stale: meta.stale ?? false, interpretationEligible: meta.interpretationEligible,
      providersUsed: meta.providersUsed ?? [],
    };
  }
  const oneMonthPctPrev = m2.oneMonthPct != null && m2.accel1M != null
    ? m2.oneMonthPct - m2.accel1M : null;
  const threeMonthAnnPctPrev = m2.threeMonthAnnualizedPct != null && m2.accel3M != null
    ? m2.threeMonthAnnualizedPct - m2.accel3M : null;
  const missingBlocs = m2.blocs
    .filter((b) => b.stale === true)
    .map((b) => b.id);
  return {
    globalM2USD: m2.totalUsd,
    oneMonthPct: m2.oneMonthPct,
    oneMonthPctPrev,
    threeMonthAnnPct: m2.threeMonthAnnualizedPct,
    threeMonthAnnPctPrev,
    yoyPct: m2.yoyPct,
    validBlocCount: m2.validBlocCount,
    missingBlocs,
    status: meta.status,
    coveragePercent: m2.quality.coveragePercent,
    stale: meta.stale ?? (m2.quality.staleBlocCount > 0),
    interpretationEligible: meta.interpretationEligible,
    providersUsed: meta.providersUsed ?? [],
  };
}

/**
 * Build the full engine input from provider-loaded series + upstream M2.
 * `nowIso` fixes the forming-day cutoff so all 14 assets share the same
 * confirmed-bar boundary. Missing series produce a null AssetPack, which the
 * engine treats as Pine `na` (neutral 50); the metadata records missing/stale.
 */
export function buildLiquidityTransmissionInput(
  load: LiquidityAssetSeriesLoad,
  m2Input: LiquidityM2Input,
  nowIso: string = new Date().toISOString(),
): BuiltLiquidityInput {
  const packs: AssetPackMetadata[] = [];
  const assetPacks: Partial<Record<LiquidityAssetKey, AssetPack>> = {};

  for (const key of KEYS) {
    const map = LIQUIDITY_PROVIDER_MAP[key];
    const res = load.series[key];
    const bars = res?.bars ?? null;
    const confirmed: ConfirmedAssetPack = buildConfirmedAssetPack(bars, nowIso);
    const missing = !res || res.status !== 'OK' || !bars || bars.length === 0
      || (confirmed.m1 === null && confirmed.r20 === null && confirmed.r5 === null);
    const staleAge = confirmed.latestDaily ? staleByAge(confirmed.latestDaily, nowIso, 7) : false;
    packs.push({
      key,
      pineSymbol: map.pineSymbol,
      provider: map.provider,
      providerSymbol: map.providerSymbol,
      sourceName: map.sourceName,
      classification: map.classification,
      reason: map.reason,
      latestDaily: confirmed.latestDaily,
      latestMonthly: confirmed.latestMonthly,
      observationCount: confirmed.dailyCount,
      monthlyObservationCount: confirmed.monthlyCount,
      m1: confirmed.m1, r20: confirmed.r20, r5: confirmed.r5,
      stale: staleAge,
      missing,
      error: res?.error,
      status: res?.status ?? 'DATA_UNAVAILABLE',
    });
    assetPacks[key] = { m1: confirmed.m1, r20: confirmed.r20, r5: confirmed.r5, stale: staleAge };
  }

  const input: LiquidityTransmissionInput = {
    m2: m2Input,
    dxy: assetPacks.dxy!, copper: assetPacks.copper!, eem: assetPacks.eem!, vgk: assetPacks.vgk!,
    hyg: assetPacks.hyg!, lqd: assetPacks.lqd!, gold: assetPacks.gold!, silver: assetPacks.silver!,
    vix: assetPacks.vix!, spx: assetPacks.spx!, ndx: assetPacks.ndx!,
    btc: assetPacks.btc!, eth: assetPacks.eth!, total2: assetPacks.total2!,
    providersUsed: load.providersUsed,
  };

  return {
    input,
    packs,
    m2Meta: {
      status: m2Input.status ?? 'UNKNOWN',
      coveragePercent: m2Input.coveragePercent,
      interpretationEligible: m2Input.interpretationEligible ?? false,
      parityStatus: 'DATA_PARITY_PENDING',
      validBlocCount: m2Input.validBlocCount,
      missingBlocs: m2Input.missingBlocs,
      stale: m2Input.stale ?? false,
      providersUsed: m2Input.providersUsed ?? [],
      calculatedAt: nowIso,
    },
  };
}

/** A provider series is stale if its latest confirmed daily bar is older than
 *  `days` calendar days behind `nowIso`. Weekend/holiday tolerance = 7 days. */
function staleByAge(latestDay: string, nowIso: string, days: number): boolean {
  const t0 = Date.parse(nowIso.slice(0, 10) + 'T00:00:00Z');
  const t1 = Date.parse(latestDay + 'T00:00:00Z');
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return false;
  return (t0 - t1) / (1000 * 60 * 60 * 24) > days;
}
