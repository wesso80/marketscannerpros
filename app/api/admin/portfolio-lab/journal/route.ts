/**
 * GET /api/admin/portfolio-lab/journal
 *   ?symbol=...&types=ENTRY,EXIT&limit=N
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { getDefaultPortfolio, listJournal } from "@/lib/admin/portfolio-lab/portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME } from "@/lib/admin/portfolio-lab/constants";
import type { JournalType } from "@/lib/admin/portfolio-lab/types";

export const runtime = "nodejs";

const VALID: JournalType[] = ["ENTRY", "UPDATE", "EXIT", "REVIEW", "ERROR", "OVERRIDE", "REJECTED", "RISK_BLOCK"];

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json(wrapTruth({ journal: [] }, { source: "arca:journal", simulated: true }));

  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") || undefined;
  const typesParam = url.searchParams.get("types");
  const types: JournalType[] | undefined = typesParam
    ? typesParam.split(",").map((s) => s.trim() as JournalType).filter((s) => VALID.includes(s))
    : undefined;
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));

  const journal = await listJournal(admin.workspaceId, portfolio.id, { symbol: symbol || undefined, types, limit });
  return NextResponse.json(
    wrapTruth({ journal }, { source: "arca:journal", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}
