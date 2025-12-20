import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sql`
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

    return NextResponse.json({ subscriptions: result.rows });
  } catch (error: any) {
    console.error("Admin subscriptions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions", details: error.message },
      { status: 500 }
    );
  }
}
