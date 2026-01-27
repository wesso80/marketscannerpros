// app/api/me/route.ts
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";

// Admin emails that can access all features for testing
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "bradleywessling@yahoo.com.au,arcabulls@gmail.com").split(",").map(e => e.trim().toLowerCase());

async function getEmailFromWorkspace(workspaceId: string): Promise<string | null> {
  try {
    const rows = await q<{ email: string }>(
      'SELECT email FROM user_subscriptions WHERE workspace_id = $1 LIMIT 1',
      [workspaceId]
    );
    return rows.length > 0 ? rows[0].email : null;
  } catch {
    return null;
  }
}

// Extract email from cid if it's a trial user (format: "trial_email@example.com")
function extractEmailFromCid(cid: string): string | null {
  if (cid.startsWith('trial_')) {
    return cid.substring(6); // Remove "trial_" prefix
  }
  // Check if cid itself looks like an email
  if (cid.includes('@')) {
    return cid;
  }
  return null;
}

export async function GET() {
  const session = await getSessionFromCookie();
  
  if (!session) {
    return NextResponse.json({ 
      tier: "free", 
      workspaceId: null,
      authenticated: false,
      isAdmin: false,
      email: null
    });
  }

  // Try to get email from multiple sources
  let email = await getEmailFromWorkspace(session.workspaceId);
  
  // Fallback: extract email from cid (for trial users)
  if (!email && session.cid) {
    email = extractEmailFromCid(session.cid);
  }
  
  // Check if user is admin
  const isAdmin = email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;

  return NextResponse.json({ 
    tier: session.tier, 
    workspaceId: session.workspaceId,
    authenticated: true,
    isAdmin,
    email: email || null
  });
}
