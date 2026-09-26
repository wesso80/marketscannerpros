/**
 * GET /api/admin/system/health — System health status for admin terminal
 * Returns what is actually measured: DB ping and the shared-scan run log (feed/scanner). Websocket, cache and
 * API latency are not probed and are reported as NOT MONITORED.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";
import { feedLabel, loadScannerHealth, NOT_MONITORED, scannerLabel } from "@/lib/admin/healthProbes";

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

    // Scanner state from the shared saved scan's run log (admin_scan_runs). It used to read operator_state,
    // which the shared scan no longer writes, and called the scanner RUNNING if any row had ever existed.
    const scanner = dbOk ? await loadScannerHealth() : null;
    const failedLastRun = scanner?.markets.filter((m) => m.status !== "PAUSED").reduce((n, m) => n + m.failed, 0) ?? 0;

    const health = {
      feed: feedLabel(scanner),
      // Not measured anywhere: there is no websocket, and API latency / cache are not probed here.
      websocket: NOT_MONITORED,
      scanner: scannerLabel(scanner),
      cache: NOT_MONITORED,
      api: NOT_MONITORED,
      lastScanAt: scanner?.lastRunAt ?? null,
      errorsCount: failedLastRun,
      dbConnected: dbOk,
      scannerDetail: scanner,
    };

    return NextResponse.json(health);
  } catch (err: unknown) {
    console.error("[admin:system:health] Error:", err);
    return NextResponse.json(
      { feed: "ERROR", websocket: NOT_MONITORED, scanner: "ERROR", cache: NOT_MONITORED, api: NOT_MONITORED },
      { status: 500 },
    );
  }
}
