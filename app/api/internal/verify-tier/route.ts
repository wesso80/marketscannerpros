import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { verifyCronAuth } from '@/lib/adminAuth';
import { effectiveTierFromSubscription } from '@/lib/entitlements';

/**
 * Internal endpoint called by middleware during session refresh.
 * Returns the current subscription tier from the database.
 * Protected by CRON_SECRET to prevent external abuse.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = req.nextUrl.searchParams.get('wid');
  if (!workspaceId) {
    return NextResponse.json({ error: 'Missing wid' }, { status: 400 });
  }

  try {
    const rows = await q<{ tier: string; status: string; current_period_end: Date | string | null }>(
      `SELECT tier, status, current_period_end FROM user_subscriptions WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [workspaceId]
    );

    if (!rows.length) {
      return NextResponse.json({ tier: 'free', status: 'none' });
    }

    const { status } = rows[0];
    // Same rule as /api/me and getVerifiedTier: expired trials are free; the stored status is unchanged.
    return NextResponse.json({ tier: effectiveTierFromSubscription(rows[0]), status });
  } catch {
    // On DB error, return unknown so caller can fall back to cookie tier
    return NextResponse.json({ tier: 'unknown', status: 'error' });
  }
}
