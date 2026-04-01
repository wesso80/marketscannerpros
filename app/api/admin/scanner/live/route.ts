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
import { isAdminSecret } from "@/lib/quant/operatorAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { runScan } from "@/lib/operator/orchestrator";
import type { ScanContext } from "@/lib/operator/orchestrator";
import type { Market } from "@/types/operator";
import { alphaVantageProvider } from "@/lib/operator/market-data";
import { scanResultToHits, scanResultToHealth } from "@/lib/admin/serializer";
import { recordSignals } from "@/lib/admin/signal-recorder";

export const runtime = "nodejs";

const DEFAULT_CONTEXT: ScanContext = {
  portfolioState: {
    equity: 100000,
    dailyPnl: 0,
    drawdownPct: 0,
    openRisk: 0,
    correlationRisk: 0,
    activePositions: 0,
    killSwitchActive: false,
  },
  riskPolicy: {
    maxDailyLossPct: 0.02,
    maxDrawdownPct: 0.06,
    maxOpenRiskPct: 0.05,
    maxCorrelationRisk: 0.7,
  },
  executionEnvironment: {
    brokerConnected: false,
    estimatedSlippageBps: 10,
    minLiquidityOk: true,
  },
  accountState: {
    buyingPower: 100000,
    accountRiskUnit: 0.01,
  },
  instrumentMeta: {},
  healthContext: {
    symbolTrustScore: 0.7,
    playbookHealthScore: 0.7,
    modelHealthScore: 0.7,
  },
  metaHealthThrottle: 1.0,
};

const DEFAULT_SYMBOLS = ["ADA", "SUI", "MATIC", "FET", "SOL", "AVAX", "DOT", "LINK"];

export async function GET(req: NextRequest) {
  // Auth gate
  const adminAuth = isAdminSecret(req.headers.get("authorization"));
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

    const result = await runScan(
      { symbols, market, timeframe },
      DEFAULT_CONTEXT,
      alphaVantageProvider,
    );

    const hits = scanResultToHits(result);
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
