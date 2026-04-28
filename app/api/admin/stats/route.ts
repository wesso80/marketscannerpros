import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireAdmin } from '@/lib/adminAuth';

type DegradationState = {
  failedQueries: string[];
  warnings: string[];
};

function recordQueryFailure(state: DegradationState, queryName: string, error: unknown) {
  state.failedQueries.push(queryName);
  const message = error instanceof Error ? error.message : String(error);
  state.warnings.push(`${queryName} unavailable: ${message}`);
  console.warn(`Admin stats query failed: ${queryName}`, error);
}

async function safeQuery<T = any>(
  queryName: string,
  state: DegradationState,
  queryFn: () => Promise<T[]>,
  defaultValue: T[] = [],
): Promise<T[]> {
  try {
    return await queryFn();
  } catch (e) {
    recordQueryFailure(state, queryName, e);
    return defaultValue;
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const degradation: DegradationState = { failedQueries: [], warnings: [] };

    // Get various stats in parallel - each wrapped to handle missing tables
    const [
      totalWorkspaces,
      activeSubscriptions,
      aiUsageToday,
      aiUsageWeek,
      activeTrials,
      deleteRequests,
      recentSignups,
      topAiUsers,
      // Learning Machine stats
      learningStats,
      recentPredictions,
      learningTotals,
    ] = await Promise.all([
      // Total users (from user_subscriptions)
      safeQuery('total_workspaces', degradation, () => q(`SELECT COUNT(*) as count FROM user_subscriptions`)),

      // Active subscriptions by tier (paid = has stripe_subscription_id)
      safeQuery('active_subscriptions', degradation, () => q(`SELECT tier, status, COUNT(*) as count FROM user_subscriptions
          WHERE status IN ('active', 'trialing') GROUP BY tier, status`)),

      // AI usage today (Australia/Sydney timezone)
      safeQuery('ai_usage_today', degradation, () => q(`SELECT COUNT(*) as count, COUNT(DISTINCT workspace_id) as unique_users
          FROM ai_usage WHERE DATE(created_at AT TIME ZONE 'Australia/Sydney') = (NOW() AT TIME ZONE 'Australia/Sydney')::date`)),

      // AI usage last 7 days
      safeQuery('ai_usage_week', degradation, () => q(`SELECT DATE(created_at) as date, COUNT(*) as count
          FROM ai_usage
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at) ORDER BY date DESC`)),

      // Active trials (from user_subscriptions with trialing status)
      safeQuery('active_trials', degradation, () => q(`SELECT COUNT(*) as count FROM user_subscriptions WHERE status = 'trialing'`)),

      // Pending delete requests
      safeQuery('delete_requests', degradation, () => q(`SELECT COUNT(*) as count FROM delete_requests WHERE status = 'pending'`)),

      // Recent signups (last 7 days)
      safeQuery('recent_signups', degradation, () => q(`SELECT DATE(created_at) as date, COUNT(*) as count
          FROM workspaces
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at) ORDER BY date DESC`)),

      // Top AI users today (Australia/Sydney timezone)
      safeQuery('top_ai_users_today', degradation, () => q(`SELECT workspace_id, tier, COUNT(*) as questions
          FROM ai_usage
          WHERE DATE(created_at AT TIME ZONE 'Australia/Sydney') = (NOW() AT TIME ZONE 'Australia/Sydney')::date
          GROUP BY workspace_id, tier
          ORDER BY questions DESC LIMIT 10`)),

      // Learning Machine: per-symbol stats
      safeQuery('learning_stats', degradation, () => q(`SELECT symbol, total_predictions, win_rate, avg_move_pct, avg_time_to_move_mins, last_updated
          FROM learning_stats ORDER BY total_predictions DESC LIMIT 20`)),

      // Learning Machine: recent predictions with outcomes
      safeQuery('recent_predictions', degradation, () => q(`SELECT p.symbol, p.prediction_direction, p.confidence, p.current_price, p.created_at, p.status,
          o.move_pct, o.hit_target, o.hit_stop, o.direction as outcome_direction
          FROM learning_predictions p
          LEFT JOIN learning_outcomes o ON o.prediction_id = p.id
          ORDER BY p.created_at DESC LIMIT 30`)),

      // Learning Machine: totals
      safeQuery('learning_totals', degradation, () => q(`SELECT
          (SELECT COUNT(*) FROM learning_predictions) as total_predictions,
          (SELECT COUNT(*) FROM learning_predictions WHERE status = 'pending') as pending,
          (SELECT COUNT(*) FROM learning_predictions WHERE status = 'processed') as processed,
          (SELECT COUNT(*) FROM learning_outcomes WHERE hit_target = true) as wins,
          (SELECT COUNT(*) FROM learning_outcomes WHERE hit_stop = true) as stops`)),
    ]);

    // Separate paid from trialing
    const trialSubs = (activeSubscriptions || []).filter((r: any) => r.status === 'trialing');
    const allByTier = (activeSubscriptions || []).map((r: any) => ({ tier: r.tier, status: r.status, count: parseInt(r.count) }));

    // Revenue calculation — only count Stripe-paid subscriptions (has stripe_subscription_id)
    const PRICES: Record<string, number> = { pro: 39.99, pro_trader: 89.99 };
    const stripePaidRows = await safeQuery('stripe_paid_subscriptions', degradation, () => q(
      `SELECT tier, COUNT(*) as count FROM user_subscriptions 
       WHERE status = 'active' AND tier != 'free' AND stripe_subscription_id IS NOT NULL
       GROUP BY tier`
    ));
    const monthlyRevenue = stripePaidRows.reduce((sum: number, r: any) => sum + (parseInt(r.count) * (PRICES[r.tier] || 0)), 0);
    const yearlyRevenue = monthlyRevenue * 12;
    const MONTHLY_COSTS = 677.50;
    const yearlyCosts = MONTHLY_COSTS * 12;
    const monthlyProfit = monthlyRevenue - MONTHLY_COSTS;
    const yearlyProfit = yearlyRevenue - yearlyCosts;
    const paidSubscriptions = stripePaidRows.reduce((sum: number, r: any) => sum + parseInt(r.count), 0);

    return NextResponse.json({
      overview: {
        totalWorkspaces: totalWorkspaces[0]?.count || 0,
        subscriptionsByTier: allByTier,
        paidSubscriptions,
        trialSubscriptions: trialSubs.reduce((sum: number, r: any) => sum + parseInt(r.count), 0),
        activeTrials: activeTrials[0]?.count || 0,
        pendingDeleteRequests: deleteRequests[0]?.count || 0,
        financials: {
          monthlyRevenue,
          yearlyRevenue,
          monthlyCosts: MONTHLY_COSTS,
          yearlyCosts,
          monthlyProfit,
          yearlyProfit,
        },
      },
      aiUsage: {
        today: {
          totalQuestions: aiUsageToday[0]?.count || 0,
          uniqueUsers: aiUsageToday[0]?.unique_users || 0,
        },
        last7Days: aiUsageWeek || [],
        topUsersToday: topAiUsers || [],
      },
      signups: {
        last7Days: recentSignups || [],
      },
      learning: {
        totals: learningTotals[0] || { total_predictions: 0, pending: 0, processed: 0, wins: 0, stops: 0 },
        stats: learningStats || [],
        recentPredictions: recentPredictions || [],
      },
      meta: {
        degraded: degradation.failedQueries.length > 0,
        failedQueries: degradation.failedQueries,
        warnings: degradation.warnings,
      },
    });
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats", details: error.message },
      { status: 500 }
    );
  }
}
