/**
 * GET /api/admin/portfolio-lab/performance
 *
 * Returns derived performance metrics + benchmark + playbook rollup
 * for the admin's default ARCA portfolio.
 *
 * Admin-only. Workspace-isolated. SIMULATED only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { getDefaultPortfolio } from "@/lib/admin/portfolio-lab/portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME, ARCA_DISCLAIMER } from "@/lib/admin/portfolio-lab/constants";
import { computePerformance } from "@/lib/admin/portfolio-lab/performanceEngine";
import { listBenchmarkSnapshots } from "@/lib/admin/portfolio-lab/benchmarkEngine";
import { listPlaybookPerformance } from "@/lib/admin/portfolio-lab/playbookEngine";
import { listSnapshots } from "@/lib/admin/portfolio-lab/portfolioStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const wsid = admin.workspaceId;
  const portfolio = await getDefaultPortfolio(wsid, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) {
    return NextResponse.json({ portfolio: null, disclaimer: ARCA_DISCLAIMER }, { status: 200 });
  }

  const [perf, benchmark, playbooks, equityCurve] = await Promise.all([
    computePerformance({
      workspaceId: wsid,
      portfolioId: portfolio.id,
      startingBalance: portfolio.startingBalance,
      currentEquity: portfolio.totalEquity,
      realisedPnl: portfolio.realisedPnl,
      unrealisedPnl: portfolio.unrealisedPnl,
    }),
    listBenchmarkSnapshots(wsid, portfolio.id, { limit: 180 }),
    listPlaybookPerformance(wsid, portfolio.id),
    listSnapshots(wsid, portfolio.id, { limit: 180 }),
  ]);

  return NextResponse.json(
    wrapTruth(
      {
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          startingBalance: portfolio.startingBalance,
          totalEquity: portfolio.totalEquity,
          realisedPnl: portfolio.realisedPnl,
          unrealisedPnl: portfolio.unrealisedPnl,
        },
        performance: perf,
        benchmark,
        playbooks,
        equityCurve: equityCurve.reverse().map((s) => ({
          at: s.snapshotAt,
          equity: s.totalEquity,
          drawdownPct: s.drawdownPct,
        })),
        disclaimer: ARCA_DISCLAIMER,
      },
      {
        source: "arca:performance",
        freshness: "real-time",
        confidence: "high",
        confidenceReason: "Computed from arca_portfolio_snapshots + arca_trades.",
      },
    ),
  );
}
