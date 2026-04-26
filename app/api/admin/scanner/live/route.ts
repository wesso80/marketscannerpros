/**
 * GET /api/admin/scanner/live — Live scanner feed for admin terminal
 * Runs the operator engine scan pipeline and returns ScannerHit[] for the UI.
 *
 * Query params:
 *   ?symbols=ADA,SUI,MATIC,FET (comma-separated)
 *   &market=CRYPTO (default)
 *   &timeframe=15m (default)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { runScan } from "@/lib/operator/orchestrator";
import type { Market } from "@/types/operator";
import { alphaVantageProvider } from "@/lib/operator/market-data";
import { scanResultToHits, scanResultToHealth } from "@/lib/admin/serializer";
import { recordSignals } from "@/lib/admin/signal-recorder";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { enrichHitsWithExpectancy } from "@/lib/admin/expectancy";

export const runtime = "nodejs";

const DEFAULT_SYMBOLS = ["ADA", "SUI", "MATIC", "FET", "SOL", "AVAX", "DOT", "LINK"];

export async function GET(req: NextRequest) {
  // Auth gate
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const symbols = searchParams.get("symbols")
      ? searchParams.get("symbols")!.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : DEFAULT_SYMBOLS;
    const market = (searchParams.get("market") || "CRYPTO") as Market;
    const timeframe = searchParams.get("timeframe") || "15m";

    const { context, risk } = await buildAdminScanContext();

    const result = await runScan(
      { symbols, market, timeframe },
      context,
      alphaVantageProvider,
    );

    const hits = await enrichHitsWithExpectancy(
      scanResultToHits(result).map((hit) => ({ ...hit, riskSource: risk.source })),
    );
    const health = scanResultToHealth(result, true);

    // Fire-and-forget: log signals for outcome tracking
    recordSignals(result.pipelines, market, timeframe).catch((err) =>
      console.error("[admin:scanner:live] Signal recording error:", err),
    );

    return NextResponse.json({
      hits,
      health,
      meta: {
        symbolsScanned: result.symbolsScanned,
        errorsCount: result.errors.length,
        errors: result.errors,
        timestamp: result.timestamp,
        engineVersions: result.engineVersions,
        environmentMode: result.environmentMode,
        risk,
      },
    });
  } catch (err: unknown) {
    console.error("[admin:scanner:live] Error:", err);
    return NextResponse.json(
      { error: "Scan failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
