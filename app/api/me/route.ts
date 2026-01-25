// app/api/me/route.ts
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";

// Admin emails that can access all features for testing
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "bradleywesslings@yahoo.com.au").split(",").map(e => e.trim().toLowerCase());

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

  // Get email from database to check admin status
  const email = await getEmailFromWorkspace(session.workspaceId);
  const isAdmin = email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;

  return NextResponse.json({ 
    tier: session.tier, 
    workspaceId: session.workspaceId,
    authenticated: true,
    isAdmin,
    email: email || null
  });
}
