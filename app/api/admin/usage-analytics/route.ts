/**
 * GET /api/admin/usage-analytics
 *
 * Platform-wide usage analytics for the admin dashboard.
 * Covers: DAU/WAU/MAU, feature adoption, scan volume,
 * conversion funnel, trade activity, and retention.
 */

import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

async function safe<T = any>(fn: () => Promise<T[]>, fallback: T[] = []): Promise<T[]> {
  try { return await fn(); } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [
      activeUsers,
      signupFunnel,
      dailyScans,
      featureAdoption,
      tradeActivity,
      tierDistribution,
      retentionCohorts,
      topActiveWorkspaces,
    ] = await Promise.all([
      // ─── DAU / WAU / MAU from active_sessions ───
      safe(() => q(`
        SELECT
          (SELECT COUNT(DISTINCT COALESCE(workspace_id::text, session_id))
           FROM active_sessions WHERE last_seen > NOW() - INTERVAL '24 hours') AS dau,
          (SELECT COUNT(DISTINCT COALESCE(workspace_id::text, session_id))
           FROM active_sessions WHERE last_seen > NOW() - INTERVAL '7 days') AS wau,
          (SELECT COUNT(DISTINCT COALESCE(workspace_id::text, session_id))
           FROM active_sessions WHERE last_seen > NOW() - INTERVAL '30 days') AS mau,
          (SELECT COUNT(*) FROM active_sessions
           WHERE last_seen > NOW() - INTERVAL '5 minutes') AS online_now
      `)),

      // ─── Conversion funnel: signups → trials → paid (last 30 days) ───
      safe(() => q(`
        SELECT
          (SELECT COUNT(*) FROM workspaces
           WHERE created_at > NOW() - INTERVAL '30 days') AS signups_30d,
          (SELECT COUNT(*) FROM user_subscriptions
           WHERE created_at > NOW() - INTERVAL '30 days' AND is_trial = true) AS trials_30d,
          (SELECT COUNT(*) FROM user_subscriptions
           WHERE created_at > NOW() - INTERVAL '30 days'
             AND tier IN ('pro','pro_trader')
             AND status = 'active'
             AND (is_trial IS NULL OR is_trial = false)) AS paid_30d,
          (SELECT COUNT(*) FROM user_subscriptions
           WHERE status = 'active' AND tier = 'pro') AS active_pro,
          (SELECT COUNT(*) FROM user_subscriptions
           WHERE status = 'active' AND tier = 'pro_trader') AS active_pro_trader,
          (SELECT COUNT(*) FROM user_subscriptions
           WHERE status = 'canceled') AS churned_total
      `)),

      // ─── Daily scan volume (last 30d) ───
      safe(() => q(`
        SELECT scan_date::text AS date,
               SUM(scan_count)::int AS scans,
               COUNT(DISTINCT workspace_id)::int AS unique_scanners
        FROM scan_usage
        WHERE scan_date > CURRENT_DATE - 30
        GROUP BY scan_date ORDER BY scan_date DESC
      `)),

      // ─── Feature adoption (each table individually safe-wrapped) ───
      (async () => {
        const [journal, portfolio, ai, scanner, outcomes, total] = await Promise.all([
          safe(() => q(`SELECT COUNT(DISTINCT workspace_id)::int AS n FROM journal_entries WHERE created_at > NOW() - INTERVAL '30 days'`)),
          safe(() => q(`SELECT COUNT(DISTINCT workspace_id)::int AS n FROM portfolio_positions`)),
          safe(() => q(`SELECT COUNT(DISTINCT workspace_id)::int AS n FROM ai_usage WHERE created_at > NOW() - INTERVAL '30 days'`)),
          safe(() => q(`SELECT COUNT(DISTINCT workspace_id)::int AS n FROM scan_usage WHERE scan_date > CURRENT_DATE - 30`)),
          safe(() => q(`SELECT COUNT(DISTINCT workspace_id)::int AS n FROM trade_outcomes WHERE created_at > NOW() - INTERVAL '30 days'`)),
          safe(() => q(`SELECT COUNT(*)::int AS n FROM user_subscriptions WHERE status IN ('active','trialing')`)),
        ]);
        return [{
          journal_users: journal[0]?.n ?? 0,
          portfolio_users: portfolio[0]?.n ?? 0,
          ai_users: ai[0]?.n ?? 0,
          scanner_users: scanner[0]?.n ?? 0,
          trade_outcome_users: outcomes[0]?.n ?? 0,
          total_active_users: total[0]?.n ?? 0,
        }];
      })(),

      // ─── Trade activity (last 30d) ───
      safe(() => q(`
        SELECT
          (SELECT COUNT(*) FROM trade_outcomes
           WHERE created_at > NOW() - INTERVAL '30 days') AS trades_30d,
          (SELECT COUNT(*) FROM trade_outcomes
           WHERE created_at > NOW() - INTERVAL '7 days') AS trades_7d,
          (SELECT COUNT(*) FROM trade_outcomes
           WHERE created_at > NOW() - INTERVAL '24 hours') AS trades_today,
          (SELECT ROUND(AVG(CASE WHEN outcome = 'win' THEN 1.0 ELSE 0.0 END) * 100, 1)
           FROM trade_outcomes
           WHERE created_at > NOW() - INTERVAL '30 days') AS avg_win_rate,
          (SELECT ROUND(AVG(r_multiple)::numeric, 2) FROM trade_outcomes
           WHERE created_at > NOW() - INTERVAL '30 days' AND r_multiple IS NOT NULL) AS avg_r_multiple
      `)),

      // ─── Tier distribution (current) ───
      safe(() => q(`
        SELECT tier, status, COUNT(*)::int AS count
        FROM user_subscriptions
        GROUP BY tier, status
        ORDER BY tier, status
      `)),

      // ─── Retention: weekly active cohorts (last 8 weeks) ───
      safe(() => q(`
        SELECT
          DATE_TRUNC('week', last_seen)::date::text AS week,
          COUNT(DISTINCT COALESCE(workspace_id::text, session_id))::int AS active_users
        FROM active_sessions
        WHERE last_seen > NOW() - INTERVAL '8 weeks'
        GROUP BY DATE_TRUNC('week', last_seen)
        ORDER BY week DESC
      `)),

      // ─── Top active workspaces (composite activity score, last 7d) ───
      safe(() => q(`
        SELECT
          us.workspace_id,
          us.email,
          us.tier,
          COALESCE(scans.cnt, 0)::int AS scans_7d,
          COALESCE(trades.cnt, 0)::int AS trades_7d,
          COALESCE(ai.cnt, 0)::int AS ai_questions_7d,
          COALESCE(journal.cnt, 0)::int AS journal_entries_7d,
          (COALESCE(scans.cnt, 0) + COALESCE(trades.cnt, 0) * 3
           + COALESCE(ai.cnt, 0) + COALESCE(journal.cnt, 0) * 2)::int AS activity_score
        FROM user_subscriptions us
        LEFT JOIN (
          SELECT workspace_id, SUM(scan_count) AS cnt FROM scan_usage
          WHERE scan_date > CURRENT_DATE - 7 GROUP BY workspace_id
        ) scans ON scans.workspace_id = us.workspace_id
        LEFT JOIN (
          SELECT workspace_id, COUNT(*) AS cnt FROM trade_outcomes
          WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY workspace_id
        ) trades ON trades.workspace_id = us.workspace_id
        LEFT JOIN (
          SELECT workspace_id, COUNT(*) AS cnt FROM ai_usage
          WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY workspace_id
        ) ai ON ai.workspace_id = us.workspace_id
        LEFT JOIN (
          SELECT workspace_id, COUNT(*) AS cnt FROM journal_entries
          WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY workspace_id
        ) journal ON journal.workspace_id = us.workspace_id
        ORDER BY activity_score DESC
        LIMIT 15
      `)),
    ]);

    const defaultAdoption = { journal_users: 0, portfolio_users: 0, ai_users: 0, scanner_users: 0, trade_outcome_users: 0, total_active_users: 0 };
    const defaultTrades = { trades_30d: 0, trades_7d: 0, trades_today: 0, avg_win_rate: null, avg_r_multiple: null };

    return NextResponse.json({
      activeUsers: activeUsers[0] || { dau: 0, wau: 0, mau: 0, online_now: 0 },
      signupFunnel: signupFunnel[0] || { signups_30d: 0, trials_30d: 0, paid_30d: 0, active_pro: 0, active_pro_trader: 0, churned_total: 0 },
      dailyScans,
      featureAdoption: { ...defaultAdoption, ...featureAdoption[0] },
      tradeActivity: { ...defaultTrades, ...tradeActivity[0] },
      tierDistribution,
      retentionCohorts,
      topActiveWorkspaces,
    });
  } catch (err: any) {
    console.error('Usage analytics error:', err);
    return NextResponse.json({ error: 'Failed to load analytics', detail: err.message }, { status: 500 });
  }
}
