import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';

/**
 * Internal endpoint called by middleware during session refresh.
 * Returns the current subscription tier from the database.
 * Protected by APP_SIGNING_SECRET to prevent external abuse.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const secret = process.env.APP_SIGNING_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = req.nextUrl.searchParams.get('wid');
  if (!workspaceId) {
    return NextResponse.json({ error: 'Missing wid' }, { status: 400 });
  }

  try {
    const rows = await q<{ tier: string; status: string }>(
      `SELECT tier, status FROM user_subscriptions WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [workspaceId]
    );

    if (!rows.length) {
      return NextResponse.json({ tier: 'free', status: 'none' });
    }

    const { tier, status } = rows[0];
    // If subscription is cancelled/expired, downgrade to free
    if (status !== 'active' && status !== 'trialing') {
      return NextResponse.json({ tier: 'free', status });
    }

    return NextResponse.json({ tier, status });
  } catch {
    // On DB error, return unknown so caller can fall back to cookie tier
    return NextResponse.json({ tier: 'unknown', status: 'error' });
  }
}
