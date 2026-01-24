import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

// Helper to safely run a query and return empty on error
async function safeQuery<T = any>(queryFn: () => Promise<T[]>, defaultValue: T[] = []): Promise<T[]> {
  try {
    return await queryFn();
  } catch (e) {
    console.warn("Query failed:", e);
    return defaultValue;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
      safeQuery(() => q(`SELECT COUNT(*) as count FROM user_subscriptions`)),
      
      // Active subscriptions by tier
      safeQuery(() => q(`SELECT tier, COUNT(*) as count FROM user_subscriptions 
          WHERE status IN ('active', 'trialing') GROUP BY tier`)),
      
      // AI usage today (Australia/Sydney timezone)
      safeQuery(() => q(`SELECT COUNT(*) as count, COUNT(DISTINCT workspace_id) as unique_users 
          FROM ai_usage WHERE DATE(created_at AT TIME ZONE 'Australia/Sydney') = (NOW() AT TIME ZONE 'Australia/Sydney')::date`)),
      
      // AI usage last 7 days
      safeQuery(() => q(`SELECT DATE(created_at) as date, COUNT(*) as count 
          FROM ai_usage 
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at) ORDER BY date DESC`)),
      
      // Active trials (from user_subscriptions with trialing status)
      safeQuery(() => q(`SELECT COUNT(*) as count FROM user_subscriptions WHERE status = 'trialing'`)),
      
      // Pending delete requests
      safeQuery(() => q(`SELECT COUNT(*) as count FROM delete_requests WHERE status = 'pending'`)),
      
      // Recent signups (last 7 days)
      safeQuery(() => q(`SELECT DATE(created_at) as date, COUNT(*) as count 
          FROM workspaces 
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at) ORDER BY date DESC`)),
      
      // Top AI users today (Australia/Sydney timezone)
      safeQuery(() => q(`SELECT workspace_id, tier, COUNT(*) as questions 
          FROM ai_usage 
          WHERE DATE(created_at AT TIME ZONE 'Australia/Sydney') = (NOW() AT TIME ZONE 'Australia/Sydney')::date
          GROUP BY workspace_id, tier
          ORDER BY questions DESC LIMIT 10`)),

      // Learning Machine: per-symbol stats
      safeQuery(() => q(`SELECT symbol, total_predictions, win_rate, avg_move_pct, avg_time_to_move_mins, last_updated
          FROM learning_stats ORDER BY total_predictions DESC LIMIT 20`)),

      // Learning Machine: recent predictions with outcomes
      safeQuery(() => q(`SELECT p.symbol, p.prediction_direction, p.confidence, p.current_price, p.created_at, p.status,
          o.move_pct, o.hit_target, o.hit_stop, o.direction as outcome_direction
          FROM learning_predictions p
          LEFT JOIN learning_outcomes o ON o.prediction_id = p.id
          ORDER BY p.created_at DESC LIMIT 30`)),

      // Learning Machine: totals
      safeQuery(() => q(`SELECT 
          (SELECT COUNT(*) FROM learning_predictions) as total_predictions,
          (SELECT COUNT(*) FROM learning_predictions WHERE status = 'pending') as pending,
          (SELECT COUNT(*) FROM learning_predictions WHERE status = 'processed') as processed,
          (SELECT COUNT(*) FROM learning_outcomes WHERE hit_target = true) as wins,
          (SELECT COUNT(*) FROM learning_outcomes WHERE hit_stop = true) as stops`)),
    ]);

    return NextResponse.json({
      overview: {
        totalWorkspaces: totalWorkspaces[0]?.count || 0,
        subscriptionsByTier: activeSubscriptions || [],
        activeTrials: activeTrials[0]?.count || 0,
        pendingDeleteRequests: deleteRequests[0]?.count || 0,
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
    });
  } catch (error: any) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats", details: error.message },
      { status: 500 }
    );
  }
}
