/**
 * GET /api/admin/rank-calibration
 *
 * Read-only diagnostic: returns the current opportunityRankScore axis
 * weights side-by-side with weights derived from realised forward
 * outcomes (Tier 1 #3). Operators use this to decide whether to update
 * the live weights in lib/admin/edgePacket.ts:computeRankScore.
 *
 * The live scoring function is NOT modified by this endpoint.
 * Per data-integrity rule, when the sample is too small the response
 * marks status="insufficient" rather than fabricate weights.
 *
 * Query params:
 *   ?windowDays=90  (default 90, clamped 7..365)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { wrapTruth } from "@/lib/admin";
import { computeRankCalibration } from "@/lib/admin/rankCalibration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId: string }> {
  const adminAuth = await requireAdmin(req);
  if (adminAuth.ok) return { ok: true, workspaceId: adminAuth.workspaceId || "admin" };
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid, session.workspaceId)) {
    return { ok: false, workspaceId: "" };
  }
  return { ok: true, workspaceId: session.workspaceId };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("windowDays") ?? 90);
  const windowDays = Number.isFinite(raw) ? Math.max(7, Math.min(365, Math.round(raw))) : 90;

  const report = await computeRankCalibration(auth.workspaceId, windowDays);

  return NextResponse.json({
    ok: true,
    report,
    truth: wrapTruth(
      { source: "admin:rank-calibration", workspaceId: auth.workspaceId },
      {
        source: "admin:rank-calibration",
        freshness: report.status === "ok" ? "real-time" : "delayed",
        simulated: false,
        confidence: report.status === "ok" ? "high" : "low",
        confidenceReason:
          report.status === "ok"
            ? `Spearman correlation across ${report.sampleSize} closed outcomes in last ${windowDays}d.`
            : report.status === "insufficient"
              ? `Sample ${report.sampleSize} < ${report.minRequired}; current weights remain authoritative.`
              : "Calibration query failed; see report.notes.",
      },
    ),
  });
}
