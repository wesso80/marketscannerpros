// Phase 5B — Provider map for the 11 Lead/Lag leaders + NQ target at 5-minute cadence.
//
// Every Pine `input.symbol` default is resolved to a native provider + native
// intraday endpoint and tagged with a source classification. Classifications
// are honest — no silent substitutions (Phase 5B §3, §11):
//   EXACT       — provider's 5m series maps 1:1 to the Pine symbol.
//   ALTERNATIVE — same underlying, different venue (CoinGecko vs Bitstamp BTC).
//   PROXY       — ETF/related instrument stands in for an unlicensed reference
//                  (VIX→VIXY, DXY→UUP, US10Y→TLT, GOLD→GLD, COPPER→CPER, SOX→SOXX).
//   UNAVAILABLE — no 5m provider on any current data plan; series is missing.
//
// TARGET FIDELITY (§6): NQ/MNQ futures 5m is unavailable on Alpha Vantage /
// FRED / CoinGecko. Reported as a MATERIAL BLOCKER. The service exposes a
// diagnostic-only proxy path (QQQ) that is CLASSIFIED explicitly — never used
// silently. This module never picks a proxy on the caller's behalf.
//
// Live network is never performed at import time. The default fetchers reuse
// avFetchIntradayBars (Alpha Vantage TIME_SERIES_INTRADAY 5min) and
// getOHLCWithVolume (CoinGecko days=1 ≈ 5-min granularity) — no duplicated
// rate-limited stacks.

import type { LeadLagAssetKey, LeadLagSourceClass } from '../../engines/leadLag';

export type LeadLagProvider =
  | 'alpha-vantage'   // TIME_SERIES_INTRADAY (equities/ETFs)
  | 'coingecko'       // /coins/{id}/ohlc + market_chart (BTC intraday)
  | 'unavailable';    // no 5m feed on current data plans

export interface LeadLagBar5m {
  /** UTC ISO timestamp of the 5-minute bar START (e.g. 14:30 for 14:30–14:35). */
  ts: string;
  /** Millisecond epoch (numeric key for sort/dedup). */
  tsMs: number;
  close: number;
}

export interface LeadLag5mSeries {
  key: LeadLagAssetKey | 'NQ_TARGET';
  bars: LeadLagBar5m[] | null;
  provider: LeadLagProvider;
  status: 'OK' | 'PARTIAL' | 'DATA_UNAVAILABLE' | 'CREDENTIAL_REQUIRED' | 'PROVIDER_UNREACHABLE';
  observationCount?: number;
  latestTs?: string;
  error?: string;
}

export interface LeadLagAssetMapping {
  key: LeadLagAssetKey;
  pineSymbol: string;
  provider: LeadLagProvider;
  providerSymbol: string;
  sourceName: string;
  classification: LeadLagSourceClass | 'UNAVAILABLE';
  reason?: string;
  /** True → RTH-only cash market (Pine: xXXX := inRTH ? rXXX : na). */
  rthOnly: boolean;
}

/**
 * Pine → provider map for the 11 leaders. Every non-EXACT row carries a
 * `reason` and must never be relabelled silently. Adding real futures/index
 * feeds later flips PROXY → EXACT here — no engine change is required.
 */
export const LEADLAG_PROVIDER_MAP: Record<LeadLagAssetKey, LeadLagAssetMapping> = {
  ES:     { key: 'ES',     pineSymbol: 'CME_MINI:ES1!',  provider: 'unavailable',  providerSymbol: '',      sourceName: 'CME E-mini S&P 500 (ES1!)',    classification: 'UNAVAILABLE', reason: 'Front-month S&P 500 futures. Not licensed on Alpha Vantage / FRED / CoinGecko. Diagnostic proxy path uses SPY when explicitly enabled.', rthOnly: false },
  SOX:    { key: 'SOX',    pineSymbol: 'NASDAQ:SOX',     provider: 'alpha-vantage', providerSymbol: 'SOXX', sourceName: 'iShares Semiconductor ETF (SOXX)', classification: 'PROXY',       reason: 'PHLX Semiconductor (SOX) index not on Alpha Vantage — SOXX ETF proxy.', rthOnly: true },
  QQQ:    { key: 'QQQ',    pineSymbol: 'NASDAQ:QQQ',     provider: 'alpha-vantage', providerSymbol: 'QQQ',  sourceName: 'Invesco QQQ Trust',            classification: 'EXACT',                                                                                    rthOnly: true },
  NVDA:   { key: 'NVDA',   pineSymbol: 'NASDAQ:NVDA',    provider: 'alpha-vantage', providerSymbol: 'NVDA', sourceName: 'NVIDIA Corp (NVDA)',           classification: 'EXACT',                                                                                    rthOnly: true },
  VIX:    { key: 'VIX',    pineSymbol: 'CBOE:VIX',       provider: 'alpha-vantage', providerSymbol: 'VIXY', sourceName: 'ProShares VIX Short-Term Futures ETF (VIXY)', classification: 'PROXY', reason: 'CBOE VIX index not on Alpha Vantage 5m — VIXY front-month VIX futures ETF proxy.', rthOnly: true },
  DXY:    { key: 'DXY',    pineSymbol: 'TVC:DXY',        provider: 'alpha-vantage', providerSymbol: 'UUP',  sourceName: 'Invesco DB USD Bullish ETF (UUP)', classification: 'PROXY',    reason: 'ICE DXY not licensed on Alpha Vantage — UUP ETF proxy.', rthOnly: false },
  US10Y:  { key: 'US10Y',  pineSymbol: 'TVC:US10Y',      provider: 'alpha-vantage', providerSymbol: 'TLT',  sourceName: 'iShares 20+ Year Treasury Bond ETF (TLT)', classification: 'PROXY', reason: 'US 10Y yield index not on Alpha Vantage 5m — TLT ETF proxy (inverse-yield relationship; sign preserved by engine).', rthOnly: false },
  HYG:    { key: 'HYG',    pineSymbol: 'AMEX:HYG',       provider: 'alpha-vantage', providerSymbol: 'HYG',  sourceName: 'iShares iBoxx High Yield Corporate Bond ETF', classification: 'EXACT',                                                                       rthOnly: true },
  BTC:    { key: 'BTC',    pineSymbol: 'BITSTAMP:BTCUSD', provider: 'coingecko',    providerSymbol: 'bitcoin', sourceName: 'CoinGecko BTC/USD (aggregated)', classification: 'ALTERNATIVE', reason: 'CoinGecko aggregate vs. Bitstamp venue.', rthOnly: false },
  GOLD:   { key: 'GOLD',   pineSymbol: 'OANDA:XAUUSD',   provider: 'alpha-vantage', providerSymbol: 'GLD',  sourceName: 'SPDR Gold Shares (GLD)',       classification: 'PROXY',       reason: 'OANDA spot gold not on Alpha Vantage — GLD ETF proxy.', rthOnly: false },
  COPPER: { key: 'COPPER', pineSymbol: 'COMEX:HG1!',     provider: 'alpha-vantage', providerSymbol: 'CPER', sourceName: 'US Copper Index Fund (CPER)',  classification: 'PROXY',       reason: 'Copper futures (HG1!) not on Alpha Vantage — CPER ETF proxy.', rthOnly: false },
};

/**
 * NQ target mapping. This is intentionally SEPARATE from the leader map so the
 * caller can choose whether to enable a diagnostic proxy — §6 forbids silent
 * substitution of QQQ for NQ.
 */
export interface LeadLagTargetMapping {
  pineSymbol: 'NQ1!' | 'MNQ1!';
  provider: LeadLagProvider;
  providerSymbol: string;
  sourceName: string;
  classification: LeadLagSourceClass | 'UNAVAILABLE';
  reason: string;
}

export const LEADLAG_TARGET_UNAVAILABLE: LeadLagTargetMapping = {
  pineSymbol: 'NQ1!',
  provider: 'unavailable',
  providerSymbol: '',
  sourceName: 'CME NQ / MNQ futures',
  classification: 'UNAVAILABLE',
  reason:
    'MATERIAL BLOCKER (§6): NQ/MNQ futures 5-minute bars are not licensed on '
    + 'Alpha Vantage / FRED / CoinGecko. A real futures feed (CQG, Databento, '
    + 'Polygon Futures, TradingView Prime, or CME direct) is required for full '
    + 'target fidelity.',
};

/**
 * Diagnostic-only proxy target — must be enabled via an explicit flag; the
 * classification is PROXY, never EXACT. §6 requires callers to opt in.
 */
export const LEADLAG_TARGET_QQQ_PROXY: LeadLagTargetMapping = {
  pineSymbol: 'NQ1!',
  provider: 'alpha-vantage',
  providerSymbol: 'QQQ',
  sourceName: 'Invesco QQQ Trust (used as NQ proxy — DIAGNOSTIC ONLY)',
  classification: 'PROXY',
  reason:
    'DIAGNOSTIC-ONLY substitution for NQ target. QQQ tracks the NDX cash index, '
    + 'not the NQ futures contract — session, roll, and after-hours behaviour '
    + 'differ materially. Must be enabled by an explicit flag; never silent.',
};

/* ── Fetcher contract ─────────────────────────────────────────────────────── */

/**
 * Provider-agnostic 5-minute fetcher contract. Live implementations (Alpha
 * Vantage / CoinGecko) live in the service module; tests inject stubs.
 */
export interface LeadLag5mFetchers {
  /** Fetch 5m bars for an Alpha Vantage equity/ETF symbol. */
  alphaVantage: (providerSymbol: string) => Promise<LeadLag5mSeries>;
  /** Fetch 5m bars for a CoinGecko coin id (e.g. 'bitcoin'). */
  coingecko: (coinId: string) => Promise<LeadLag5mSeries>;
}

export interface LeadLag5mLoad {
  /** Per-asset series (may be null when provider marks UNAVAILABLE). */
  series: Partial<Record<LeadLagAssetKey, LeadLag5mSeries>>;
  /** Target NQ series (or its diagnostic proxy). */
  target: LeadLag5mSeries;
  targetMapping: LeadLagTargetMapping;
  providersUsed: LeadLagProvider[];
  missingKeys: LeadLagAssetKey[];
  errors: { key: LeadLagAssetKey | 'NQ_TARGET'; error: string }[];
}

/* ── Loader ───────────────────────────────────────────────────────────────── */

/**
 * Load 5-minute series for the 11 leaders + NQ target in parallel. Never
 * throws — provider errors are captured per-key. UNAVAILABLE leaders never
 * hit the network; they short-circuit to an explicit DATA_UNAVAILABLE row.
 */
export async function loadLeadLag5mSeries(
  fetchers: LeadLag5mFetchers,
  opts?: { enableQqqTargetProxy?: boolean },
): Promise<LeadLag5mLoad> {
  const keys = Object.keys(LEADLAG_PROVIDER_MAP) as LeadLagAssetKey[];
  const providers = new Set<LeadLagProvider>();
  const errors: LeadLag5mLoad['errors'] = [];
  const missing: LeadLagAssetKey[] = [];
  const series: Partial<Record<LeadLagAssetKey, LeadLag5mSeries>> = {};

  await Promise.all(
    keys.map(async (k) => {
      const map = LEADLAG_PROVIDER_MAP[k];
      if (map.provider === 'unavailable') {
        series[k] = {
          key: k, bars: null, provider: 'unavailable', status: 'DATA_UNAVAILABLE',
          error: map.reason,
        };
        missing.push(k);
        errors.push({ key: k, error: map.reason ?? 'unavailable' });
        return;
      }
      let r: LeadLag5mSeries;
      try {
        r = map.provider === 'coingecko'
          ? await fetchers.coingecko(map.providerSymbol)
          : await fetchers.alphaVantage(map.providerSymbol);
        r.key = k;
      } catch (e) {
        r = {
          key: k, bars: null, provider: map.provider, status: 'PROVIDER_UNREACHABLE',
          error: e instanceof Error ? e.message : 'fetch-failed',
        };
      }
      series[k] = r;
      if (r.bars && r.bars.length > 0) providers.add(map.provider);
      if (!r.bars || r.bars.length === 0) {
        missing.push(k);
        errors.push({ key: k, error: r.error ?? r.status });
      }
    }),
  );

  // Target: only the QQQ proxy is currently fetchable; the true NQ target is
  // always UNAVAILABLE per §6 until a futures feed is wired.
  let target: LeadLag5mSeries;
  let targetMapping: LeadLagTargetMapping;
  if (opts?.enableQqqTargetProxy) {
    targetMapping = LEADLAG_TARGET_QQQ_PROXY;
    try {
      const r = await fetchers.alphaVantage(LEADLAG_TARGET_QQQ_PROXY.providerSymbol);
      target = { ...r, key: 'NQ_TARGET' };
      if (target.bars && target.bars.length > 0) providers.add('alpha-vantage');
    } catch (e) {
      target = {
        key: 'NQ_TARGET', bars: null, provider: 'alpha-vantage', status: 'PROVIDER_UNREACHABLE',
        error: e instanceof Error ? e.message : 'fetch-failed',
      };
    }
    if (!target.bars || target.bars.length === 0) {
      errors.push({ key: 'NQ_TARGET', error: target.error ?? target.status });
    }
  } else {
    targetMapping = LEADLAG_TARGET_UNAVAILABLE;
    target = {
      key: 'NQ_TARGET', bars: null, provider: 'unavailable', status: 'DATA_UNAVAILABLE',
      error: LEADLAG_TARGET_UNAVAILABLE.reason,
    };
    errors.push({ key: 'NQ_TARGET', error: LEADLAG_TARGET_UNAVAILABLE.reason });
  }

  return {
    series,
    target,
    targetMapping,
    providersUsed: [...providers],
    missingKeys: missing,
    errors,
  };
}
