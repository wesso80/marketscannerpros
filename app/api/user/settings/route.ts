import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { getUserAccountEquity } from '@/lib/journal/riskAtEntry';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const equity = await getUserAccountEquity(session.workspaceId);

  return NextResponse.json({ account_equity: equity });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEquity = Number(body?.account_equity);

  if (!Number.isFinite(rawEquity) || rawEquity < 100 || rawEquity > 100_000_000) {
    return NextResponse.json(
      { error: 'account_equity must be between $100 and $100,000,000' },
      { status: 400 },
    );
  }

  const equity = Math.round(rawEquity * 100) / 100; // round to cents

  try {
    await q(
      `UPDATE user_subscriptions SET account_equity = $1, updated_at = NOW() WHERE workspace_id = $2`,
      [equity, session.workspaceId],
    );
  } catch (err: any) {
    // Column may not exist — add it
    if (err?.message?.includes('account_equity')) {
      await q(`ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS account_equity NUMERIC(14,2) DEFAULT NULL`);
      await q(
        `UPDATE user_subscriptions SET account_equity = $1, updated_at = NOW() WHERE workspace_id = $2`,
        [equity, session.workspaceId],
      );
    } else {
      throw err;
    }
  }

  return NextResponse.json({ ok: true, account_equity: equity });
}
