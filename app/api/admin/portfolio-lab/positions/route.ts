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
  listOpenPositions,
} from "@/lib/admin/portfolio-lab/portfolioStore";
import { manualSimClose } from "@/lib/admin/portfolio-lab/positionEngine";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";
import { q } from "@/lib/db";

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
  if (!body.positionId || !Number.isFinite(body.exitPrice)) {
    return NextResponse.json({ error: "positionId and exitPrice required" }, { status: 400 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json({ error: "No ARCA portfolio" }, { status: 404 });

  // Fetch single position row.
  const opens = await listOpenPositions(admin.workspaceId, portfolio.id);
  const pos = opens.find((p) => p.id === body.positionId);
  if (!pos) return NextResponse.json({ error: "Position not found or already closed" }, { status: 404 });

  const result = await manualSimClose({
    portfolio,
    position: pos,
    exitPrice: Number(body.exitPrice),
    reason: body.reason || "manual_close",
  });
  // touch to avoid unused warning of q
  void q;
  return NextResponse.json(
    wrapTruth(result, { source: "arca:positions:close", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}
