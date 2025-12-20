import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

// Helper to safely run a query and return empty on error
async function safeQuery(query: Promise<any>, defaultValue: any = { rows: [] }) {
  try {
    return await query;
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
    ] = await Promise.all([
      // Total workspaces
      safeQuery(sql`SELECT COUNT(*) as count FROM workspaces`),
      
      // Active subscriptions by tier
      safeQuery(sql`SELECT tier, COUNT(*) as count FROM user_subscriptions 
          WHERE status = 'active' GROUP BY tier`),
      
      // AI usage today
      safeQuery(sql`SELECT COUNT(*) as count, COUNT(DISTINCT workspace_id) as unique_users 
          FROM ai_usage WHERE DATE(created_at) = CURRENT_DATE`),
      
      // AI usage last 7 days
      safeQuery(sql`SELECT DATE(created_at) as date, COUNT(*) as count 
          FROM ai_usage 
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at) ORDER BY date DESC`),
      
      // Active trials
      safeQuery(sql`SELECT COUNT(*) as count FROM user_trials 
          WHERE expires_at > NOW() AND is_active = true`),
      
      // Pending delete requests
      safeQuery(sql`SELECT COUNT(*) as count FROM delete_requests WHERE status = 'pending'`),
      
      // Recent signups (last 7 days)
      safeQuery(sql`SELECT DATE(created_at) as date, COUNT(*) as count 
          FROM workspaces 
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at) ORDER BY date DESC`),
      
      // Top AI users today
      safeQuery(sql`SELECT workspace_id, tier, COUNT(*) as questions 
          FROM ai_usage 
          WHERE DATE(created_at) = CURRENT_DATE
          GROUP BY workspace_id, tier
          ORDER BY questions DESC LIMIT 10`),
    ]);

    return NextResponse.json({
      overview: {
        totalWorkspaces: totalWorkspaces.rows[0]?.count || 0,
        subscriptionsByTier: activeSubscriptions.rows || [],
        activeTrials: activeTrials.rows[0]?.count || 0,
        pendingDeleteRequests: deleteRequests.rows[0]?.count || 0,
      },
      aiUsage: {
        today: {
          totalQuestions: aiUsageToday.rows[0]?.count || 0,
          uniqueUsers: aiUsageToday.rows[0]?.unique_users || 0,
        },
        last7Days: aiUsageWeek.rows || [],
        topUsersToday: topAiUsers.rows || [],
      },
      signups: {
        last7Days: recentSignups.rows || [],
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
