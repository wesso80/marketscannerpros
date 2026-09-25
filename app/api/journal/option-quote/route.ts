/**
 * /api/journal/option-quote?symbol=XYZ&expiration=2026-10-16&strike=100&right=call
 *
 * Marks ONE recorded option contract (journal / portfolio positions) from the Alpha Vantage chain
 * (REALTIME_OPTIONS_FMV when entitled, otherwise HISTORICAL_OPTIONS = previous-session EOD).
 * Returns the contract's premium per share plus its data date and basis; the caller applies the contract multiplier.
 * A contract that is not in the chain, unpriced, or not from the current/previous session returns ok:false
 * so the position keeps an honest "no usable quote" state (never the underlying's price, never the entry price).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { fetchOptionsChain } from '@/lib/options-confluence-analyzer';
import { findOptionContractMark, isOptionMarkCurrent, optionContractSpec } from '@/lib/options/contractQuote';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Chain = Awaited<ReturnType<typeof fetchOptionsChain>>;

// EOD chains change once a session; cache per underlying+expiry so 60s client refreshes don't spend AV calls.
const CHAIN_TTL_MS = 10 * 60_000;
const MISS_TTL_MS = 2 * 60_000;
const chainCache = new Map<string, { chain: Chain; expires: number }>();

async function getChain(underlying: string, expiration: string): Promise<Chain> {
  const key = `${underlying}|${expiration}`;
  const hit = chainCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.chain;
  const chain = await fetchOptionsChain(underlying, expiration);
  chainCache.set(key, { chain, expires: Date.now() + (chain ? CHAIN_TTL_MS : MISS_TTL_MS) });
  if (chainCache.size > 500) chainCache.delete(chainCache.keys().next().value as string);
  return chain;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Please log in to access market data' }, { status: 401 });
  }
  const rateCheck = apiLimiter.check(getClientIP(req));
  if (!rateCheck.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many requests', retryAfter: rateCheck.retryAfter }, { status: 429 });
  }

  const params = new URL(req.url).searchParams;
  const spec = optionContractSpec({
    symbol: params.get('symbol'),
    optionType: params.get('right'),
    strikePrice: params.get('strike'),
    expirationDate: params.get('expiration'),
  });
  if (!spec) {
    return NextResponse.json({ ok: false, reason: 'invalid_contract', error: 'symbol, expiration (YYYY-MM-DD), strike and right are required' }, { status: 400 });
  }

  try {
    const chain = await getChain(spec.underlying, spec.expiration);
    // fetchOptionsChain falls back to another expiry when the requested one is absent — that is not this contract.
    if (!chain || chain.selectedExpiry !== spec.expiration) {
      return NextResponse.json({ ok: false, reason: 'contract_not_found' });
    }
    const mark = findOptionContractMark(spec.right === 'call' ? chain.calls : chain.puts, spec);
    if (!mark) {
      return NextResponse.json({ ok: false, reason: 'contract_not_found' });
    }
    const asOfDate = mark.asOfDate ?? chain.dataDate;
    if (!isOptionMarkCurrent(asOfDate)) {
      return NextResponse.json({ ok: false, reason: 'stale_quote', asOfDate });
    }
    return NextResponse.json({
      ok: true,
      price: mark.price,
      priceField: mark.priceField,
      asOfDate,
      basis: chain.freshness,
      source: chain.sourceFunction,
      contractId: mark.contractId,
    });
  } catch (error) {
    console.warn('[journal/option-quote] failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, reason: 'provider_error' }, { status: 502 });
  }
}
