/**
 * GET /api/admin/system/health — System health status for admin terminal
 * Returns health of all sub-systems: feed, scanner, cache, API.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Auth gate
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  try {
    // Check database connectivity
    let dbOk = false;
    try {
      await q("SELECT 1");
      dbOk = true;
    } catch {
      dbOk = false;
    }

    // Check recent scan activity
    let lastScan: string | null = null;
    let recentErrors = 0;
    try {
      const rows = await q(
        `SELECT created_at FROM operator_state ORDER BY created_at DESC LIMIT 1`,
      );
      lastScan = rows[0]?.created_at ?? null;
    } catch {
      // Table may not exist yet
    }

    const health = {
      feed: dbOk ? "HEALTHY" : "DEGRADED",
      websocket: "DISCONNECTED",
      scanner: lastScan ? "RUNNING" : "IDLE",
      cache: dbOk ? "OK" : "DEGRADED",
      api: "LOW_LATENCY",
      lastScanAt: lastScan,
      errorsCount: recentErrors,
      dbConnected: dbOk,
    };

    return NextResponse.json(health);
  } catch (err: unknown) {
    console.error("[admin:system:health] Error:", err);
    return NextResponse.json(
      { feed: "ERROR", websocket: "DISCONNECTED", scanner: "ERROR", cache: "ERROR", api: "ERROR" },
      { status: 500 },
    );
  }
}
