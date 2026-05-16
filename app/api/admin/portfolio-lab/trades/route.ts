/**
 * GET /api/admin/portfolio-lab/trades  → closed-trade ledger
 *   ?limit=N  (default 100)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { getDefaultPortfolio, listTrades } from "@/lib/admin/portfolio-lab/portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json(wrapTruth({ trades: [] }, { source: "arca:trades", simulated: true }));

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
  const trades = await listTrades(admin.workspaceId, portfolio.id, { limit });
  return NextResponse.json(
    wrapTruth({ trades }, { source: "arca:trades", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}
