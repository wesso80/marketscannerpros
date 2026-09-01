// Fragility service — the single source of truth for the Fragility engine.
//
// This module resolves ONE Fragility result that is shared by:
//   - the dedicated Fragility page/route,
//   - the Overview status,
//   - the Master fusion (as the Fragility input).
//
// Honesty contract (see .claude/rules/data-integrity.md):
//   - When real provider data is available (INTELLIGENCE_LIVE_DATA=true + keys),
//     we compute the NATIVE engine and label the result LIVE (or PARTIAL).
//   - Otherwise we return the MOCK fixture, clearly labelled MOCK.
//   - We NEVER label the mock as LIVE, and never silently substitute symbols.

import type { FragilityResult as UiFragilityResult, FragilityInternal, RotationItem, SemanticState, DataQuality } from './types';
import { getFragilityResult as getMockFragility } from './mockData';
import { computeFragility, type FragilityResult as EngineFragilityResult, FRAGILITY_SYMBOLS, type FragilitySymbol } from './engines/fragility';
import { loadFragilityInput, PROVIDER_MAP, type DailySeriesResult } from './data/marketDataProvider';
import type { FragilityDailyBar } from './engines/fragility';

/** Representative instruments per rotation sector (display only). */
const SECTOR_REPRESENTATIVE: Record<string, string> = {
  Growth: 'QQQ / SOX / XLK',
  'Small Caps': 'IWM',
  Cyclicals: 'XLI / XLY / XLF',
  EM: 'EEM',
  Crypto: 'BTC / ETH / TOTAL3',
  Metals: 'GOLD / SILVER',
  Commodities: 'COPPER / OIL',
  Bonds: 'TLT',
  Defensive: 'XLP / XLU',
};

function healthLabel(v: number): string {
  if (v >= 65) return 'HEALTHY';
  if (v >= 50) return 'MIXED';
  if (v >= 35) return 'CAUTION';
  return 'STRESS';
}

function scoreSemantic(v: number): SemanticState {
  if (v >= 75) return 'strong-positive';
  if (v >= 60) return 'positive';
  if (v >= 45) return 'neutral';
  if (v >= 30) return 'warning';
  return 'negative';
}

/** Classify each universe symbol by how faithfully it maps to the Pine input. */
type SeriesKind = 'exact' | 'proxy' | 'derived';
function classifySymbol(sym: FragilitySymbol): SeriesKind {
  const map = PROVIDER_MAP[sym];
  if (map.provider === 'derived') return 'derived';
  return map.reason ? 'proxy' : 'exact';
}

const EXACT_SYMBOLS = FRAGILITY_SYMBOLS.filter((s) => classifySymbol(s) === 'exact');
const PROXY_SYMBOLS = FRAGILITY_SYMBOLS.filter((s) => classifySymbol(s) === 'proxy');

/**
 * Derive dataset trustworthiness from a native engine result. parityStatus is
 * capped at DATA_PARITY_PENDING for live data — FULL_PARITY is only ever set
 * once actual TradingView raw-series/timestamp parity has been demonstrated.
 */
function computeDataQuality(engine: EngineFragilityResult): DataQuality {
  const missing = new Set<string>(engine.missingSymbols);
  const total = FRAGILITY_SYMBOLS.length;
  const presentCount = total - missing.size;
  const exactSeriesCount = EXACT_SYMBOLS.filter((s) => !missing.has(s)).length;
  const proxyPresent = PROXY_SYMBOLS.filter((s) => !missing.has(s));
  return {
    coveragePercent: Math.round((presentCount / total) * 100),
    exactSeriesCount,
    proxySeriesCount: proxyPresent.length,
    missingSeriesCount: missing.size,
    proxySymbols: proxyPresent,
    missingSymbols: [...engine.missingSymbols],
    parityStatus: 'DATA_PARITY_PENDING',
  };
}

/**
 * Map the native engine result onto the approved UI contract. Numbers come
 * straight from the engine; display strings are formatted here so the page
 * renders identically whether the source is LIVE or MOCK.
 */
export function mapEngineToUi(e: EngineFragilityResult): UiFragilityResult {
  const isLive = e.sourceStatus === 'OK' || e.sourceStatus === 'PARTIAL';

  const internals: FragilityInternal[] = e.internals.map((m) => ({
    metric: m.label,
    value: Number.isFinite(m.value) ? m.value.toFixed(2) : '—',
    state: m.state,
    semantic: m.semantic,
    risk: 'OK',
    detail: m.key,
    trend: '—',
  }));

  const radar: RotationItem[] = e.radar.map((r) => ({
    sector: r.sector,
    score: Number(r.score.toFixed(2)),
    state: r.state,
    semantic: r.semantic,
    representative: SECTOR_REPRESENTATIVE[r.sector] ?? '—',
    m20: '—',
    relSpy: '—',
  }));

  const [rot1, rot2, rot3] = e.rotationTop;

  return {
    timestamp: e.calculatedAt,
    health: `${e.health.toFixed(1)} · ${healthLabel(e.health)}`,
    healthSemantic: scoreSemantic(e.health),
    fragility: e.fragility.toFixed(2),
    transition: e.transition.toFixed(2),
    divergence: e.divergence.toFixed(0),
    rotation: e.rotationRegime,
    verdict: e.verdict,
    verdictSemantic: e.verdictSemantic,
    components: [
      { label: 'Breadth', value: Number(e.breadth.toFixed(2)), semantic: scoreSemantic(e.breadth) },
      { label: 'Credit', value: Number(e.credit.toFixed(2)), semantic: scoreSemantic(e.credit) },
      { label: 'Vol', value: Number(e.volatility.toFixed(2)), semantic: scoreSemantic(e.volatility) },
      { label: 'USD/Rates', value: Number(e.ratesDollar.toFixed(2)), semantic: scoreSemantic(e.ratesDollar) },
      { label: 'Leadership', value: Number(e.leadership.toFixed(2)), semantic: scoreSemantic(e.leadership) },
      { label: 'Trend', value: Number(e.trend.toFixed(2)), semantic: scoreSemantic(e.trend) },
    ],
    warnings: [
      { label: 'Warnings', state: `${e.warningCount}/5`, semantic: e.warningCount === 0 ? 'strong-positive' : e.warningCount <= 2 ? 'warning' : 'negative' },
      { label: 'Breadth', state: e.warnings.breadth ? 'WARNING' : 'CLEAR', semantic: e.warnings.breadth ? 'warning' : 'strong-positive' },
      { label: 'Credit', state: e.warnings.credit ? 'WARNING' : 'CLEAR', semantic: e.warnings.credit ? 'warning' : 'strong-positive' },
      { label: 'Vol', state: e.warnings.vol ? 'WARNING' : 'CLEAR', semantic: e.warnings.vol ? 'warning' : 'strong-positive' },
      { label: 'USD/Rates', state: e.warnings.rates ? 'WARNING' : 'CLEAR', semantic: e.warnings.rates ? 'warning' : 'strong-positive' },
      { label: 'Lead', state: e.warnings.lead ? 'WARNING' : 'CLEAR', semantic: e.warnings.lead ? 'warning' : 'strong-positive' },
    ],
    path: e.transitionPath,
    playbook: e.playbook,
    confidence: `${e.confidence.toFixed(2)} · ${e.confidenceText}`,
    rot1: rot1 ? `${rot1.name.toUpperCase()} ${rot1.score.toFixed(2)}` : '—',
    rot2: rot2 ? `${rot2.name.toUpperCase()} ${rot2.score.toFixed(2)}` : '—',
    rot3: rot3 ? `${rot3.name.toUpperCase()} ${rot3.score.toFixed(2)}` : '—',
    internals,
    radar,
    meta: {
      isLive,
      sourceStatus: e.sourceStatus,
      calculatedAt: e.calculatedAt,
      dataAsOf: e.dataAsOf,
      isStale: e.isStale,
      providersUsed: e.providersUsed,
      dataQuality: computeDataQuality(e),
    },
  };
}

/* ── Live provider fetchers (activation-gated) ─────────────────────────────────
   These are only invoked when INTELLIGENCE_LIVE_DATA=true AND the provider keys
   exist (enforced inside loadFragilityInput). Until then, loadFragilityInput
   returns DATA_UNAVAILABLE and we serve the labelled MOCK. Providing them here
   makes going live a config flip, not a code change. */

async function fetchAlphaVantageDaily(symbol: string): Promise<DailySeriesResult> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${key}`;
  const r = await fetch(url, { cache: 'no-store' });
  const j = (await r.json()) as { 'Time Series (Daily)'?: Record<string, Record<string, string>>; Note?: string; Information?: string };
  const ts = j['Time Series (Daily)'];
  if (!ts) return { bars: null, provider: 'alpha-vantage', error: j.Note ?? j.Information ?? 'no-series' };
  const bars: FragilityDailyBar[] = Object.entries(ts)
    .map(([date, o]) => ({ date, close: Number(o['4. close']), high: Number(o['2. high']) }))
    .filter((b) => Number.isFinite(b.close) && Number.isFinite(b.high))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { bars, provider: 'alpha-vantage' };
}

async function fetchFredDaily(seriesId: string): Promise<DailySeriesResult> {
  const key = process.env.FRED_API_KEY;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${key}&file_type=json`;
  const r = await fetch(url, { cache: 'no-store' });
  const j = (await r.json()) as { observations?: { date: string; value: string }[] };
  if (!j.observations) return { bars: null, provider: 'fred', error: 'no-observations' };
  const bars: FragilityDailyBar[] = j.observations
    .map((o) => ({ date: o.date, close: Number(o.value), high: Number(o.value) }))
    .filter((b) => Number.isFinite(b.close))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { bars, provider: 'fred' };
}

async function fetchCoinGeckoDaily(id: string): Promise<DailySeriesResult> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=365&interval=daily`;
  const r = await fetch(url, { cache: 'no-store' });
  const j = (await r.json()) as { prices?: [number, number][] };
  if (!j.prices) return { bars: null, provider: 'coingecko', error: 'no-prices' };
  const bars: FragilityDailyBar[] = j.prices
    .map(([ms, price]) => ({ date: new Date(ms).toISOString().slice(0, 10), close: price, high: price }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { bars, provider: 'coingecko' };
}

// TOTAL3 (crypto ex-BTC/ETH market cap) has no free daily historical endpoint
// on CoinGecko. Rather than fabricate a proxy, we report it unavailable so the
// engine records a missing symbol and downgrades Evidence Quality honestly.
async function fetchTotal3Derived(): Promise<DailySeriesResult> {
  return { bars: null, provider: 'derived', error: 'TOTAL3 daily history unavailable on free tier' };
}

const LIVE_FETCHERS = {
  alphaVantage: fetchAlphaVantageDaily,
  fred: fetchFredDaily,
  coingecko: fetchCoinGeckoDaily,
  derivedTotal3: fetchTotal3Derived,
};

export interface ResolvedFragility {
  ui: UiFragilityResult;
  /** Native engine result when LIVE/PARTIAL, otherwise null. */
  engine: EngineFragilityResult | null;
  isLive: boolean;
}

/**
 * Resolve the shared Fragility result. Tries the native engine from real
 * provider data; falls back to the labelled MOCK when data is unavailable.
 *
 * Live results are cached for CACHE_TTL_MS because the underlying series are
 * daily — this avoids burning Alpha Vantage / FRED / CoinGecko quota on every
 * page open. The mock path is cheap and never cached.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — Fragility source data is daily.
let liveCache: { at: number; value: ResolvedFragility } | null = null;

export async function resolveFragility(): Promise<ResolvedFragility> {
  if (liveCache && Date.now() - liveCache.at < CACHE_TTL_MS) {
    return liveCache.value;
  }
  try {
    const input = await loadFragilityInput(LIVE_FETCHERS);
    if (input.sourceStatus === 'OK' || input.sourceStatus === 'PARTIAL') {
      const engine = computeFragility(input);
      const resolved: ResolvedFragility = { ui: mapEngineToUi(engine), engine, isLive: true };
      liveCache = { at: Date.now(), value: resolved };
      return resolved;
    }
  } catch {
    // fall through to mock
  }
  return { ui: getMockFragility(), engine: null, isLive: false };
}

/** Clear the live cache — used by tests and after config changes. */
export function clearFragilityCache(): void {
  liveCache = null;
}

// Keep PROVIDER_MAP reachable for callers/reporting without a second import.
export { PROVIDER_MAP };
