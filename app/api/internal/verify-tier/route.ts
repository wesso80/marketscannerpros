import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { verifyCronAuth } from '@/lib/adminAuth';
import { effectiveTierFromSubscription } from '@/lib/entitlements';
import { chooseAccessSubscription } from '@/lib/subscriptionRow';

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
    const columns = 'workspace_id, tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at, created_at, id, email';
    const rows = await q<{ workspace_id?: string | null; tier: string; status: string; current_period_end: Date | string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; updated_at?: Date | string | null; created_at?: Date | string | null; id?: number | null; email?: string | null }>(
      `SELECT ${columns} FROM user_subscriptions
        WHERE workspace_id = $1
           OR LOWER(email) = LOWER((SELECT email FROM user_subscriptions WHERE workspace_id = $1 AND email IS NOT NULL LIMIT 1))
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC`,
      [workspaceId]
    );

    const workspaceRows = rows.filter((row) => row.workspace_id === workspaceId);
    const otherRows = rows.filter((row) => row.workspace_id !== workspaceId);
    const chosen = chooseAccessSubscription(workspaceRows.length > 0 ? workspaceRows : rows, workspaceRows.length > 0 ? otherRows : []);
    if (!chosen) {
      return NextResponse.json({ tier: 'free', status: 'none' });
    }

    const { status } = chosen;
    // Same rule as /api/me and getVerifiedTier: expired trials are free; the stored status is unchanged.
    return NextResponse.json({ tier: effectiveTierFromSubscription(chosen), status });
  } catch {
    // On DB error, return unknown so caller can fall back to cookie tier
    return NextResponse.json({ tier: 'unknown', status: 'error' });
  }
}
