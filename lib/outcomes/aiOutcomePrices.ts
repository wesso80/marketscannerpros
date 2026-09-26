/**
 * Price lookups for the AI outcome labeller. Every Alpha Vantage call goes through the shared rate governor
 * (avFetch). Failures return null so the caller leaves the row unlabelled for the next run; nothing here ever
 * substitutes a different price.
 *
 * Entitlement: US equities are 15-min delayed per the site rule, so equity intraday calls ask for
 * `entitlement=delayed` by default (override with AI_OUTCOME_AV_ENTITLEMENT = delayed | realtime | none). If Alpha
 * Vantage answers that the key is not entitled, the call is retried once without the parameter (historical /
 * end-of-day data, which is enough to measure horizons that have already passed) and the downgrade is remembered
 * for a few hours so each run wastes at most one call on it. Daily bars come from the shared lib/marketData cache.
 */
import { avFetch } from '@/lib/avRateGovernor';
import { getBars } from '@/lib/marketData';
import {
  equityDailyToPriceBars,
  horizonTargetMs,
  normalizeCryptoSymbol,
  parseAvCryptoDailyBars,
  parseAvIntradayBars,
  priceAtOrAfter,
  type HorizonPrice,
  type OutcomeAssetClass,
  type OutcomeHorizon,
  type PriceBar,
} from './aiOutcomeLabel';

const AV_BASE = 'https://www.alphavantage.co/query';
const INTRADAY_INTERVAL_MIN = 60;
const DOWNGRADE_MS = 6 * 60 * 60 * 1000;

export type AvEntitlement = 'delayed' | 'realtime' | 'none';

let entitlementDowngradedUntil = 0;

/** Test hook: forget a remembered entitlement downgrade. */
export function resetEntitlementDowngrade(): void {
  entitlementDowngradedUntil = 0;
}

export function configuredEntitlement(): AvEntitlement {
  const raw = String(process.env.AI_OUTCOME_AV_ENTITLEMENT ?? '').trim().toLowerCase();
  if (raw === 'realtime' || raw === 'none') return raw;
  return 'delayed';
}

export function isEntitlementError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /entitle/i.test(msg);
}

function apiKey(): string | null {
  const k = process.env.ALPHA_VANTAGE_API_KEY;
  return k ? k : null;
}

function equityIntradayUrl(symbol: string, key: string, entitlement: AvEntitlement): string {
  const ent = entitlement === 'none' ? '' : `&entitlement=${entitlement}`;
  return `${AV_BASE}?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${INTRADAY_INTERVAL_MIN}min`
    + `&outputsize=compact&extended_hours=false${ent}&apikey=${encodeURIComponent(key)}`;
}

/** 60-min regular-session bars (~15 sessions). null on any failure. */
export async function fetchEquityIntradayBars(symbol: string, nowMs = Date.now()): Promise<PriceBar[] | null> {
  const key = apiKey();
  if (!key) return null;
  const wanted = configuredEntitlement();
  const entitlement: AvEntitlement = wanted !== 'none' && nowMs < entitlementDowngradedUntil ? 'none' : wanted;
  try {
    let json: unknown;
    try {
      json = await avFetch(equityIntradayUrl(symbol, key, entitlement), `OUTCOME INTRADAY ${symbol}`);
    } catch (err) {
      if (entitlement === 'none' || !isEntitlementError(err)) throw err;
      entitlementDowngradedUntil = nowMs + DOWNGRADE_MS;
      console.warn(`[label-ai-outcomes] AV key not entitled to entitlement=${entitlement}; using historical data without it`);
      json = await avFetch(equityIntradayUrl(symbol, key, 'none'), `OUTCOME INTRADAY ${symbol} (no entitlement)`);
    }
    if (!json) return null;
    const bars = parseAvIntradayBars(json, INTRADAY_INTERVAL_MIN, 'NY');
    return bars.length ? bars : null;
  } catch (err) {
    console.warn(`[label-ai-outcomes] intraday fetch failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Daily bars from the shared market-data cache (Redis → Postgres → AV). null on any failure. */
export async function fetchEquityDailyBars(symbol: string): Promise<PriceBar[] | null> {
  if (!apiKey()) return null;
  try {
    const env = await getBars(symbol, 'daily');
    const bars = env.data ? equityDailyToPriceBars(env.data) : [];
    return bars.length ? bars : null;
  } catch (err) {
    console.warn(`[label-ai-outcomes] daily fetch failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function fetchCryptoIntradayBars(symbol: string): Promise<PriceBar[] | null> {
  const key = apiKey();
  if (!key) return null;
  const sym = normalizeCryptoSymbol(symbol);
  try {
    const url = `${AV_BASE}?function=CRYPTO_INTRADAY&symbol=${encodeURIComponent(sym)}&market=USD&interval=${INTRADAY_INTERVAL_MIN}min&outputsize=compact&apikey=${encodeURIComponent(key)}`;
    const json = await avFetch(url, `OUTCOME CRYPTO_INTRADAY ${sym}`);
    if (!json) return null;
    const bars = parseAvIntradayBars(json, INTRADAY_INTERVAL_MIN, 'UTC');
    return bars.length ? bars : null;
  } catch (err) {
    console.warn(`[label-ai-outcomes] crypto intraday fetch failed for ${sym}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function fetchCryptoDailyBars(symbol: string): Promise<PriceBar[] | null> {
  const key = apiKey();
  if (!key) return null;
  const sym = normalizeCryptoSymbol(symbol);
  try {
    const url = `${AV_BASE}?function=DIGITAL_CURRENCY_DAILY&symbol=${encodeURIComponent(sym)}&market=USD&apikey=${encodeURIComponent(key)}`;
    const json = await avFetch(url, `OUTCOME CRYPTO_DAILY ${sym}`);
    if (!json) return null;
    const bars = parseAvCryptoDailyBars(json);
    return bars.length ? bars : null;
  } catch (err) {
    console.warn(`[label-ai-outcomes] crypto daily fetch failed for ${sym}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export interface BarFetchers {
  equityIntraday: (symbol: string) => Promise<PriceBar[] | null>;
  equityDaily: (symbol: string) => Promise<PriceBar[] | null>;
  cryptoIntraday: (symbol: string) => Promise<PriceBar[] | null>;
  cryptoDaily: (symbol: string) => Promise<PriceBar[] | null>;
}

export const defaultBarFetchers: BarFetchers = {
  equityIntraday: (s) => fetchEquityIntradayBars(s),
  equityDaily: fetchEquityDailyBars,
  cryptoIntraday: fetchCryptoIntradayBars,
  cryptoDaily: fetchCryptoDailyBars,
};

export interface ResolvedHorizonPrice extends HorizonPrice {
  source: 'intraday' | 'daily';
}

/**
 * Per-run resolver: each symbol's bars are fetched at most once per resolution. Intraday (60-min) bars are used
 * first; the 24h horizon may fall back to daily closes. The 4h horizon is intraday-only (a daily close is too coarse
 * to stand in for a 4-hour result), so it waits for intraday data instead.
 */
export function createHorizonPriceResolver(nowMs: number, fetchers: BarFetchers = defaultBarFetchers) {
  const memo = new Map<string, Promise<PriceBar[] | null>>();
  /** Distinct bar fetches this run (≈ provider calls: intraday = one AV call; daily may come from the cache). */
  const counts = { intraday: 0, daily: 0 };
  const load = (kind: keyof BarFetchers, symbol: string) => {
    const k = `${kind}:${symbol}`;
    let p = memo.get(k);
    if (!p) {
      if (kind === 'equityIntraday' || kind === 'cryptoIntraday') counts.intraday += 1;
      else counts.daily += 1;
      p = fetchers[kind](symbol).catch(() => null);
      memo.set(k, p);
    }
    return p;
  };

  const resolve = async function resolve(
    symbol: string,
    assetClass: OutcomeAssetClass,
    signalAtMs: number,
    horizon: OutcomeHorizon,
  ): Promise<ResolvedHorizonPrice | null> {
    const target = horizonTargetMs(signalAtMs, horizon);
    if (target > nowMs) return null;
    const intraday = await load(assetClass === 'crypto' ? 'cryptoIntraday' : 'equityIntraday', symbol);
    const fromIntraday = intraday ? priceAtOrAfter(intraday, target, nowMs) : null;
    if (fromIntraday) return { ...fromIntraday, source: 'intraday' };
    if (horizon !== '24h') return null;
    const daily = await load(assetClass === 'crypto' ? 'cryptoDaily' : 'equityDaily', symbol);
    const fromDaily = daily ? priceAtOrAfter(daily, target, nowMs) : null;
    return fromDaily ? { ...fromDaily, source: 'daily' } : null;
  };
  return Object.assign(resolve, {
    /** Bar fetches started so far this run, by kind. */
    fetchCounts: () => ({ ...counts }),
    /** True when this symbol's bars for the horizon's first lookup are already loaded (costs no new call). */
    hasLoaded: (symbol: string, assetClass: OutcomeAssetClass) =>
      memo.has(`${assetClass === 'crypto' ? 'cryptoIntraday' : 'equityIntraday'}:${symbol}`),
  });
}
