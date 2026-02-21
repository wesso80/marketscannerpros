import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { timingSafeEqual } from 'crypto';

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

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
  const adminSecret = process.env.ADMIN_SECRET || '';
  
  if (!secret || !adminSecret || !timingSafeCompare(secret, adminSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      dailyStats,
      tierBreakdown,
      topUsers,
      recentQuestions,
    ] = await Promise.all([
      // Daily usage for last 30 days (Australia/Sydney timezone)
      safeQuery(() => q(`SELECT 
            DATE(created_at AT TIME ZONE 'Australia/Sydney') as date, 
            COUNT(*) as questions,
            COUNT(DISTINCT workspace_id) as unique_users,
            SUM(response_length) as total_tokens
          FROM ai_usage 
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE(created_at AT TIME ZONE 'Australia/Sydney') 
          ORDER BY date DESC`)),
      
      // Breakdown by tier (today in Australia/Sydney timezone)
      safeQuery(() => q(`SELECT 
            tier, 
            COUNT(*) as questions,
            COUNT(DISTINCT workspace_id) as unique_users,
            AVG(response_length)::int as avg_tokens
          FROM ai_usage 
          WHERE DATE(created_at AT TIME ZONE 'Australia/Sydney') = (NOW() AT TIME ZONE 'Australia/Sydney')::date
          GROUP BY tier`)),
      
      // Top users (all time)
      safeQuery(() => q(`SELECT 
            workspace_id, 
            tier,
            COUNT(*) as total_questions,
            MAX(created_at) as last_active
          FROM ai_usage 
          GROUP BY workspace_id, tier
          ORDER BY total_questions DESC
          LIMIT 20`)),
      
      // Recent questions (last 50)
      safeQuery(() => q(`SELECT 
            id,
            workspace_id,
            tier,
            SUBSTRING(question, 1, 100) as question_preview,
            response_length,
            created_at
          FROM ai_usage 
          ORDER BY created_at DESC
          LIMIT 50`)),
    ]);

    return NextResponse.json({
      dailyStats: dailyStats || [],
      tierBreakdown: tierBreakdown || [],
      topUsers: topUsers || [],
      recentQuestions: recentQuestions || [],
    });
  } catch (error: any) {
    console.error("Admin AI usage error:", error);
    // Return empty data if table doesn't exist
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({
        dailyStats: [],
        tierBreakdown: [],
        topUsers: [],
        recentQuestions: [],
        message: "ai_usage table not created yet"
      });
    }
    return NextResponse.json(
      { error: "Failed to fetch AI usage", details: error.message },
      { status: 500 }
    );
  }
}
