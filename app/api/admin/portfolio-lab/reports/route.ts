/**
 * GET  /api/admin/portfolio-lab/reports          — list latest 30 reports
 * POST /api/admin/portfolio-lab/reports          — generate a new report
 *      body: { reportType: "DAILY_OPERATOR"|"EVENING_RECONCILIATION"|"WEEKLY_REVIEW", reportDate?: "YYYY-MM-DD" }
 *
 * Admin-only. SIMULATED.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { getDefaultPortfolio } from "@/lib/admin/portfolio-lab/portfolioStore";
import { ARCA_DEFAULT_PORTFOLIO_NAME, ARCA_DISCLAIMER } from "@/lib/admin/portfolio-lab/constants";
import { generateReport, listReports, type ReportType } from "@/lib/admin/portfolio-lab/reportEngine";

export const runtime = "nodejs";

const VALID_TYPES: ReportType[] = ["DAILY_OPERATOR", "EVENING_RECONCILIATION", "WEEKLY_REVIEW"];

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) {
    return NextResponse.json({ reports: [], disclaimer: ARCA_DISCLAIMER });
  }
  const url = new URL(req.url);
  const t = url.searchParams.get("type");
  const reportType = t && (VALID_TYPES as string[]).includes(t) ? (t as ReportType) : undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 200);
  const reports = await listReports(admin.workspaceId, portfolio.id, { reportType, limit });
  return NextResponse.json(
    wrapTruth(
      { reports, disclaimer: ARCA_DISCLAIMER },
      {
        source: "arca:reports",
        freshness: "real-time",
        confidence: "high",
        confidenceReason: "Persisted report archive.",
      },
    ),
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  let body: { reportType?: string; reportDate?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const reportType = (body.reportType ?? "DAILY_OPERATOR") as ReportType;
  if (!(VALID_TYPES as string[]).includes(reportType)) {
    return NextResponse.json({ error: `reportType must be one of ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }
  const reportDate = body.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(body.reportDate) ? body.reportDate : undefined;
  try {
    const report = await generateReport({ workspaceId: admin.workspaceId, reportType, reportDate });
    return NextResponse.json({ ok: true, report, disclaimer: ARCA_DISCLAIMER });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
