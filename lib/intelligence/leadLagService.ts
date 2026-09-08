// Phase 5B — Native Lead/Lag service.
//
// Orchestrates:
//   1. 5m provider fetch for the 11 Pine leaders + NQ target (leadLagAssetProviders)
//   2. Confirmed-bar normalisation, RTH mask, and log-return build (leadLag5mConfirmedBars)
//   3. Timestamp alignment to the target's 5m grid (never resamples)
//   4. Pure computeLeadLag() (Phase 5A engine — untouched)
//   5. Quality metadata + predictiveHistory placeholder (Phase 5B §14 defers EMA)
//
// Provider fetchers are INJECTABLE so the service is testable offline. The
// default live path reuses avFetchIntradayBars (Alpha Vantage TIME_SERIES_INTRADAY)
// and CoinGecko's OHLC — no duplicated rate-limited stacks.
//
// FAILURE SEMANTICS (§11): no silent substitutions. Providers that fail →
// their series is null/UNAVAILABLE and the engine consumes that as Pine na.
// Target NQ UNAVAILABLE → status DATA_UNAVAILABLE and no engine call.

import {
  computeLeadLag, LEADLAG_CONFIG,
  type LeadLagAssetInput, type LeadLagInput, type LeadLagResult,
  type LeadLagAssetKey, type LeadLagSourceClass,
} from './engines/leadLag';
import {
  loadLeadLag5mSeries,
  LEADLAG_PROVIDER_MAP,
  LEADLAG_TARGET_UNAVAILABLE,
  LEADLAG_TARGET_QQQ_PROXY,
  type LeadLag5mFetchers,
  type LeadLag5mLoad,
  type LeadLag5mSeries,
  type LeadLagBar5m,
  type LeadLagTargetMapping,
} from './data/providers/leadLagAssetProviders';
import {
  buildConfirmed5m, buildAssetReturnSeries, buildTargetSeriesForAsset,
  alignLeaderToTargetGrid, isInNyRth,
  type AssetReturnSeries,
} from './data/leadLag5mConfirmedBars';
import { avFetchIntradayBars } from '@/lib/marketData/client';
import { getMarketChartFull } from '@/lib/coingecko';

export type LeadLagServiceStatus =
  | 'OK' | 'PARTIAL' | 'DATA_UNAVAILABLE' | 'CREDENTIAL_REQUIRED' | 'ENGINE_ERROR';

export interface LeadLagAssetDiagnostic {
  key: LeadLagAssetKey;
  provider: string;
  providerSymbol: string;
  classification: LeadLagSourceClass | 'UNAVAILABLE';
  reason?: string;
  status: string;
  barCount: number;
  latestConfirmedTs: string | null;
  rthOnly: boolean;
  active: number;
  missing: boolean;
  stale: boolean;
  droppedFormingBar: string | null;
  droppedDuplicates: number;
  droppedNonFinite: number;
  error?: string;
}

export interface LeadLagTargetDiagnostic {
  pineSymbol: string;
  provider: string;
  providerSymbol: string;
  classification: LeadLagSourceClass | 'UNAVAILABLE';
  reason: string;
  status: string;
  barCount: number;
  latestConfirmedTs: string | null;
  error?: string;
  proxyEnabled: boolean;
}

export interface LeadLagResolved {
  status: LeadLagServiceStatus;
  environmentLabel: 'LOCAL LIVE' | 'PRODUCTION LIVE' | 'UNAVAILABLE';
  calculatedAt: string;
  result: LeadLagResult | null;
  target: LeadLagTargetDiagnostic;
  assets: LeadLagAssetDiagnostic[];
  providersUsed: string[];
  missingKeys: LeadLagAssetKey[];
  errors: { key: string; error: string }[];
  reason?: string;
  /** Predictive EMA9 requires history; §14 defers a proper history store. */
  historyBuilding: boolean;
}

export interface LeadLagServiceDeps {
  fetchers?: LeadLag5mFetchers;
  nowIso?: string;
  environmentLabel?: 'LOCAL LIVE' | 'PRODUCTION LIVE';
  /** §6 — must be explicit; never silent. */
  enableQqqTargetProxy?: boolean;
  /** Optional prior predictive values for EMA9 (§14 placeholder). */
  predictiveHistory?: (number | null)[];
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute — 5m bars complete every 5 minutes.
let liveCache: { at: number; key: string; value: LeadLagResolved } | null = null;

export async function resolveLeadLag(deps: LeadLagServiceDeps = {}): Promise<LeadLagResolved> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const injected = deps.fetchers || deps.nowIso;
  const cacheKey = String(deps.enableQqqTargetProxy === true);

  if (!injected && liveCache && liveCache.key === cacheKey
      && Date.now() - liveCache.at < CACHE_TTL_MS) {
    return liveCache.value;
  }

  if (!injected) {
    const gate = liveDataGate();
    if (!gate.ok) return unavailable(nowIso, gate.reason, deps.enableQqqTargetProxy);
  }

  const fetchers = deps.fetchers ?? defaultLiveFetchers();
  const load = await loadLeadLag5mSeries(fetchers, {
    enableQqqTargetProxy: deps.enableQqqTargetProxy === true,
  });

  // Target-first: if the NQ target is unusable we cannot align leaders.
  if (!load.target.bars || load.target.bars.length === 0) {
    return unavailableFromLoad(load, nowIso, deps.enableQqqTargetProxy,
      load.target.error ?? 'NQ target unavailable');
  }

  const targetConfirmed = buildConfirmed5m(load.target.bars, nowMs);
  if (targetConfirmed.bars.length < 2) {
    return unavailableFromLoad(load, nowIso, deps.enableQqqTargetProxy,
      'insufficient target bars after confirmed-bar cutoff');
  }
  const targetReturns = buildAssetReturnSeries(targetConfirmed.bars, /* rthOnly */ false, { nowMs });
  const targetTsMs = targetReturns.tsMs;
  const targetLatestBarInRTH = isInNyRth(targetTsMs[targetTsMs.length - 1] ?? nowMs);

  // Build a per-asset LeadLagAssetInput aligned to the target grid.
  const assetInputs: LeadLagAssetInput[] = [];
  const assetDiagnostics: LeadLagAssetDiagnostic[] = [];
  for (const key of Object.keys(LEADLAG_PROVIDER_MAP) as LeadLagAssetKey[]) {
    const map = LEADLAG_PROVIDER_MAP[key];
    const s = load.series[key];
    const confirmed = buildConfirmed5m(s?.bars ?? null, nowMs);
    const leader = buildAssetReturnSeries(confirmed.bars, map.rthOnly, { nowMs });
    const aligned = alignLeaderToTargetGrid(targetTsMs, leader);
    const y = buildTargetSeriesForAsset(targetReturns.x, targetTsMs, map.rthOnly);

    // Session-active weight on the CURRENT bar. RTH-only leaders inherit
    // targetLatestBarInRTH; always-active leaders stay 1.
    const active = map.rthOnly ? (targetLatestBarInRTH ? 1 : 0) : 1;

    // Present a diagnostic (may be UNAVAILABLE even before engine sees it).
    const barCount = confirmed.bars.length;
    const missing = barCount === 0;
    // Stale = last confirmed bar older than 15 minutes from `now`.
    const lastTsMs = barCount > 0 ? confirmed.bars[barCount - 1].tsMs : 0;
    const stale = barCount > 0 && (nowMs - lastTsMs) > 15 * 60 * 1000;

    assetDiagnostics.push({
      key,
      provider: map.provider,
      providerSymbol: map.providerSymbol,
      classification: map.classification,
      reason: map.reason,
      status: s?.status ?? 'DATA_UNAVAILABLE',
      barCount,
      latestConfirmedTs: confirmed.latestConfirmedTs,
      rthOnly: map.rthOnly,
      active,
      missing,
      stale,
      droppedFormingBar: confirmed.droppedFormingBar?.ts ?? null,
      droppedDuplicates: confirmed.droppedDuplicateCount,
      droppedNonFinite: confirmed.droppedNonFiniteCount,
      error: s?.error,
    });

    assetInputs.push({
      key,
      x: aligned.x,
      y,
      // Pine z uses UNMASKED rXXX (leader raw returns). We approximate by
      // using the leader's own return series pre-RTH-mask when available.
      returnsForZ: leader.x, // NOTE: rthOnly leaders → nulls outside RTH; matches Pine gaps_off behaviour.
      active,
      classification: map.classification === 'UNAVAILABLE' ? 'PROXY' : map.classification,
      provider: map.provider,
      stale,
    });
  }

  // engineOK: target is NQ + current bar is a valid 5m bar.
  const engineOK = load.targetMapping.classification !== 'UNAVAILABLE'
    || deps.enableQqqTargetProxy === true;
  const input: LeadLagInput = {
    assets: assetInputs,
    targetSymbol: load.targetMapping.pineSymbol,
    engineOK: engineOK && targetTsMs.length >= 2,
    inRTH: targetLatestBarInRTH,
    bar: targetTsMs.length - 1,
    predictiveHistory: deps.predictiveHistory,
    providersUsed: [...new Set(load.providersUsed)],
  };

  let result: LeadLagResult | null = null;
  try {
    result = computeLeadLag(input, LEADLAG_CONFIG, nowIso);
  } catch (e) {
    return {
      status: 'ENGINE_ERROR', environmentLabel: 'UNAVAILABLE', calculatedAt: nowIso,
      result: null,
      target: buildTargetDiagnostic(load.target, load.targetMapping, targetConfirmed.latestConfirmedTs, deps.enableQqqTargetProxy === true),
      assets: assetDiagnostics,
      providersUsed: [...new Set(load.providersUsed)],
      missingKeys: load.missingKeys,
      errors: [{ key: 'engine', error: e instanceof Error ? e.message : 'engine-error' }],
      reason: e instanceof Error ? e.message : 'engine-error',
      historyBuilding: deps.predictiveHistory == null,
    };
  }

  const usableCount = assetDiagnostics.filter((a) => !a.missing).length;
  const overallStatus: LeadLagServiceStatus =
    usableCount === 0 ? 'DATA_UNAVAILABLE'
    : load.missingKeys.length === 0 ? 'OK'
    : 'PARTIAL';

  const resolved: LeadLagResolved = {
    status: overallStatus,
    environmentLabel: deps.environmentLabel ?? inferEnvironmentLabel(),
    calculatedAt: nowIso,
    result,
    target: buildTargetDiagnostic(load.target, load.targetMapping, targetConfirmed.latestConfirmedTs, deps.enableQqqTargetProxy === true),
    assets: assetDiagnostics,
    providersUsed: [...new Set(load.providersUsed)],
    missingKeys: load.missingKeys,
    errors: load.errors.map((e) => ({ key: String(e.key), error: e.error })),
    historyBuilding: deps.predictiveHistory == null,
  };

  if (!injected) liveCache = { at: Date.now(), key: cacheKey, value: resolved };
  return resolved;
}

export function resetLeadLagCache(): void { liveCache = null; }

/* ── Environment gate ─────────────────────────────────────────────────────── */

function liveDataGate(): { ok: boolean; reason?: string } {
  if (process.env.INTELLIGENCE_LIVE_DATA !== 'true') return { ok: false, reason: 'live-data-disabled' };
  if (!process.env.ALPHA_VANTAGE_API_KEY) return { ok: false, reason: 'missing-ALPHA_VANTAGE_API_KEY' };
  if (!process.env.COINGECKO_API_KEY && !process.env.COINGECKO_PRO_API_KEY) {
    return { ok: false, reason: 'missing-COINGECKO_API_KEY' };
  }
  return { ok: true };
}

function inferEnvironmentLabel(): 'LOCAL LIVE' | 'PRODUCTION LIVE' | 'UNAVAILABLE' {
  if (process.env.INTELLIGENCE_LIVE_DATA !== 'true') return 'UNAVAILABLE';
  return process.env.RENDER === 'true' || process.env.VERCEL === '1' ? 'PRODUCTION LIVE' : 'LOCAL LIVE';
}

function unavailable(
  nowIso: string, reason?: string, qqqProxy = false,
): LeadLagResolved {
  const targetMapping = qqqProxy ? LEADLAG_TARGET_QQQ_PROXY : LEADLAG_TARGET_UNAVAILABLE;
  return {
    status: 'DATA_UNAVAILABLE',
    environmentLabel: 'UNAVAILABLE',
    calculatedAt: nowIso,
    result: null,
    target: {
      pineSymbol: targetMapping.pineSymbol,
      provider: targetMapping.provider,
      providerSymbol: targetMapping.providerSymbol,
      classification: targetMapping.classification,
      reason: targetMapping.reason,
      status: 'DATA_UNAVAILABLE',
      barCount: 0, latestConfirmedTs: null, proxyEnabled: qqqProxy,
    },
    assets: [], providersUsed: [], missingKeys: [], errors: [], reason,
    historyBuilding: true,
  };
}

function unavailableFromLoad(
  load: LeadLag5mLoad, nowIso: string, qqqProxy = false, reason?: string,
): LeadLagResolved {
  return {
    status: 'DATA_UNAVAILABLE',
    environmentLabel: inferEnvironmentLabel(),
    calculatedAt: nowIso,
    result: null,
    target: buildTargetDiagnostic(load.target, load.targetMapping, null, qqqProxy),
    assets: [],
    providersUsed: [...new Set(load.providersUsed)],
    missingKeys: load.missingKeys,
    errors: load.errors.map((e) => ({ key: String(e.key), error: e.error })),
    reason,
    historyBuilding: true,
  };
}

function buildTargetDiagnostic(
  s: LeadLag5mSeries, mapping: LeadLagTargetMapping, latestConfirmedTs: string | null,
  proxyEnabled: boolean,
): LeadLagTargetDiagnostic {
  return {
    pineSymbol: mapping.pineSymbol,
    provider: mapping.provider,
    providerSymbol: mapping.providerSymbol,
    classification: mapping.classification,
    reason: mapping.reason,
    status: s.status,
    barCount: s.bars?.length ?? 0,
    latestConfirmedTs: latestConfirmedTs ?? s.latestTs ?? null,
    error: s.error,
    proxyEnabled,
  };
}

/* ── Default live fetchers ────────────────────────────────────────────────── */

function defaultLiveFetchers(): LeadLag5mFetchers {
  return {
    alphaVantage: fetchAvIntraday5m,
    coingecko: fetchCoingecko5m,
  };
}

async function fetchAvIntraday5m(providerSymbol: string): Promise<LeadLag5mSeries> {
  if (!process.env.ALPHA_VANTAGE_API_KEY) {
    return { key: 'ES', bars: null, provider: 'alpha-vantage', status: 'CREDENTIAL_REQUIRED', error: 'missing-ALPHA_VANTAGE_API_KEY' };
  }
  try {
    const res = await avFetchIntradayBars(providerSymbol, '5min');
    if (!res || !res.bars || res.bars.length === 0) {
      return { key: 'ES', bars: null, provider: 'alpha-vantage', status: 'DATA_UNAVAILABLE', error: 'no-series' };
    }
    const bars: LeadLagBar5m[] = res.bars.map((b) => ({
      ts: new Date(b.ts).toISOString(),
      tsMs: b.ts,
      close: b.close,
    }));
    return { key: 'ES', bars, provider: 'alpha-vantage', status: 'OK', observationCount: bars.length,
      latestTs: bars[bars.length - 1].ts };
  } catch (e) {
    return { key: 'ES', bars: null, provider: 'alpha-vantage', status: 'PROVIDER_UNREACHABLE',
      error: e instanceof Error ? e.message : 'fetch-failed' };
  }
}

async function fetchCoingecko5m(coinId: string): Promise<LeadLag5mSeries> {
  try {
    // /coins/{id}/market_chart?days=1 returns automatic 5-minute price
    // samples for the last 24h (~288 timestamps). getOHLCWithVolume uses the
    // /ohlc endpoint which is 30-minute at days=1 — wrong granularity for
    // the 5m Lead/Lag engine.
    const chart = await getMarketChartFull(coinId, 1);
    if (!chart?.prices?.length) {
      return { key: 'BTC', bars: null, provider: 'coingecko', status: 'DATA_UNAVAILABLE', error: 'no-series' };
    }
    // Collapse to one bar per 5-minute UTC boundary (last-sample-wins).
    const byBucket = new Map<number, { ts: number; close: number }>();
    for (const [ts, price] of chart.prices) {
      if (!Number.isFinite(price) || price <= 0) continue;
      const bucketMs = Math.floor(ts / (5 * 60 * 1000)) * 5 * 60 * 1000;
      const prev = byBucket.get(bucketMs);
      if (!prev || ts > prev.ts) byBucket.set(bucketMs, { ts, close: price });
    }
    const bars: LeadLagBar5m[] = [...byBucket.entries()]
      .map(([bucketMs, s]) => ({ ts: new Date(bucketMs).toISOString(), tsMs: bucketMs, close: s.close }))
      .sort((a, b) => a.tsMs - b.tsMs);
    if (bars.length === 0) {
      return { key: 'BTC', bars: null, provider: 'coingecko', status: 'DATA_UNAVAILABLE', error: 'all-bars-invalid' };
    }
    return { key: 'BTC', bars, provider: 'coingecko', status: 'OK', observationCount: bars.length,
      latestTs: bars[bars.length - 1].ts };
  } catch (e) {
    return { key: 'BTC', bars: null, provider: 'coingecko', status: 'PROVIDER_UNREACHABLE',
      error: e instanceof Error ? e.message : 'fetch-failed' };
  }
}
