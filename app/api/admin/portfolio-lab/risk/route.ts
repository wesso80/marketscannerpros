/**
 * GET  /api/admin/portfolio-lab/risk           → risk events (?onlyUnack=1)
 * POST /api/admin/portfolio-lab/risk/ack       → acknowledge { eventId, note? }
 *   (acknowledgement handled by separate /ack route)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { getDefaultPortfolio, listRiskEvents } from "@/lib/admin/portfolio-lab/portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json(wrapTruth({ events: [] }, { source: "arca:risk", simulated: true }));

  const url = new URL(req.url);
  const onlyUnack = url.searchParams.get("onlyUnack") === "1";
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
  const events = await listRiskEvents(admin.workspaceId, portfolio.id, { onlyUnacknowledged: onlyUnack, limit });
  return NextResponse.json(
    wrapTruth({ events }, { source: "arca:risk", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}
