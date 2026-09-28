/**
 * GET /api/admin/portfolio-lab/positions  → open positions
 * POST /api/admin/portfolio-lab/positions → manual sim close
 *   body: { positionId: string, exitPrice: number, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  getDefaultPortfolio,
  getPortfolioById,
  listOpenPositions,
} from "@/lib/admin/portfolio-lab/portfolioStore";
import { manualSimClose } from "@/lib/admin/portfolio-lab/positionEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";
import { q, atomicQueries } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json(wrapTruth({ positions: [] }, { source: "arca:positions", simulated: true }));
  const positions = await listOpenPositions(admin.workspaceId, portfolio.id);
  return NextResponse.json(
    wrapTruth({ positions }, { source: "arca:positions", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    positionId?: string;
    exitPrice?: number;
    reason?: string;
  };
  if (!body.positionId || (!Number.isFinite(body.exitPrice) || Number(body.exitPrice) <= 0)) {
    return NextResponse.json({ error: "positionId and exitPrice required" }, { status: 400 });
  }
  return atomicQueries(async () => {
    const portfolio = await getDefaultPortfolio(admin.workspaceId!, ARCA_DEFAULT_PORTFOLIO_NAME);
    if (!portfolio) return NextResponse.json({ error: "No ARCA portfolio" }, { status: 404 });
    // Same balance-row lock as the scheduled cycle/reset. Re-read after waiting for it.
    await q(`SELECT id FROM arca_portfolios WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [admin.workspaceId, portfolio.id]);
    const current = await getPortfolioById(admin.workspaceId!, portfolio.id);
    if (!current || current.mode !== 'SIMULATED') return NextResponse.json({ error: 'Simulated portfolio required' }, { status: 409 });
    const opens = await listOpenPositions(admin.workspaceId!, portfolio.id);
    const pos = opens.find(p => p.id === body.positionId);
    if (!pos) return NextResponse.json({ error: "Position not found or already closed" }, { status: 404 });
    const result = await manualSimClose({ portfolio: current, position: pos,
      exitPrice: Number(body.exitPrice), reason: body.reason || "manual_close" });
    return NextResponse.json(wrapTruth(result, { source: "arca:positions:close", simulated: true, freshness: "real-time", confidence: "high" }));
  });
}
