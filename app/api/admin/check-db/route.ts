import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if token columns exist
    const columns = await q(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ai_usage' 
      ORDER BY ordinal_position
    `);
    
    // Get sample recent records
    const recent = await q(`
      SELECT id, workspace_id, tier, prompt_tokens, completion_tokens, total_tokens, model, created_at
      FROM ai_usage 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    // Check if migration is needed
    const hasTokenCols = columns.some((c: any) => c.column_name === 'prompt_tokens');
    
    return NextResponse.json({
      columns: columns.map((c: any) => c.column_name),
      hasTokenColumns: hasTokenCols,
      recentRecords: recent,
      message: hasTokenCols ? "Token columns exist" : "Migration needed - run 012_ai_usage_tokens.sql"
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      hint: "Check if ai_usage table exists"
    }, { status: 500 });
  }
}
