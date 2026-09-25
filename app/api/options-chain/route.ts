/**
 * Options Chain API — /api/options-chain
 *
 * Returns the full options chain for a symbol with Greeks, IV, OI, volume.
 * Designed for the Options Terminal page.
 *
 * Query params:
 *   symbol      — required ticker (e.g. AAPL)
 *   expiration  — optional ISO date filter (e.g. 2026-03-20)
 *
 * Data source: shared chain (lib/options/chainCache) — Alpha Vantage REALTIME_OPTIONS (live bid/ask + greeks),
 * falling back to HISTORICAL_OPTIONS (previous session close) when the live chain has too few two-sided quotes.
 * Caching: Redis 120s by ticker, filtered client-side by expiration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { avFetch } from '@/lib/avRateGovernor';
import { checkOptionsAccess } from '@/lib/options/access';
import { describeChainSource, fetchSharedOptionsChain, type ChainQuoteBasis } from '@/lib/options/chainCache';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

/* ── Alpha Vantage raw row shape ─────────────────────────────────── */
interface AVRaw {
  contractID?: string;
  symbol?: string;
  expiration?: string;
  strike?: string;
  type?: string;          // "call" | "put"
  last?: string;
  mark?: string;
  bid?: string;
  bid_size?: string;
  ask?: string;
  ask_size?: string;
  volume?: string;
  open_interest?: string;
  date?: string;
  implied_volatility?: string;
  delta?: string;
  gamma?: string;
  theta?: string;
  vega?: string;
  rho?: string;
  in_the_money?: string;  // "TRUE" | "FALSE"
}

/* ── Normalised contract we send to the client ───────────────────── */
export interface OptionsContract {
  contractId: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  mark: number;
  last: number;
  volume: number;
  openInterest: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  itm: boolean;
  spread: number;
  spreadPct: number;
}

export interface OptionsChainResponse {
  success: boolean;
  symbol: string;
  underlyingPrice: number;
  expirations: ExpirationMeta[];
  contracts: OptionsContract[];
  provider: string;
  /** realtime = live bid/ask; previous_session = HISTORICAL_OPTIONS close; marks_only = no usable bid/ask. */
  quoteBasis?: ChainQuoteBasis;
  /** Session date the quotes belong to (YYYY-MM-DD). */
  asOfDate?: string | null;
  /** Share (0-100) of contracts in the whole chain with a two-sided quote. */
  quoteCoveragePct?: number;
  /** Plain-English source + as-of label. */
  sourceLabel?: string;
  cachedAt: number;
  error?: string;
  /** Why each Alpha Vantage options function returned nothing usable (no secrets). */
  providerIssues?: string[];
}

export interface ExpirationMeta {
  date: string;
  dte: number;
  label: string;
  calls: number;
  puts: number;
  totalOI: number;
}

type SourceMeta = Pick<OptionsChainResponse, 'quoteBasis' | 'asOfDate' | 'quoteCoveragePct' | 'sourceLabel'>;

/* ── Helpers ──────────────────────────────────────────────────────── */
function num(v: string | number | undefined, fallback = 0): number {
  if (v === undefined || v === '' || v === 'None' || v === 'none') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function normalise(raw: AVRaw): OptionsContract | null {
  const strike = num(raw.strike);
  if (!strike || !raw.expiration || !raw.type) return null;

  const bid = num(raw.bid);
  const ask = num(raw.ask);
  const mark = num(raw.mark) || (bid + ask) / 2;
  const spread = Math.abs(ask - bid);
  const mid = (ask + bid) / 2 || 1;

  return {
    contractId: raw.contractID || `${raw.symbol}_${raw.expiration}_${strike}_${raw.type}`,
    expiration: raw.expiration,
    strike,
    type: raw.type?.toLowerCase() === 'put' ? 'put' : 'call',
    bid,
    ask,
    mark,
    last: num(raw.last) || mark,
    volume: num(raw.volume),
    openInterest: num(raw.open_interest),
    iv: num(raw.implied_volatility),
    delta: num(raw.delta),
    gamma: num(raw.gamma),
    theta: num(raw.theta),
    vega: num(raw.vega),
    rho: num(raw.rho),
    itm: raw.in_the_money?.toUpperCase() === 'TRUE',
    spread,
    spreadPct: mid > 0 ? (spread / mid) * 100 : 0,
  };
}

function marketDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isCurrentOrFutureExpiry(expiration: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(expiration) && expiration >= marketDateKey();
}

function computeExpirations(contracts: OptionsContract[]): ExpirationMeta[] {
  const todayKey = marketDateKey();
  const today = new Date(`${todayKey}T00:00:00Z`);

  const map = new Map<string, { calls: number; puts: number; totalOI: number }>();
  for (const c of contracts) {
    if (!isCurrentOrFutureExpiry(c.expiration)) continue;
    const s = map.get(c.expiration) || { calls: 0, puts: 0, totalOI: 0 };
    if (c.type === 'call') s.calls++;
    else s.puts++;
    s.totalOI += c.openInterest;
    map.set(c.expiration, s);
  }

  return Array.from(map.entries())
    .map(([date, s]) => {
      const d = new Date(date);
      const dte = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` (${dte} DTE)`;
      return { date, dte, label, ...s };
    })
    .filter((e) => e.dte >= 0)
    .sort((a, b) => a.dte - b.dte);
}

/**
 * Fetch the real underlying price via Alpha Vantage GLOBAL_QUOTE.
 * Falls back to inferring from the options chain if the quote fails.
 */
async function fetchSpot(symbol: string): Promise<number> {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&entitlement=realtime&apikey=${AV_KEY}`;
    const data = await avFetch<Record<string, any>>(url, `GLOBAL_QUOTE ${symbol}`);
    const gq = data?.['Global Quote'] ?? data?.['Global Quote - DATA DELAYED BY 15 MINUTES'];
    const price = parseFloat(gq?.['05. price']);
    if (price > 0) return price;
  } catch (e) {
    console.warn('[options-chain] GLOBAL_QUOTE failed for', symbol, e);
  }
  return 0;
}

function inferSpot(contracts: OptionsContract[]): number {
  // Find the ATM strike where call delta ≈ 0.50
  const nearAtm = contracts
    .filter((c) => c.type === 'call' && c.delta > 0.35 && c.delta < 0.65)
    .sort((a, b) => Math.abs(a.delta - 0.5) - Math.abs(b.delta - 0.5));

  if (nearAtm.length) return nearAtm[0].strike;

  // fallback: mid of highest OI call and put
  const maxCallOI = contracts.filter((c) => c.type === 'call').sort((a, b) => b.openInterest - a.openInterest)[0];
  const maxPutOI = contracts.filter((c) => c.type === 'put').sort((a, b) => b.openInterest - a.openInterest)[0];
  if (maxCallOI && maxPutOI) return (maxCallOI.strike + maxPutOI.strike) / 2;
  return contracts[0]?.strike ?? 0;
}

/* ── Main handler ────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
  const access = await checkOptionsAccess(request);
  if (!access.ok) {
    return access.status === 401
      ? NextResponse.json({ success: false, error: 'Please log in to access the Options Terminal' } as Partial<OptionsChainResponse>, { status: 401 })
      : NextResponse.json({ success: false, error: 'Options Terminal requires a Pro subscription' } as Partial<OptionsChainResponse>, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawSymbol = searchParams.get('symbol');
  const expirationFilter = searchParams.get('expiration') || undefined;

  if (!rawSymbol) {
    return NextResponse.json({ success: false, error: 'Symbol is required' } as Partial<OptionsChainResponse>, { status: 400 });
  }

  if (!AV_KEY) {
    return NextResponse.json({ success: false, error: 'Market data API not configured' } as Partial<OptionsChainResponse>, { status: 500 });
  }

  const symbol = rawSymbol.toUpperCase().trim();

  try {
    /* ── 1. Check cache ──────────────────────────────────────────── */
    // v2: entries written before the quote-source fix (FMV marks, no bid/ask) are ignored.
    const cacheKey = `${CACHE_KEYS.optionsChain(symbol)}:v2`;
    type CachedChain = { contracts: OptionsContract[]; provider: string; spot: number; ts: number; source: SourceMeta };
    const cached = await getCached<CachedChain>(cacheKey);

    if (cached && cached.contracts?.length) {
      const eligibleCachedContracts = cached.contracts.filter((c) => isCurrentOrFutureExpiry(c.expiration));
      const contracts = expirationFilter
        ? eligibleCachedContracts.filter((c) => c.expiration === expirationFilter)
        : eligibleCachedContracts;
      if (contracts.length) {
        return NextResponse.json({
          success: true,
          symbol,
          underlyingPrice: cached.spot,
          expirations: computeExpirations(cached.contracts), // always full list
          contracts,
          provider: cached.provider,
          ...cached.source,
          cachedAt: cached.ts,
        } satisfies OptionsChainResponse);
      }
    }

    /* ── 2. Fetch (shared raw-chain cache → Alpha Vantage) ───────── */
    const providerIssues: string[] = [];
    const shared = await fetchSharedOptionsChain<AVRaw>(symbol, {
      apiKey: AV_KEY,
      fetchPayload: (fn, url) => avFetch<{ data?: AVRaw[] }>(url, `${fn} ${symbol}`),
      issues: providerIssues,
    });
    const allContracts: OptionsContract[] = shared ? (shared.rows.map(normalise).filter(Boolean) as OptionsContract[]) : [];
    const usedProvider = shared && allContracts.length ? shared.provider : 'none';
    const source: SourceMeta = shared
      ? {
          quoteBasis: shared.quoteBasis,
          asOfDate: shared.asOfDate,
          quoteCoveragePct: Math.round(shared.quoteCoverage * 100),
          sourceLabel: describeChainSource(shared),
        }
      : {};

    if (!allContracts.length) {
      return NextResponse.json({
        success: false,
        symbol,
        underlyingPrice: 0,
        expirations: [],
        contracts: [],
        provider: 'none',
        cachedAt: 0,
        error: 'No options data available for this symbol',
        providerIssues,
      } satisfies OptionsChainResponse, { status: 404 });
    }

    /* ── 3. Compute spot & cache ─────────────────────────────────── */
    const spot = (await fetchSpot(symbol)) || inferSpot(allContracts);
    const ts = Date.now();

    await setCached(cacheKey, { contracts: allContracts, provider: usedProvider, spot, ts, source } satisfies CachedChain, CACHE_TTL.optionsChain).catch(() => {});

    /* ── 4. Filter + respond ─────────────────────────────────────── */
    const eligibleContracts = allContracts.filter((c) => isCurrentOrFutureExpiry(c.expiration));
    if (!eligibleContracts.length) {
      return NextResponse.json({
        success: false,
        symbol,
        underlyingPrice: spot,
        expirations: [],
        contracts: [],
        provider: usedProvider,
        ...source,
        cachedAt: ts,
        error: 'Options provider returned no current or future expirations',
      } satisfies OptionsChainResponse, { status: 422 });
    }
    const contracts = expirationFilter
      ? eligibleContracts.filter((c) => c.expiration === expirationFilter)
      : eligibleContracts;

    return NextResponse.json({
      success: true,
      symbol,
      underlyingPrice: spot,
      expirations: computeExpirations(eligibleContracts),
      contracts,
      provider: usedProvider,
      ...source,
      ...(providerIssues.length ? { providerIssues } : {}),
      cachedAt: ts,
    } satisfies OptionsChainResponse);

  } catch (err) {
    console.error('[options-chain] Error:', err);
    return NextResponse.json({
      success: false,
      symbol,
      underlyingPrice: 0,
      expirations: [],
      contracts: [],
      provider: 'none',
      cachedAt: 0,
      error: err instanceof Error ? err.message : 'Failed to fetch options chain',
    } satisfies OptionsChainResponse, { status: 500 });
  }
}
