import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId?: string }> {
  const admin = await requireAdmin(req);
  if (admin.ok) return { ok: true, workspaceId: admin.workspaceId };

  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return { ok: false };

  const userRow = await q(
    `SELECT email FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1`,
    [session.workspaceId]
  );
  const email = (userRow[0]?.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) return { ok: false };

  return { ok: true, workspaceId: session.workspaceId };
}

/**
 * GET /api/admin/contest — List entries for current or specified period
 * POST /api/admin/contest — { action: 'draw' | 'close_period' }
 *
 * Admin-only (checked via session email + ADMIN_EMAILS env var).
 */
export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || currentPeriod();

  const entries = await q(
    `SELECT
       ce.id,
       ce.workspace_id,
       ce.entry_number,
       ce.created_at,
       us.email
     FROM contest_entries ce
     LEFT JOIN user_subscriptions us ON us.workspace_id = ce.workspace_id
     WHERE ce.contest_period = $1
     ORDER BY ce.created_at DESC`,
    [period]
  );

  return NextResponse.json({ period, entries, total: entries.length });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { action, period: requestedPeriod } = await req.json();
  const period = requestedPeriod || currentPeriod();

  if (action === 'draw') {
    // Random weighted draw — each entry row is 1 ticket
    const entries = await q(
      `SELECT ce.id, ce.workspace_id, us.email, us.stripe_customer_id
       FROM contest_entries ce
       LEFT JOIN user_subscriptions us ON us.workspace_id = ce.workspace_id
       WHERE ce.contest_period = $1`,
      [period]
    );

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No entries for this period' }, { status: 400 });
    }

    // Cryptographically random index
    const randomBytes = require('crypto').randomBytes(4);
    const randomIndex = randomBytes.readUInt32BE(0) % entries.length;
    const winner = entries[randomIndex];

    // Grant $500 credit via Stripe customer balance
    if (winner.stripe_customer_id) {
      const txn = await stripe.customers.createBalanceTransaction(winner.stripe_customer_id, {
        amount: -50000, // -$500
        currency: 'usd',
        description: `Contest winner: ${period} monthly $500 draw`,
      });

      // Record reward
      await q(
        `INSERT INTO referral_rewards (workspace_id, referral_signup_id, reward_type, credit_amount_cents, stripe_balance_txn_id, applied_at)
         VALUES ($1, 0, 'contest_prize', 50000, $2, NOW())`,
        [winner.workspace_id, txn.id]
      );
    }

    return NextResponse.json({
      winner: {
        email: winner.email,
        workspaceId: winner.workspace_id,
        entryId: winner.id,
      },
      totalEntries: entries.length,
      period,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
