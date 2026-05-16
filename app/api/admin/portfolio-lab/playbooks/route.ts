/**
 * GET /api/admin/portfolio-lab/playbooks
 *
 * Returns the persisted arca_playbook_performance rollup — one row per
 * playbook with win rate, average R, expectancy, max drawdown, and the
 * best/worst asset class. Workspace-isolated, admin-gated, SIMULATED.
 *
 * The rollup is recomputed at the end of every `simulateArcaCycle`, so
 * this route is a plain read.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { getDefaultPortfolio } from "@/lib/admin/portfolio-lab/portfolioStore";
import { listPlaybookPerformance } from "@/lib/admin/portfolio-lab/playbookEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) {
    return NextResponse.json(
      wrapTruth({ playbooks: [] }, { source: "arca:playbooks", simulated: true, freshness: "real-time", confidence: "high" }),
    );
  }
  const playbooks = await listPlaybookPerformance(admin.workspaceId, portfolio.id);
  return NextResponse.json(
    wrapTruth(
      { playbooks },
      {
        source: "arca:playbooks",
        simulated: true,
        freshness: "real-time",
        confidence: "high",
        confidenceReason: "Rollup recomputed each simulateArcaCycle from arca_trades.",
      },
    ),
  );
}
