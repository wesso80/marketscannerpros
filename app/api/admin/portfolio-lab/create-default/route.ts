/**
 * POST /api/admin/portfolio-lab/create-default
 *
 * Idempotent. Creates the default ARCA Internal Fund at $200,000 if
 * it does not already exist for this workspace.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { createDefaultArcaPortfolio } from "@/lib/admin/portfolio-lab/createPortfolio";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const result = await createDefaultArcaPortfolio(admin.workspaceId);
  return NextResponse.json(
    wrapTruth(result, {
      source: "arca:create-default",
      simulated: true,
      freshness: "real-time",
      confidence: "high",
      confidenceReason: result.created ? "Newly initialised." : "Already exists.",
    }),
  );
}
