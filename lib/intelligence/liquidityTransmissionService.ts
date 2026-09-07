// Native Liquidity Transmission service — orchestrates:
//   1. upstream Global M2 native result (frozen engine; never recomputed here),
//   2. 14 cross-asset daily series from live/injected providers,
//   3. confirmed-bar ROC pack per asset (pure liquidityConfirmedBars),
//   4. pure computeLiquidityTransmission (Phase 4A engine, untouched),
//   5. stage-8 5D masterLink Δ from persisted history (macro_series).
//
// Provider fetchers are injectable so the service is testable offline. The
// default live path reuses Alpha Vantage / FRED / CoinGecko Pro adapters
// already shipped for Fragility — no duplicated rate-limited stacks.
//
// Failure semantics per §10 (no zero/50 substitution, no fake "LIVE"):
//   - live-data disabled or provider keys missing → status DATA_UNAVAILABLE.
//   - individual provider fails → that asset is missing/stale; engine still
//     computes with Pine `na`→50 for the missing pack. Quality metadata
//     records the exact provider status; parityStatus stays DATA_PARITY_PENDING.

import type { GlobalM2Result } from './engines/globalM2';
import {
  computeLiquidityTransmission, type LiquidityTransmissionResult,
} from './engines/liquidityTransmission';
import { buildWave3Bundle } from './data/globalM2Pipeline';
import {
  loadLiquidityAssetSeries, type LiquidityAssetFetchers, type AssetSeriesResult,
} from './data/providers/liquidityAssetProviders';
import {
  buildLiquidityTransmissionInput, mapGlobalM2ToInput, type AssetPackMetadata,
} from './data/liquidityTransmissionInputBuilder';
import type { DailyBar } from './data/liquidityConfirmedBars';
import {
  dbMasterLinkHistoryStore, type MasterLinkHistoryStore,
} from './data/liquidityTransmissionHistoryStore';
import {
  parseAlphaVantageDaily, parseFredObservations,
} from './fragilityService';
import { getMarketChartHistory, getGlobalMarketCapChart, getMarketChartFull } from '@/lib/coingecko';

export type LiquidityTransmissionServiceStatus =
  | 'OK' | 'PARTIAL' | 'DATA_UNAVAILABLE' | 'CREDENTIAL_REQUIRED' | 'ENGINE_ERROR';

export interface LiquidityTransmissionResolved {
  status: LiquidityTransmissionServiceStatus;
  environmentLabel: 'LOCAL LIVE' | 'PRODUCTION LIVE' | 'UNAVAILABLE';
  calculatedAt: string;
  result: LiquidityTransmissionResult | null;
  packs: AssetPackMetadata[];
  m2Meta: ReturnType<typeof buildLiquidityTransmissionInput>['m2Meta'];
  /** transmissionRiskOn on the previous confirmed daily bar (if history exists). */
  previousMasterLink: { observedOn: string; masterLink: number } | null;
  /** transmissionRiskOn − previousMasterLink — the stage-8 5D Δ cell (null if no history). */
  masterLinkDelta: number | null;
  providersUsed: string[];
  missingKeys: string[];
  errors: { key: string; error: string }[];
  reason?: string;
}

export interface LiquidityTransmissionServiceDeps {
  fetchers?: LiquidityAssetFetchers;
  globalM2?: () => Promise<GlobalM2Result | null>;
  historyStore?: MasterLinkHistoryStore;
  nowIso?: string;
  environmentLabel?: 'LOCAL LIVE' | 'PRODUCTION LIVE';
  /** When true, service persists today's masterLink after computing it. */
  persist?: boolean;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — Liquidity Transmission inputs are daily.
let liveCache: { at: number; value: LiquidityTransmissionResolved } | null = null;

/**
 * Resolve one native Liquidity Transmission result. Cached for 6h in live
 * mode. Tests inject deps to bypass network, cache and DB.
 */
export async function resolveLiquidityTransmission(
  deps: LiquidityTransmissionServiceDeps = {},
): Promise<LiquidityTransmissionResolved> {
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const injected = deps.fetchers || deps.globalM2 || deps.historyStore || deps.nowIso;

  if (!injected && liveCache && Date.now() - liveCache.at < CACHE_TTL_MS) {
    return liveCache.value;
  }

  // 1) Live-data gate — identical to the Fragility contract. If disabled or
  //    provider keys are missing, we never label the result LIVE.
  if (!injected) {
    const gate = liveDataGate();
    if (!gate.ok) return unavailable(nowIso, gate.reason);
  }

  // 2) Upstream Global M2 — consume the frozen engine's output as-is.
  let m2Result: GlobalM2Result | null = null;
  let m2Status = 'LIVE';
  let m2InterpretationEligible = false;
  let m2Providers: string[] = [];
  let m2Stale = false;
  try {
    if (deps.globalM2) {
      m2Result = await deps.globalM2();
    } else {
      const bundle = await buildWave3Bundle();
      m2Result = bundle.result;
      m2InterpretationEligible = bundle.eligibility.interpretationEligible;
      m2Providers = bundle.providerStatus.filter((s) => s.ok).map((s) => s.id);
      m2Stale = bundle.providerStatus.some((s) => s.stale);
      m2Status = bundle.eligibility.interpretationEligible ? 'LIVE' : 'LIVE/PARTIAL UPSTREAM';
    }
  } catch (e) {
    m2Status = 'PROVIDER_UNREACHABLE';
    m2Stale = true;
    m2Providers = [];
    // continue — engine can still compute stage math from missing M2.
  }
  const m2Input = mapGlobalM2ToInput(m2Result, {
    status: m2Status, interpretationEligible: m2InterpretationEligible,
    stale: m2Stale, providersUsed: m2Providers,
  });

  // 3) 14 cross-asset series in parallel.
  const fetchers = deps.fetchers ?? defaultLiveFetchers();
  const load = await loadLiquidityAssetSeries(fetchers);

  // 4) Build engine input + call the frozen Phase 4A engine.
  const built = buildLiquidityTransmissionInput(load, m2Input, nowIso);
  let result: LiquidityTransmissionResult | null = null;
  try {
    result = computeLiquidityTransmission(built.input, undefined, nowIso);
  } catch (e) {
    return {
      status: 'ENGINE_ERROR', environmentLabel: 'UNAVAILABLE', calculatedAt: nowIso,
      result: null, packs: built.packs, m2Meta: built.m2Meta,
      previousMasterLink: null, masterLinkDelta: null,
      providersUsed: load.providersUsed, missingKeys: load.missingKeys,
      errors: load.errors, reason: e instanceof Error ? e.message : 'engine-error',
    };
  }

  // 5) Stage-8 5D Δ — read the previous confirmed masterLink from history.
  const history = deps.historyStore ?? dbMasterLinkHistoryStore;
  const day = nowIso.slice(0, 10);
  const previous = await history.readLatestBefore(day);
  const masterLinkDelta = previous ? result.masterLink - previous.masterLink : null;

  if (deps.persist ?? true) {
    await history.write(day, result.masterLink);
  }

  const overallStatus: LiquidityTransmissionServiceStatus =
    load.missingKeys.length === 0 && m2Result ? 'OK'
    : load.missingKeys.length < 14 ? 'PARTIAL'
    : 'DATA_UNAVAILABLE';

  const resolved: LiquidityTransmissionResolved = {
    status: overallStatus,
    environmentLabel: deps.environmentLabel ?? inferEnvironmentLabel(),
    calculatedAt: nowIso,
    result,
    packs: built.packs,
    m2Meta: built.m2Meta,
    previousMasterLink: previous ? { observedOn: previous.observedOn, masterLink: previous.masterLink } : null,
    masterLinkDelta,
    providersUsed: load.providersUsed,
    missingKeys: load.missingKeys,
    errors: load.errors,
  };

  if (!injected) liveCache = { at: Date.now(), value: resolved };
  return resolved;
}

/** Reset the in-process cache (used by admin refresh and tests). */
export function resetLiquidityTransmissionCache(): void {
  liveCache = null;
}

/* ── Environment / live-data gate ──────────────────────────────────────────── */

function liveDataGate(): { ok: boolean; reason?: string } {
  if (process.env.INTELLIGENCE_LIVE_DATA !== 'true') return { ok: false, reason: 'live-data-disabled' };
  if (!process.env.ALPHA_VANTAGE_API_KEY) return { ok: false, reason: 'missing-ALPHA_VANTAGE_API_KEY' };
  if (!process.env.FRED_API_KEY) return { ok: false, reason: 'missing-FRED_API_KEY' };
  // CoinGecko Pro is required for BTC/ETH/TOTAL2 history — fail closed rather
  // than silently omit crypto downstream stages.
  if (!process.env.COINGECKO_API_KEY && !process.env.COINGECKO_PRO_API_KEY) {
    return { ok: false, reason: 'missing-COINGECKO_API_KEY' };
  }
  return { ok: true };
}

function inferEnvironmentLabel(): 'LOCAL LIVE' | 'PRODUCTION LIVE' | 'UNAVAILABLE' {
  if (process.env.INTELLIGENCE_LIVE_DATA !== 'true') return 'UNAVAILABLE';
  return process.env.RENDER === 'true' || process.env.VERCEL === '1' ? 'PRODUCTION LIVE' : 'LOCAL LIVE';
}

function unavailable(nowIso: string, reason?: string): LiquidityTransmissionResolved {
  return {
    status: 'DATA_UNAVAILABLE', environmentLabel: 'UNAVAILABLE', calculatedAt: nowIso,
    result: null, packs: [],
    m2Meta: {
      status: 'UNAVAILABLE', interpretationEligible: false, parityStatus: 'DATA_PARITY_PENDING',
      validBlocCount: 0, missingBlocs: [], stale: false, providersUsed: [], calculatedAt: nowIso,
    },
    previousMasterLink: null, masterLinkDelta: null,
    providersUsed: [], missingKeys: [], errors: [], reason,
  };
}

/* ── Default live fetchers (Alpha Vantage / FRED / CoinGecko) ──────────────── */

function defaultLiveFetchers(): LiquidityAssetFetchers {
  return {
    alphaVantage: fetchAlphaVantageForLiquidity,
    fred: fetchFredForLiquidity,
    coingecko: fetchCoinGeckoForLiquidity,
    derivedTotal2: fetchTotal2Derived,
  };
}

async function fetchAlphaVantageForLiquidity(symbol: string): Promise<AssetSeriesResult> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return { bars: null, provider: 'alpha-vantage', status: 'CREDENTIAL_REQUIRED', error: 'missing-ALPHA_VANTAGE_API_KEY' };
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${key}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const parsed = parseAlphaVantageDaily(j);
    if (!parsed.bars || parsed.bars.length === 0) {
      return { bars: null, provider: 'alpha-vantage', status: 'DATA_UNAVAILABLE', error: parsed.error ?? 'no-series' };
    }
    return { bars: parsed.bars.map(toDailyBar), provider: 'alpha-vantage', status: 'OK', observationCount: parsed.bars.length };
  } catch (e) {
    return { bars: null, provider: 'alpha-vantage', status: 'PROVIDER_UNREACHABLE', error: e instanceof Error ? e.message : 'fetch-failed' };
  }
}

async function fetchFredForLiquidity(seriesId: string): Promise<AssetSeriesResult> {
  const key = process.env.FRED_API_KEY;
  if (!key) return { bars: null, provider: 'fred', status: 'CREDENTIAL_REQUIRED', error: 'missing-FRED_API_KEY' };
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${key}&file_type=json`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const parsed = parseFredObservations(j);
    if (!parsed.bars || parsed.bars.length === 0) {
      return { bars: null, provider: 'fred', status: 'DATA_UNAVAILABLE', error: parsed.error ?? 'no-observations' };
    }
    return { bars: parsed.bars.map(toDailyBar), provider: 'fred', status: 'OK', observationCount: parsed.bars.length };
  } catch (e) {
    return { bars: null, provider: 'fred', status: 'PROVIDER_UNREACHABLE', error: e instanceof Error ? e.message : 'fetch-failed' };
  }
}

async function fetchCoinGeckoForLiquidity(id: string): Promise<AssetSeriesResult> {
  try {
    // 365d of daily closes (BTC and ETH). ROC(20)[1] needs ≥22, ROC(1)[1]
    // monthly needs 2 completed months — 365 is comfortably deep.
    const res = await getMarketChartHistory(id, 365);
    if (!res?.prices?.length) return { bars: null, provider: 'coingecko', status: 'DATA_UNAVAILABLE', error: 'no-prices' };
    const bars: DailyBar[] = collapseToDailyClose(res.prices);
    return { bars, provider: 'coingecko', status: 'OK', observationCount: bars.length };
  } catch (e) {
    return { bars: null, provider: 'coingecko', status: 'PROVIDER_UNREACHABLE', error: e instanceof Error ? e.message : 'fetch-failed' };
  }
}

/**
 * TOTAL2 = crypto total market cap − BTC market cap. CoinGecko exposes daily
 * global market_cap history under /global/market_cap_chart (💼 Analyst plan)
 * and BTC market_caps under /coins/bitcoin/market_chart. When either endpoint
 * is unavailable on the current plan we report DATA_UNAVAILABLE rather than
 * fabricate. Classification is DERIVED (never EXACT) per §5.
 */
async function fetchTotal2Derived(): Promise<AssetSeriesResult> {
  try {
    const [global, btc] = await Promise.all([
      getGlobalMarketCapChart(365).catch(() => null),
      getMarketChartFull('bitcoin', 365).catch(() => null),
    ]);
    if (!global?.market_cap_chart?.market_cap?.length || !btc?.market_caps?.length) {
      return {
        bars: null, provider: 'derived', status: 'DATA_UNAVAILABLE',
        error: 'TOTAL2 requires CoinGecko Analyst plan /global/market_cap_chart + bitcoin market_caps',
      };
    }
    const globalDaily = collapseToDailyClose(global.market_cap_chart.market_cap);
    const btcDaily = collapseToDailyClose(btc.market_caps);
    const byDate = new Map(btcDaily.map((b) => [b.date, b.close]));
    const bars: DailyBar[] = [];
    for (const g of globalDaily) {
      const btcMcap = byDate.get(g.date);
      if (btcMcap == null || !Number.isFinite(btcMcap)) continue;
      const t2 = g.close - btcMcap;
      if (Number.isFinite(t2) && t2 > 0) bars.push({ date: g.date, close: t2 });
    }
    if (bars.length === 0) return { bars: null, provider: 'derived', status: 'DATA_UNAVAILABLE', error: 'TOTAL2 derivation produced no bars' };
    return { bars, provider: 'derived', status: 'OK', observationCount: bars.length };
  } catch (e) {
    return { bars: null, provider: 'derived', status: 'PROVIDER_UNREACHABLE', error: e instanceof Error ? e.message : 'fetch-failed' };
  }
}

/** Reduce a [timestampMs, value] series to one entry per calendar day (last). */
export function collapseToDailyClose(pairs: [number, number][]): DailyBar[] {
  const byDay = new Map<string, { ts: number; close: number }>();
  for (const [ms, v] of pairs) {
    if (!Number.isFinite(v)) continue;
    const date = new Date(ms).toISOString().slice(0, 10);
    const prev = byDay.get(date);
    if (!prev || ms > prev.ts) byDay.set(date, { ts: ms, close: v });
  }
  return [...byDay.entries()]
    .map(([date, o]) => ({ date, close: o.close }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function toDailyBar(b: { date: string; close: number }): DailyBar {
  return { date: b.date.slice(0, 10), close: b.close };
}
