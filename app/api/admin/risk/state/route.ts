/**
 * GET /api/admin/risk/state — Risk governor state for admin terminal
 * Returns current risk metrics: exposure, drawdown, correlation, kill switch.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { loadAdminRiskSnapshot } from "@/lib/admin/scan-context";
import { equityHistoryNotes } from "@/lib/admin/equityHistoryHealth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Auth gate
  const adminAuth = await requireAdmin(req);
  let workspaceId = adminAuth.ok ? adminAuth.workspaceId : undefined;
  if (!adminAuth.ok) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    workspaceId = session.workspaceId;
  }
  if (!workspaceId) return NextResponse.json({ error: "Workspace required" }, { status: 403 });

  try {
    const [riskState, historyNotes] = await Promise.all([loadAdminRiskSnapshot(workspaceId), equityHistoryNotes(workspaceId)]);

    return NextResponse.json({ ...riskState, notes: [...riskState.notes, ...historyNotes] });
  } catch (err: unknown) {
    console.error("[admin:risk:state] Error:", err);
    return NextResponse.json(
      { error: "Risk state fetch failed" },
      { status: 500 },
    );
  }
}
