import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import crypto from 'crypto';

const FRIEND_CODE_SALT = process.env.FRIEND_CODE_SALT || 'referral-salt';

function generateReferralCode(workspaceId: string): string {
  return crypto
    .createHash('sha256')
    .update(workspaceId + FRIEND_CODE_SALT)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();
}

/**
 * GET /api/referral/dashboard
 * Returns everything the referral dashboard page needs in a single call.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const referralCode = generateReferralCode(workspaceId);

    // ── Bootstrap: ensure all referral tables exist ──
    await q(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        workspace_id UUID NOT NULL UNIQUE,
        referral_code VARCHAR(16) NOT NULL UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS referral_signups (
        id SERIAL PRIMARY KEY,
        referrer_workspace_id UUID NOT NULL,
        referee_workspace_id UUID NOT NULL,
        referee_email VARCHAR(255),
        referral_code VARCHAR(16) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reward_applied_at TIMESTAMP WITH TIME ZONE,
        converted_at TIMESTAMP WITH TIME ZONE,
        referee_plan VARCHAR(20),
        ip_hash VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT fk_referrer FOREIGN KEY (referrer_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        CONSTRAINT fk_referee FOREIGN KEY (referee_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        CONSTRAINT unique_referee UNIQUE (referee_workspace_id)
      );
      CREATE TABLE IF NOT EXISTS referral_rewards (
        id SERIAL PRIMARY KEY,
        workspace_id UUID NOT NULL,
        referral_signup_id INTEGER NOT NULL,
        reward_type VARCHAR(50) NOT NULL,
        stripe_coupon_id VARCHAR(255),
        credit_amount_cents INTEGER DEFAULT 0,
        stripe_balance_txn_id VARCHAR(255),
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT fk_workspace_reward FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS referral_clicks (
        id SERIAL PRIMARY KEY,
        referral_code VARCHAR(16) NOT NULL,
        ip_hash VARCHAR(64),
        user_agent_hash VARCHAR(64),
        landing_page VARCHAR(255) DEFAULT '/pricing',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS contest_entries (
        id SERIAL PRIMARY KEY,
        workspace_id UUID NOT NULL,
        contest_period VARCHAR(20) NOT NULL,
        entry_number INTEGER NOT NULL DEFAULT 1,
        qualifying_referral_ids INTEGER[] NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT fk_contest_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        CONSTRAINT unique_contest_entry UNIQUE (workspace_id, contest_period, entry_number)
      );
    `);

    // Ensure referral code row exists
    await q(
      `INSERT INTO referrals (workspace_id, referral_code, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET referral_code = $2`,
      [workspaceId, referralCode]
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.marketscannerpros.app';
    const referralUrl = `${baseUrl}/pricing?ref=${referralCode}`;

    // All queries in parallel
    const [clicksResult, statsResult, creditsResult, historyResult, contestResult, leaderboardResult] = await Promise.all([
      // Click count for this user's referral code
      q(`SELECT COUNT(*)::int AS cnt FROM referral_clicks WHERE referral_code = $1`, [referralCode]),

      // Signup stats by status
      q(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending')::int   AS pending,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE status = 'rewarded')::int  AS rewarded
         FROM referral_signups
         WHERE referrer_workspace_id = $1`,
        [workspaceId]
      ),

      // Total credits earned (cents)
      q(
        `SELECT COALESCE(SUM(credit_amount_cents), 0)::int AS total
         FROM referral_rewards
         WHERE workspace_id = $1`,
        [workspaceId]
      ),

      // Referral history (last 50)
      q(
        `SELECT
           rs.referee_email,
           rs.status,
           rs.created_at,
           rs.converted_at,
           rs.referee_plan,
           COALESCE(rr.credit_amount_cents, 0)::int AS credit_cents
         FROM referral_signups rs
         LEFT JOIN referral_rewards rr
           ON rr.referral_signup_id = rs.id AND rr.workspace_id = $1
         WHERE rs.referrer_workspace_id = $1
         ORDER BY rs.created_at DESC
         LIMIT 50`,
        [workspaceId]
      ),

      // Contest entries for current period
      q(
        `SELECT
           contest_period,
           MAX(entry_number)::int AS entries
         FROM contest_entries
         WHERE workspace_id = $1
         GROUP BY contest_period
         ORDER BY contest_period DESC
         LIMIT 1`,
        [workspaceId]
      ),

      // Leaderboard: top 5 referrers this month (anonymised)
      q(
        `SELECT
           r.referral_code AS code,
           COUNT(rs.id)::int AS cnt
         FROM referral_signups rs
         JOIN referrals r ON r.workspace_id = rs.referrer_workspace_id
         WHERE rs.status = 'rewarded'
           AND rs.reward_applied_at >= date_trunc('month', NOW())
         GROUP BY r.referral_code
         ORDER BY cnt DESC
         LIMIT 5`
      ),
    ]);

    const clicks = clicksResult[0]?.cnt || 0;
    const stats = statsResult[0] || { pending: 0, completed: 0, rewarded: 0 };
    const creditsEarned = creditsResult[0]?.total || 0;
    const totalRewarded = stats.rewarded || 0;
    const nextEntryProgress = totalRewarded % 5;

    // Current contest period
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const contestEntries = contestResult.length > 0 && contestResult[0].contest_period === period
      ? contestResult[0].entries
      : 0;

    // Total contest entries this period (for display)
    const totalEntriesResult = await q(
      `SELECT COUNT(*)::int AS cnt FROM contest_entries WHERE contest_period = $1`,
      [period]
    );

    // Mask emails for privacy
    const history = historyResult.map((row: any) => ({
      email: maskEmail(row.referee_email),
      status: row.status,
      date: row.created_at,
      convertedAt: row.converted_at,
      plan: row.referee_plan,
      credit: row.credit_cents,
    }));

    // Anonymise leaderboard
    const leaderboard = leaderboardResult.map((row: any, i: number) => ({
      rank: i + 1,
      label: `User #${row.code.slice(0, 4)}`,
      referrals: row.cnt,
      isYou: row.code === referralCode,
    }));

    // Draw date = 1st of next month
    const drawDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return NextResponse.json({
      referralCode,
      referralUrl,
      stats: {
        clicks,
        signups: (stats.pending || 0) + (stats.completed || 0) + (stats.rewarded || 0),
        conversions: stats.rewarded || 0,
        creditsEarned,
        contestEntries,
        nextEntryProgress,
      },
      history,
      leaderboard,
      contest: {
        period: monthName,
        drawDate: drawDate.toISOString(),
        prizePool: '$500',
        yourEntries: contestEntries,
        totalEntries: totalEntriesResult[0]?.cnt || 0,
      },
    });
  } catch (error) {
    console.error('[Referral Dashboard] Error:', error);
    return NextResponse.json({ error: 'Failed to load referral dashboard' }, { status: 500 });
  }
}

/** Mask email for privacy: j***@gmail.com */
function maskEmail(email: string | null): string {
  if (!email) return '***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}
