/**
 * One short-lived cache for raw Alpha Vantage option chains, shared by every route that needs a
 * whole chain (Options Scanner analyzer + strike picker, expiry dropdown, Golden Egg / DVE, the
 * Intraday Charts GEX estimate, the Options Terminal on a miss).
 *
 * Before this, the same symbol's chain was downloaded 2-3 times per screen and two routes wrote
 * different shapes under the same Redis key. Now:
 *  - rows are always requested with require_greeks=true (one shape every caller can use);
 *  - kept in process memory and in Redis under `opt:raw:SYM` for CHAIN_CACHE_TTL_SECONDS;
 *  - concurrent requests for the same symbol share one in-flight download.
 * Alpha Vantage's artificial "premium endpoint" sample chain is never cached (usableOptionRows).
 *
 * Quote quality: REALTIME_OPTIONS_FMV returns fair-market-value marks, not a quoted market — its rows come back
 * without usable bid/ask, so a chain built from it has 0% two-sided quotes and the Options Terminal showed no
 * strikes at all. The default order is now REALTIME_OPTIONS (live bid/ask + greeks) → HISTORICAL_OPTIONS
 * (previous session close, bid/ask + IV). A realtime chain with too little two-sided coverage is held back and
 * the previous-session chain is used instead when it is better quoted; it is labelled quoteBasis
 * 'previous_session' with its as-of date. FMV marks are only ever used as marks (last resort).
 */
import { usableOptionRows } from '@/lib/options/avChain';
import { getCached, setCached } from '@/lib/redis';

export type AvChainFunction = 'REALTIME_OPTIONS_FMV' | 'REALTIME_OPTIONS' | 'HISTORICAL_OPTIONS';

export type ChainQuoteBasis = 'realtime' | 'previous_session' | 'marks_only';

export interface SharedOptionsChain<T = Record<string, any>> {
  rows: T[];
  provider: AvChainFunction;
  /** Share (0..1) of contracts with a valid two-sided quote (bid > 0, ask >= bid). */
  quoteCoverage: number;
  /** realtime = live quoted chain; previous_session = HISTORICAL_OPTIONS close; marks_only = no usable bid/ask. */
  quoteBasis: ChainQuoteBasis;
  /** Newest per-contract `date` (YYYY-MM-DD) — the session the quotes belong to. */
  asOfDate: string | null;
  /** Top-level date fields from the AV payload (used for data-date detection). */
  payloadMeta: { date?: string; lastRefreshed?: string; last_refreshed?: string };
  fetchedAt: number;
  warnings: string[];
  cacheHit: boolean;
}

/** Fetches one AV payload. Throw or return null to move on to the next provider. */
export type ChainPayloadFetcher = (fn: AvChainFunction, url: string) => Promise<any>;

export const CHAIN_CACHE_TTL_SECONDS = 120;
/** Below this share of two-sided quotes a realtime chain is not treated as a quoted market. */
export const MIN_TWO_SIDED_QUOTE_COVERAGE = 0.25;
/** After Alpha Vantage answers a realtime function with its "not entitled" sample, skip it for this long. */
const NOT_ENTITLED_SKIP_MS = 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 12;

export const optionsRawChainKey = (symbol: string) => `opt:raw:${symbol.trim().toUpperCase()}`;

type ChainValue = Omit<SharedOptionsChain, 'cacheHit' | 'warnings'>;
type MemoryEntry = { value: ChainValue; expires: number };
// Kept on globalThis so every module instance (dev HMR, test module resets) shares one process cache.
const store = globalThis as typeof globalThis & {
  __mspOptionsChainMemory?: Map<string, MemoryEntry>;
  __mspOptionsChainInflight?: Map<string, Promise<SharedOptionsChain | null>>;
  __mspOptionsProviderSkip?: Map<AvChainFunction, number>;
};
const memory = (store.__mspOptionsChainMemory ??= new Map<string, MemoryEntry>());
const inflight = (store.__mspOptionsChainInflight ??= new Map<string, Promise<SharedOptionsChain | null>>());
const providerSkip = (store.__mspOptionsProviderSkip ??= new Map<AvChainFunction, number>());

export function clearSharedOptionsChainCache(): void {
  memory.clear();
  inflight.clear();
  providerSkip.clear();
}

/** REALTIME_OPTIONS (quoted, with greeks) first, previous-session HISTORICAL_OPTIONS as the fallback. */
export function defaultChainProviders(): AvChainFunction[] {
  const realtime = (process.env.AV_OPTIONS_REALTIME_ENABLED ?? 'true').toLowerCase() !== 'false';
  return realtime ? ['REALTIME_OPTIONS', 'HISTORICAL_OPTIONS'] : ['HISTORICAL_OPTIONS'];
}

function quoteNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** True when an AV row carries a real two-sided quote. AV sends numbers as strings; missing/"0.00" = no quote. */
export function hasTwoSidedQuote(row: { bid?: unknown; ask?: unknown } | null | undefined): boolean {
  const bid = quoteNum(row?.bid);
  const ask = quoteNum(row?.ask);
  return bid > 0 && ask >= bid;
}

/** Share (0..1) of rows with a valid two-sided quote. */
export function twoSidedQuoteCoverage(rows: Array<{ bid?: unknown; ask?: unknown }>): number {
  if (!rows.length) return 0;
  let quoted = 0;
  for (const r of rows) if (hasTwoSidedQuote(r)) quoted++;
  return quoted / rows.length;
}

/** Newest valid per-contract `date` (AV puts the session date on each row, not on the payload). */
export function chainAsOfDate(rows: Array<{ date?: unknown }>, meta?: { date?: unknown }): string | null {
  const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/.test(v) ? v.slice(0, 10) : null);
  let newest = ymd(meta?.date);
  for (const r of rows) {
    const d = ymd(r?.date);
    if (d && (!newest || d > newest)) newest = d;
  }
  return newest;
}

function quoteBasisFor(provider: AvChainFunction, coverage: number): ChainQuoteBasis {
  if (coverage < MIN_TWO_SIDED_QUOTE_COVERAGE) return 'marks_only';
  return provider === 'HISTORICAL_OPTIONS' ? 'previous_session' : 'realtime';
}

/** Human label for UIs: source + as-of. */
export function describeChainSource(chain: Pick<SharedOptionsChain, 'provider' | 'quoteBasis' | 'asOfDate'>): string {
  const asOf = chain.asOfDate ? ` (as of ${chain.asOfDate})` : '';
  if (chain.quoteBasis === 'previous_session') return `Alpha Vantage HISTORICAL_OPTIONS — previous session close${asOf}`;
  if (chain.quoteBasis === 'realtime') return `Alpha Vantage ${chain.provider} — live bid/ask${asOf}`;
  return `Alpha Vantage ${chain.provider} — marks only, no usable bid/ask${asOf}`;
}

/** Fills quote fields on values cached before they existed. */
function withQuoteFields(v: Omit<ChainValue, 'quoteCoverage' | 'quoteBasis' | 'asOfDate'> & Partial<ChainValue>): ChainValue {
  const quoteCoverage = typeof v.quoteCoverage === 'number' ? v.quoteCoverage : twoSidedQuoteCoverage(v.rows as any[]);
  return {
    ...v,
    quoteCoverage,
    quoteBasis: v.quoteBasis ?? quoteBasisFor(v.provider, quoteCoverage),
    asOfDate: v.asOfDate !== undefined ? v.asOfDate : chainAsOfDate(v.rows as any[], v.payloadMeta),
  };
}

function fromMemory(key: string) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

function remember(key: string, value: ChainValue) {
  memory.delete(key);
  memory.set(key, { value, expires: value.fetchedAt + CHAIN_CACHE_TTL_SECONDS * 1000 });
  while (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/**
 * Returns the full (all expiries) chain for `symbol`, or null when no provider returned real contracts.
 * `providers` is only the download order on a cache miss; a cached chain from any provider is returned.
 */
export async function fetchSharedOptionsChain<T = Record<string, any>>(
  symbol: string,
  opts: {
    apiKey: string;
    fetchPayload: ChainPayloadFetcher;
    providers?: AvChainFunction[];
    /** Receives one plain-English line per provider that was skipped (no secrets), for API diagnostics. */
    issues?: string[];
  },
): Promise<SharedOptionsChain<T> | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym || !opts.apiKey) return null;
  const key = optionsRawChainKey(sym);

  const mem = fromMemory(key);
  if (mem) return { ...(mem as any), warnings: ['cache_hit'], cacheHit: true };

  const pending = inflight.get(key);
  if (pending) {
    const shared = await pending;
    return shared ? { ...(shared as any), cacheHit: true } : null;
  }

  const task = (async (): Promise<SharedOptionsChain | null> => {
    try {
      const cached = await getCached<ChainValue>(key);
      if (cached && Array.isArray(cached.rows) && cached.rows.length > 0 && Date.now() - Number(cached.fetchedAt || 0) < CHAIN_CACHE_TTL_SECONDS * 1000) {
        const value = withQuoteFields({ ...cached, payloadMeta: cached.payloadMeta || {} });
        remember(key, value);
        return { ...value, warnings: ['cache_hit'], cacheHit: true };
      }
    } catch { /* Redis optional */ }

    const warnings: string[] = [];
    const issue = (text: string) => { opts.issues?.push(text); };
    const finish = async (value: ChainValue): Promise<SharedOptionsChain> => {
      remember(key, value);
      try { await setCached(key, value, CHAIN_CACHE_TTL_SECONDS); } catch { /* Redis optional */ }
      return { ...value, warnings, cacheHit: false };
    };
    // A realtime chain whose rows have (almost) no bid/ask — e.g. REALTIME_OPTIONS_FMV marks, or pre-market.
    let thinRealtime: ChainValue | null = null;

    for (const fn of opts.providers ?? defaultChainProviders()) {
      const skipUntil = providerSkip.get(fn);
      if (skipUntil && skipUntil > Date.now()) {
        warnings.push(`${fn}:skipped_not_entitled`);
        issue(`${fn}: skipped (recently answered "not entitled" for this API key)`);
        continue;
      }
      const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(sym)}&require_greeks=true&apikey=${opts.apiKey}`;
      let payload: any;
      try {
        payload = await opts.fetchPayload(fn, url);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`${fn}:fetch_failed`);
        issue(`${fn}: ${message.slice(0, 200)}`);
        if (fn !== 'HISTORICAL_OPTIONS' && /premium endpoint|not entitled|entitlement/i.test(message) && !/rate limit|requests per|quota/i.test(message)) providerSkip.set(fn, Date.now() + NOT_ENTITLED_SKIP_MS);
        console.warn(`[optionsChain] ${fn} ${sym} unavailable: ${message.slice(0, 200)}`);
        continue;
      }
      if (!payload) {
        warnings.push(`${fn}:no_data`);
        issue(`${fn}: no contracts returned`);
        continue;
      }
      const rows = usableOptionRows(payload, sym);
      if (!rows) {
        const sample = Array.isArray(payload?.data) && payload.data.length > 0;
        warnings.push(sample ? `${fn}:not_entitled_sample_data` : `${fn}:empty_data`);
        issue(`${fn}: ${sample ? 'artificial sample / wrong-symbol chain (API key not entitled to this endpoint)' : 'no contracts returned'}`);
        if (sample && fn !== 'HISTORICAL_OPTIONS') providerSkip.set(fn, Date.now() + NOT_ENTITLED_SKIP_MS);
        continue;
      }
      const payloadMeta = { date: payload?.date, lastRefreshed: payload?.lastRefreshed, last_refreshed: payload?.last_refreshed };
      const quoteCoverage = twoSidedQuoteCoverage(rows);
      const value: ChainValue = {
        rows,
        provider: fn,
        payloadMeta,
        fetchedAt: Date.now(),
        quoteCoverage,
        quoteBasis: quoteBasisFor(fn, quoteCoverage),
        asOfDate: chainAsOfDate(rows, payloadMeta),
      };

      if (fn !== 'HISTORICAL_OPTIONS' && quoteCoverage < MIN_TWO_SIDED_QUOTE_COVERAGE) {
        warnings.push(`${fn}:low_quote_coverage_${Math.round(quoteCoverage * 100)}pct`);
        issue(`${fn}: only ${Math.round(quoteCoverage * 100)}% of contracts have a two-sided bid/ask`);
        if (!thinRealtime || quoteCoverage > thinRealtime.quoteCoverage) thinRealtime = value;
        continue;
      }
      if (fn === 'HISTORICAL_OPTIONS' && thinRealtime && quoteCoverage <= thinRealtime.quoteCoverage) {
        // The previous session is no better quoted than the live chain: keep the live one.
        warnings.push(`${fn}:not_better_quoted`);
        return finish(thinRealtime);
      }
      if (fn === 'HISTORICAL_OPTIONS' && thinRealtime) warnings.push(`${fn}:used_for_quotes_previous_session`);
      return finish(value);
    }
    if (thinRealtime) {
      console.warn(`[optionsChain] ${sym}: only a marks-only chain (${thinRealtime.provider}) is available: ${warnings.join(', ')}`);
      return finish(thinRealtime);
    }
    console.warn(`[optionsChain] no usable chain for ${sym}: ${warnings.join(', ')}`);
    return null;
  })();

  inflight.set(key, task);
  try {
    return (await task) as SharedOptionsChain<T> | null;
  } finally {
    inflight.delete(key);
  }
}
