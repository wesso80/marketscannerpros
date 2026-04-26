/**
 * GET /api/admin/risk/state — Risk governor state for admin terminal
 * Returns current risk metrics: exposure, drawdown, correlation, kill switch.
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
    // Pull latest operator state for risk metrics
    let riskState = {
      openExposure: 0,
      dailyDrawdown: 0,
      correlationRisk: 0,
      maxPositions: 10,
      activePositions: 0,
      killSwitchActive: false,
      permission: "WAIT" as string,
      sizeMultiplier: 1.0,
    };

    try {
      const rows = await q(
        `SELECT context_state FROM operator_state ORDER BY created_at DESC LIMIT 1`,
      );
      if (rows[0]?.context_state) {
        const ctx = rows[0].context_state;
        riskState = {
          openExposure: ctx.openRisk ?? 0,
          dailyDrawdown: ctx.dailyDrawdown ?? 0,
          correlationRisk: ctx.correlationRisk ?? 0,
          maxPositions: ctx.maxPositions ?? 10,
          activePositions: ctx.activePositions ?? 0,
          killSwitchActive: ctx.killSwitchActive ?? false,
          permission: ctx.killSwitchActive ? "BLOCK" : "WAIT",
          sizeMultiplier: ctx.sizeMultiplier ?? 1.0,
        };
      }
    } catch {
      // Table may not exist yet — return defaults
    }

    return NextResponse.json(riskState);
  } catch (err: unknown) {
    console.error("[admin:risk:state] Error:", err);
    return NextResponse.json(
      { error: "Risk state fetch failed" },
      { status: 500 },
    );
  }
}
