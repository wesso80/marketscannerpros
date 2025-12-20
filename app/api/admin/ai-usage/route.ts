import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      dailyStats,
      tierBreakdown,
      topUsers,
      recentQuestions,
    ] = await Promise.all([
      // Daily usage for last 30 days
      sql`SELECT 
            DATE(created_at) as date, 
            COUNT(*) as questions,
            COUNT(DISTINCT workspace_id) as unique_users,
            SUM(response_length) as total_tokens
          FROM ai_usage 
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE(created_at) 
          ORDER BY date DESC`,
      
      // Breakdown by tier
      sql`SELECT 
            tier, 
            COUNT(*) as questions,
            COUNT(DISTINCT workspace_id) as unique_users,
            AVG(response_length)::int as avg_tokens
          FROM ai_usage 
          WHERE DATE(created_at) = CURRENT_DATE
          GROUP BY tier`,
      
      // Top users (all time)
      sql`SELECT 
            workspace_id, 
            tier,
            COUNT(*) as total_questions,
            MAX(created_at) as last_active
          FROM ai_usage 
          GROUP BY workspace_id, tier
          ORDER BY total_questions DESC
          LIMIT 20`,
      
      // Recent questions (last 50)
      sql`SELECT 
            id,
            workspace_id,
            tier,
            SUBSTRING(question, 1, 100) as question_preview,
            response_length,
            created_at
          FROM ai_usage 
          ORDER BY created_at DESC
          LIMIT 50`,
    ]);

    return NextResponse.json({
      dailyStats: dailyStats.rows,
      tierBreakdown: tierBreakdown.rows,
      topUsers: topUsers.rows,
      recentQuestions: recentQuestions.rows,
    });
  } catch (error: any) {
    console.error("Admin AI usage error:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI usage", details: error.message },
      { status: 500 }
    );
  }
}
