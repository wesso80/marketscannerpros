/**
 * GET /api/admin/portfolio-lab/analytics
 *
 * One-call payload for the ARCA quant analytics surface:
 *   - headline (Sharpe, Sortino, Calmar, Ulcer, Pain, drawdown, CAGR)
 *   - daily P&L stats, R distribution, exit reasons, holding periods
 *   - Kelly overall + per playbook, risk-of-ruin estimate
 *   - confidence calibration deciles
 *   - open-book stress (if-all-stops/if-all-TP1, concentration)
 *   - benchmark (β, R², IR, capture)
 *   - rolling drawdown + 30-day Sharpe series
 *
 * Admin-only, workspace-isolated, SIMULATED.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { loadAnalytics } from "@/lib/admin/portfolio-lab/analyticsLoader";
import { ARCA_DISCLAIMER } from "@/lib/admin/portfolio-lab/constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const url = new URL(req.url);
  const maxSnapshots = clampInt(url.searchParams.get("snapshots"), 60, 365, 1000);
  const maxTrades = clampInt(url.searchParams.get("trades"), 50, 1000, 5000);

  const out = await loadAnalytics({
    workspaceId: admin.workspaceId,
    maxSnapshots,
    maxTrades,
  });

  if (!out.ok) {
    return NextResponse.json(
      wrapTruth(
        { analytics: null, disclaimer: ARCA_DISCLAIMER, reason: out.reason },
        {
          source: "arca:analytics",
          freshness: "real-time",
          simulated: true,
          confidence: "high",
          confidenceReason: "No ARCA portfolio yet; POST /create-default first.",
        },
      ),
    );
  }

  return NextResponse.json(
    wrapTruth(
      {
        analytics: out.analytics,
        benchmarkSymbol: out.benchmarkSymbol,
        disclaimer: ARCA_DISCLAIMER,
      },
      {
        source: "arca:analytics",
        simulated: true,
        freshness: "real-time",
        confidence: out.analytics.health.sufficientTrades && out.analytics.health.sufficientSnapshots ? "high" : "medium",
        confidenceReason: out.analytics.health.warnings.join(" "),
      },
    ),
  );
}

function clampInt(raw: string | null, lo: number, def: number, hi: number): number {
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
