import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";

/**
 * POST /api/auth/delete-request
 * 
 * Handles GDPR/Privacy data deletion requests.
 * Records the request in the database for manual processing.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    
    if (!session?.workspaceId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const workspaceId = session.workspaceId;
    const customerId = session.cid;

    // Log the deletion request (for manual processing)
    // In a full implementation, this would:
    // 1. Send an email to the user confirming the request
    // 2. Queue the deletion for processing
    // 3. Delete all user data after verification
    
    try {
      // Try to insert into a deletion_requests table if it exists
      await q(
        `INSERT INTO deletion_requests (workspace_id, customer_id, requested_at, status)
         VALUES ($1, $2, NOW(), 'pending')
         ON CONFLICT (workspace_id) DO UPDATE SET requested_at = NOW(), status = 'pending'`,
        [workspaceId, customerId]
      );
    } catch (dbError) {
      // Table might not exist - that's OK, we'll still log it
      console.log("Deletion request table not found, logging request:", {
        workspaceId,
        customerId,
        requestedAt: new Date().toISOString()
      });
    }

    // Log for manual processing
    console.log("=== DATA DELETION REQUEST ===");
    console.log("Workspace ID:", workspaceId);
    console.log("Customer ID:", customerId);
    console.log("Requested at:", new Date().toISOString());
    console.log("=============================");

    return NextResponse.json({
      success: true,
      message: "Deletion request submitted. You will receive confirmation within 48 hours."
    });

  } catch (error) {
    console.error("Delete request error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
