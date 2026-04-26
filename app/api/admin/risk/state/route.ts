/**
 * GET /api/admin/risk/state — Risk governor state for admin terminal
 * Returns current risk metrics: exposure, drawdown, correlation, kill switch.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { loadAdminRiskSnapshot } from "@/lib/admin/scan-context";

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
    const riskState = await loadAdminRiskSnapshot();

    return NextResponse.json(riskState);
  } catch (err: unknown) {
    console.error("[admin:risk:state] Error:", err);
    return NextResponse.json(
      { error: "Risk state fetch failed" },
      { status: 500 },
    );
  }
}
