import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Try to get subscriptions - table may not exist yet
    let result;
    try {
      result = await sql`
        SELECT 
          us.id,
          us.workspace_id,
          us.stripe_customer_id,
          us.tier,
          us.status,
          us.current_period_start,
          us.current_period_end,
          us.created_at,
          w.email
        FROM user_subscriptions us
        LEFT JOIN workspaces w ON us.workspace_id = w.workspace_id
        ORDER BY us.created_at DESC
        LIMIT 100
      `;
    } catch (joinError) {
      // If join fails, try without it
      console.warn("Join failed, trying without email:", joinError);
      result = await sql`
        SELECT 
          id,
          workspace_id,
          stripe_customer_id,
          tier,
          status,
          current_period_start,
          current_period_end,
          created_at,
          NULL as email
        FROM user_subscriptions
        ORDER BY created_at DESC
        LIMIT 100
      `;
    }

    return NextResponse.json({ subscriptions: result.rows });
  } catch (error: any) {
    console.error("Admin subscriptions error:", error);
    // Return empty array instead of error if table doesn't exist
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ subscriptions: [], message: "Table not created yet" });
    }
    return NextResponse.json(
      { error: "Failed to fetch subscriptions", details: error.message },
      { status: 500 }
    );
  }
}
