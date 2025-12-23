import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await q(`
      SELECT * FROM delete_requests 
      ORDER BY 
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 100
    `);

    return NextResponse.json({ requests: result });
  } catch (error: any) {
    console.error("Admin delete requests error:", error);
    // Return empty if table doesn't exist
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ requests: [], message: "Run migration 006_delete_requests.sql" });
    }
    return NextResponse.json(
      { error: "Failed to fetch requests", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "");
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, status, notes } = await req.json();
    
    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    if (!["pending", "processing", "completed", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const result = await q(`
      UPDATE delete_requests 
      SET status = $1, 
          processed_at = $2,
          admin_notes = COALESCE($3, admin_notes)
      WHERE id = $4
      RETURNING *
    `, [status, status === 'completed' ? new Date().toISOString() : null, notes, id]);

    if (result.length === 0) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    return NextResponse.json({ request: result[0] });
  } catch (error: any) {
    console.error("Admin update delete request error:", error);
    return NextResponse.json(
      { error: "Failed to update request", details: error.message },
      { status: 500 }
    );
  }
}
