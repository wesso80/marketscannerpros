/**
 * /api/journal/option-quote?symbol=XYZ&expiration=2026-10-16&strike=100&right=call
 *
 * Marks ONE recorded option contract (journal / portfolio positions) from the Alpha Vantage chain
 * (REALTIME_OPTIONS when entitled and quoted, otherwise HISTORICAL_OPTIONS = previous-session EOD).
 * Returns the contract's premium per share plus its data date and basis; the caller applies the contract multiplier.
 * A contract that is not in the chain, unpriced, or not from the current/previous session returns ok:false
 * so the position keeps an honest "no usable quote" state (never the underlying's price, never the entry price).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { optionContractSpec } from '@/lib/options/contractQuote';
import { fetchOptionContractMark } from '@/lib/options/contractMarkServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const mark = await fetchOptionContractMark(spec);
  if (!mark.ok) {
    if (mark.reason === 'provider_error') return NextResponse.json({ ok: false, reason: 'provider_error' }, { status: 502 });
    return NextResponse.json(mark.reason === 'stale_quote' ? { ok: false, reason: 'stale_quote', asOfDate: mark.asOfDate } : { ok: false, reason: mark.reason });
  }
  return NextResponse.json({
    ok: true,
    price: mark.price,
    priceField: mark.priceField,
    asOfDate: mark.asOfDate,
    basis: mark.basis,
    source: mark.source,
    contractId: mark.contractId,
  });
}
