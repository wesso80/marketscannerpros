import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Try to get subscriptions with the updated schema
    let result;
    try {
      result = await sql`
        SELECT 
          id,
          workspace_id,
          email,
          tier,
          status,
          stripe_customer_id,
          stripe_subscription_id,
          current_period_end,
          is_trial,
          created_at,
          updated_at
        FROM user_subscriptions
        ORDER BY updated_at DESC
        LIMIT 100
      `;
    } catch (selectError: any) {
      // If select fails, check if it's a column issue
      console.warn("Select failed:", selectError.message);
      // Try with minimal columns
      result = await sql`
        SELECT 
          id,
          workspace_id,
          tier,
          status,
          created_at
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
