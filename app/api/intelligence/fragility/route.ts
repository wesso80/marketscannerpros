import { NextResponse } from 'next/server';
import { resolveFragility } from '@/lib/intelligence/fragilityService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Server time budget (RS-16). The provider loader has its own 20 s budget; this is the backstop for the request. */
const ROUTE_BUDGET_MS = 25_000;

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ROUTE_BUDGET_MS); });
  // If the budget wins, the load keeps running and fills the cache for the next request.
  const resolved = await Promise.race([resolveFragility(), timeout]);
  if (timer) clearTimeout(timer);
  if (!resolved) {
    return NextResponse.json(
      { error: 'Market Fragility data is still loading from the providers. Please retry in a few seconds.' },
      { status: 503, headers: { 'Retry-After': '10' } },
    );
  }
  return NextResponse.json({ data: resolved.ui, source: resolved.isLive ? 'live' : 'mock' });
}
