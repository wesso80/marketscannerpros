import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { timingSafeEqual } from 'crypto';

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// GPT-4o-mini pricing (as of Dec 2024)
const PRICING = {
  'gpt-4o-mini': {
    input: 0.00000015,   // $0.15 per 1M tokens
    output: 0.0000006,   // $0.60 per 1M tokens
  },
  'gpt-4o': {
    input: 0.0000025,    // $2.50 per 1M tokens
    output: 0.00001,     // $10.00 per 1M tokens
  }
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  const adminSecret = process.env.ADMIN_SECRET || '';
  
  if (!secret || !adminSecret || !timingSafeCompare(secret, adminSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get token usage stats
    const [
      todayStats,
      last7DaysStats,
      last30DaysStats,
      hourlyToday,
      byTier,
      topCostUsers
    ] = await Promise.all([
      // Today's totals
      q(`SELECT 
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COUNT(*) as requests
        FROM ai_usage 
        WHERE DATE(created_at AT TIME ZONE 'Australia/Sydney') = (NOW() AT TIME ZONE 'Australia/Sydney')::date`),
      
      // Last 7 days by day
      q(`SELECT 
          DATE(created_at) as date,
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COUNT(*) as requests
        FROM ai_usage 
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at) 
        ORDER BY date DESC`),
      
      // Last 30 days total
      q(`SELECT 
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COUNT(*) as requests
        FROM ai_usage 
        WHERE created_at > NOW() - INTERVAL '30 days'`),
      
      // Hourly breakdown today
      q(`SELECT 
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'Australia/Sydney') as hour,
          COALESCE(SUM(total_tokens), 0) as tokens,
          COUNT(*) as requests
        FROM ai_usage 
        WHERE DATE(created_at AT TIME ZONE 'Australia/Sydney') = (NOW() AT TIME ZONE 'Australia/Sydney')::date
        GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Australia/Sydney')
        ORDER BY hour`),
      
      // Usage by tier
      q(`SELECT 
          tier,
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COUNT(*) as requests
        FROM ai_usage 
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY tier`),
      
      // Top cost users (30 days)
      q(`SELECT 
          workspace_id,
          tier,
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COUNT(*) as requests
        FROM ai_usage 
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY workspace_id, tier
        ORDER BY (COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0)) DESC
        LIMIT 10`)
    ]);

    // Calculate costs
    const calculateCost = (promptTokens: number, completionTokens: number, model = 'gpt-4o-mini') => {
      const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o-mini'];
      return (promptTokens * pricing.input) + (completionTokens * pricing.output);
    };

    const today = todayStats[0] || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, requests: 0 };
    const month = last30DaysStats[0] || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, requests: 0 };

    return NextResponse.json({
      pricing: PRICING['gpt-4o-mini'],
      today: {
        promptTokens: parseInt(today.prompt_tokens) || 0,
        completionTokens: parseInt(today.completion_tokens) || 0,
        totalTokens: parseInt(today.total_tokens) || 0,
        requests: parseInt(today.requests) || 0,
        cost: calculateCost(parseInt(today.prompt_tokens) || 0, parseInt(today.completion_tokens) || 0),
      },
      last7Days: (last7DaysStats || []).map(day => ({
        date: day.date,
        promptTokens: parseInt(day.prompt_tokens) || 0,
        completionTokens: parseInt(day.completion_tokens) || 0,
        totalTokens: parseInt(day.total_tokens) || 0,
        requests: parseInt(day.requests) || 0,
        cost: calculateCost(parseInt(day.prompt_tokens) || 0, parseInt(day.completion_tokens) || 0),
      })),
      last30Days: {
        promptTokens: parseInt(month.prompt_tokens) || 0,
        completionTokens: parseInt(month.completion_tokens) || 0,
        totalTokens: parseInt(month.total_tokens) || 0,
        requests: parseInt(month.requests) || 0,
        cost: calculateCost(parseInt(month.prompt_tokens) || 0, parseInt(month.completion_tokens) || 0),
      },
      hourlyToday: hourlyToday || [],
      byTier: (byTier || []).map(t => ({
        tier: t.tier,
        promptTokens: parseInt(t.prompt_tokens) || 0,
        completionTokens: parseInt(t.completion_tokens) || 0,
        requests: parseInt(t.requests) || 0,
        cost: calculateCost(parseInt(t.prompt_tokens) || 0, parseInt(t.completion_tokens) || 0),
      })),
      topCostUsers: (topCostUsers || []).map(u => ({
        workspaceId: u.workspace_id,
        tier: u.tier,
        promptTokens: parseInt(u.prompt_tokens) || 0,
        completionTokens: parseInt(u.completion_tokens) || 0,
        requests: parseInt(u.requests) || 0,
        cost: calculateCost(parseInt(u.prompt_tokens) || 0, parseInt(u.completion_tokens) || 0),
      })),
    });
  } catch (error: any) {
    console.error("Admin costs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch costs", details: error.message },
      { status: 500 }
    );
  }
}
