/**
 * GET /api/admin/portfolio-lab/summary
 *
 * One-call payload for the ARCA dashboard: portfolio header,
 * open positions, pending orders, recent journal, recent risk events,
 * and the most recent equity snapshot.
 *
 * Admin-only. Workspace-isolated. SIMULATED state only — never broker data.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  getDefaultPortfolio,
  listOpenPositions,
  listOrders,
  listJournal,
  listRiskEvents,
  listSnapshots,
} from "@/lib/admin/portfolio-lab/portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME, ARCA_DISCLAIMER } from "@/lib/admin/portfolio-lab/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const wsid = admin.workspaceId;
  const portfolio = await getDefaultPortfolio(wsid, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) {
    return NextResponse.json(
      wrapTruth(
        { portfolio: null, disclaimer: ARCA_DISCLAIMER },
        {
          source: "arca:portfolio-lab",
          freshness: "real-time",
          confidence: "high",
          confidenceReason: "No ARCA portfolio yet; call POST /create-default to initialise.",
        },
      ),
    );
  }
  const [positions, orders, journal, risk, snapshots] = await Promise.all([
    listOpenPositions(wsid, portfolio.id),
    listOrders(wsid, portfolio.id, { status: ["PLANNED", "WAITING_FOR_TRIGGER", "TRIGGERED"] }),
    listJournal(wsid, portfolio.id, { limit: 25 }),
    listRiskEvents(wsid, portfolio.id, { onlyUnacknowledged: false, limit: 25 }),
    listSnapshots(wsid, portfolio.id, { limit: 60 }),
  ]);

  return NextResponse.json(
    wrapTruth(
      {
        portfolio,
        positions,
        orders,
        journal,
        risk,
        snapshots,
        disclaimer: ARCA_DISCLAIMER,
      },
      {
        source: "arca:portfolio-lab",
        freshness: "real-time",
        simulated: true,
        confidence: "high",
        confidenceReason: "ARCA is paper-only; all data is internal ledger state.",
      },
    ),
  );
}
