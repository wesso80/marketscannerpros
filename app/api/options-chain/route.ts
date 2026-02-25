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
 * Data source: Alpha Vantage REALTIME_OPTIONS_FMV (require_greeks=true)
 * Caching: Redis 60s by ticker, filtered client-side by expiration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { avFetch } from '@/lib/avRateGovernor';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const AV_REALTIME = (process.env.AV_OPTIONS_REALTIME_ENABLED ?? 'true').toLowerCase() !== 'false';

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
  cachedAt: number;
  error?: string;
}

export interface ExpirationMeta {
  date: string;
  dte: number;
  label: string;
  calls: number;
  puts: number;
  totalOI: number;
}

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

function computeExpirations(contracts: OptionsContract[]): ExpirationMeta[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const map = new Map<string, { calls: number; puts: number; totalOI: number }>();
  for (const c of contracts) {
    const s = map.get(c.expiration) || { calls: 0, puts: 0, totalOI: 0 };
    if (c.type === 'call') s.calls++;
    else s.puts++;
    s.totalOI += c.openInterest;
    map.set(c.expiration, s);
  }

  return Array.from(map.entries())
    .map(([date, s]) => {
      const d = new Date(date);
      const dte = Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86_400_000));
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` (${dte} DTE)`;
      return { date, dte, label, ...s };
    })
    .filter((e) => e.dte >= 0)
    .sort((a, b) => a.dte - b.dte);
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
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ success: false, error: 'Please log in to access the Options Terminal' } as Partial<OptionsChainResponse>, { status: 401 });
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
    const cacheKey = CACHE_KEYS.optionsChain(symbol);
    const cached = await getCached<{ contracts: OptionsContract[]; provider: string; spot: number; ts: number }>(cacheKey);

    if (cached && cached.contracts?.length) {
      const contracts = expirationFilter
        ? cached.contracts.filter((c) => c.expiration === expirationFilter)
        : cached.contracts;
      if (contracts.length) {
        return NextResponse.json({
          success: true,
          symbol,
          underlyingPrice: cached.spot,
          expirations: computeExpirations(cached.contracts), // always full list
          contracts,
          provider: cached.provider,
          cachedAt: cached.ts,
        } satisfies OptionsChainResponse);
      }
    }

    /* ── 2. Fetch from Alpha Vantage ─────────────────────────────── */
    const providers = AV_REALTIME
      ? ['REALTIME_OPTIONS_FMV', 'HISTORICAL_OPTIONS']
      : ['HISTORICAL_OPTIONS'];

    let allContracts: OptionsContract[] = [];
    let usedProvider = 'none';

    for (const fn of providers) {
      const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(symbol)}&require_greeks=true&apikey=${AV_KEY}`;
      const payload = await avFetch<{ data?: AVRaw[] }>(url, `${fn} ${symbol}`);

      if (!payload?.data?.length) continue;

      const normalised = payload.data.map(normalise).filter(Boolean) as OptionsContract[];
      if (!normalised.length) continue;

      allContracts = normalised;
      usedProvider = fn;
      break;
    }

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
      } satisfies OptionsChainResponse, { status: 404 });
    }

    /* ── 3. Compute spot & cache ─────────────────────────────────── */
    const spot = inferSpot(allContracts);
    const ts = Date.now();

    await setCached(cacheKey, { contracts: allContracts, provider: usedProvider, spot, ts }, CACHE_TTL.optionsChain).catch(() => {});

    /* ── 4. Filter + respond ─────────────────────────────────────── */
    const contracts = expirationFilter
      ? allContracts.filter((c) => c.expiration === expirationFilter)
      : allContracts;

    return NextResponse.json({
      success: true,
      symbol,
      underlyingPrice: spot,
      expirations: computeExpirations(allContracts),
      contracts,
      provider: usedProvider,
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
