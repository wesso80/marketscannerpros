/**
 * GET /api/admin/symbol/[symbol] — Full symbol intelligence for admin terminal
 * Runs the operator engine on a single symbol and returns AdminSymbolIntelligence.
 *
 * Query params:
 *   ?market=CRYPTO (default)
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
import { pipelineToSymbolIntelligence } from "@/lib/admin/serializer";
import { emptyTruth } from "@/lib/admin/truth-layer";

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
    brokerConnected: true,
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  // Auth gate
  const adminAuth = isAdminSecret(req.headers.get("authorization"));
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  try {
    const { symbol: rawSymbol } = await params;
    const symbol = decodeURIComponent(rawSymbol).toUpperCase();
    const { searchParams } = new URL(req.url);
    const market = (searchParams.get("market") || "CRYPTO") as Market;
    const timeframe = searchParams.get("timeframe") || "15m";

    const result = await runScan(
      { symbols: [symbol], market, timeframe },
      DEFAULT_CONTEXT,
      alphaVantageProvider,
    );

    if (result.pipelines.length === 0) {
      // No candidates found — return basic data
      return NextResponse.json({
        symbol,
        timeframe,
        session: "UNKNOWN",
        price: 0,
        changePercent: 0,
        bias: "NEUTRAL",
        regime: "ROTATIONAL_RANGE",
        permission: "WAIT",
        confidence: 0,
        symbolTrust: 50,
        sizeMultiplier: 0,
        lastScanAt: result.timestamp,
        blockReasons: result.errors.map((e) => e.error),
        penalties: [],
        indicators: { ema20: 0, ema50: 0, ema200: 0, vwap: 0, atr: 0, bbwpPercentile: 0, adx: 0, rvol: 0 },
        dve: { state: "NEUTRAL", direction: "NEUTRAL", persistence: 0, breakoutReadiness: 0, trap: false, exhaustion: false },
        timeConfluence: { score: 0, hotWindow: false, alignmentCount: 0, nextClusterAt: "" },
        levels: { pdh: 0, pdl: 0, weeklyHigh: 0, weeklyLow: 0, monthlyHigh: 0, monthlyLow: 0, midpoint: 0, vwap: 0 },
        targets: { entry: 0, invalidation: 0, target1: 0, target2: 0, target3: 0 },
        truth: emptyTruth(symbol, result.errors[0]?.error ?? "No valid setup candidate"),
        meta: {
          errors: result.errors,
          timestamp: result.timestamp,
          environmentMode: result.environmentMode,
        },
      });
    }

    // Get bars for this symbol to compute price/change
    const bars = await alphaVantageProvider.getBars(symbol, market, timeframe);
    const pipeline = result.pipelines[0];
    const intelligence = pipelineToSymbolIntelligence(pipeline, bars, [], result.timestamp);

    return NextResponse.json({
      ...intelligence,
      meta: {
        pipelinesCount: result.pipelines.length,
        errors: result.errors,
        timestamp: result.timestamp,
        environmentMode: result.environmentMode,
        engineVersions: result.engineVersions,
      },
    });
  } catch (err: unknown) {
    console.error("[admin:symbol] Error:", err);
    return NextResponse.json(
      { error: "Symbol fetch failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
