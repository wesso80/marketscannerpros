import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, loggedErrorCode } from "@/lib/auth";
import { q } from "@/lib/db";
import { sendDeletionRequestEmail } from "@/lib/email";

/**
 * POST /api/auth/delete-request
 *
 * Records a GDPR/privacy deletion request in deletion_requests and emails
 * support. The 48-hour confirmation is promised only when one of those records.
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
    const requestedAt = new Date().toISOString();

    let stored = false;
    let mailed = false;
    let storeError: unknown;
    let mailError: unknown;

    try {
      await q(
        `INSERT INTO deletion_requests (workspace_id, customer_id, requested_at, status)
         VALUES ($1, $2, NOW(), 'pending')
         ON CONFLICT (workspace_id) DO UPDATE SET requested_at = NOW(), status = 'pending'`,
        [workspaceId, customerId]
      );
      stored = true;
    } catch (error) {
      storeError = error;
    }

    try {
      await sendDeletionRequestEmail({ workspaceId, customerId, requestedAt });
      mailed = true;
    } catch (error) {
      mailError = error;
    }

    if (!stored && !mailed) {
      console.error('Deletion request was not recorded', {
        code: loggedErrorCode(storeError) ?? loggedErrorCode(mailError),
      });
      return NextResponse.json(
        { error: "Failed to process request" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Deletion request submitted. You will receive confirmation within 48 hours."
    });

  } catch (error) {
    console.error('Delete request error', { code: loggedErrorCode(error) });
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
