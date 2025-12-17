import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Manual trigger for generating AI Market Focus.
 * Only accessible to authenticated pro_trader users or with admin API key.
 */
export async function POST(req: NextRequest) {
  // Check for admin API key or pro_trader session
  const apiKey = req.headers.get("x-api-key");
  const adminKey = process.env.ADMIN_API_KEY;
  
  let authorized = false;
  
  if (adminKey && apiKey === adminKey) {
    authorized = true;
  } else {
    const session = await getSessionFromCookie();
    if (session?.tier === "pro_trader") {
      authorized = true;
    }
  }
  
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized - Pro Trader access required" }, { status: 401 });
  }

  // Forward to the job endpoint with the cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/jobs/generate-market-focus`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to trigger generation" }, { status: 500 });
  }
}
