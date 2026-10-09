import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/adminAuth';
import {
  AV_BUDGET_CONTRACT,
  AV_CEILING_PER_MIN,
  AV_LANES,
  avTryTake,
  avWaitMs,
  sanitizeFeature,
  type AvLane,
} from '@/lib/avLimiter';

/**
 * Shared Alpha Vantage budget for a process that is not this web app or worker.
 * Jarvis on the other box must POST here before each Alpha Vantage call.
 * Auth is the existing cron secret. count is how many tokens to take now (max 20).
 * granted 0 means do not call Alpha Vantage; wait retryAfterMs and try again.
 */
export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { lane?: unknown; feature?: unknown; count?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const lane = typeof body.lane === 'string' && (AV_LANES as readonly string[]).includes(body.lane)
    ? body.lane as AvLane
    : null;
  if (!lane) {
    return NextResponse.json({ error: 'lane must be user, alerts, scheduled, or backfill' }, { status: 400 });
  }

  const count = body.count == null ? 1 : Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > AV_BUDGET_CONTRACT.countMax) {
    return NextResponse.json({ error: `count must be an integer from 1 to ${AV_BUDGET_CONTRACT.countMax}` }, { status: 400 });
  }

  const feature = sanitizeFeature(typeof body.feature === 'string' ? body.feature : 'unspecified');
  let granted = 0;
  for (let i = 0; i < count; i += 1) {
    if (!(await avTryTake({ lane, feature }))) break;
    granted += 1;
  }

  return NextResponse.json({
    granted,
    ceiling: AV_CEILING_PER_MIN,
    lane,
    feature,
    retryAfterMs: granted === count ? 0 : avWaitMs(lane),
  });
}
