/**
 * GET /api/admin/symbol/[symbol] — Full symbol intelligence for admin terminal
 * Runs the operator engine on a single symbol and returns AdminSymbolIntelligence.
 *
 * Query params:
 *   ?market=CRYPTO (default)
 *   &timeframe=15m (default)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { runScan } from "@/lib/operator/orchestrator";
import type { Market } from "@/types/operator";
import { alphaVantageProvider } from "@/lib/operator/market-data";
import { pipelineToSymbolIntelligence } from "@/lib/admin/serializer";
import { emptyTruth } from "@/lib/admin/truth-layer";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { computeDataTruth } from "@/lib/engines/dataTruth";
import { computeInternalResearchScore } from "@/lib/engines/internalResearchScore";
import { classifySetup } from "@/lib/engines/setupClassifier";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  // Auth gate
  const adminAuth = (await requireAdmin(req)).ok;
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

    const { context, risk } = await buildAdminScanContext();

    const result = await runScan(
      { symbols: [symbol], market, timeframe },
      context,
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
        eliteScore: 0,
        eliteGrade: "D",
        setupState: "DISCOVERED",
        triggerDistancePct: null,
        riskSource: risk.source,
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
        bars: [],
        meta: {
          errors: result.errors,
          timestamp: result.timestamp,
          environmentMode: result.environmentMode,
          risk,
        },
      });
    }

    // Get bars for this symbol to compute price/change
    const bars = await alphaVantageProvider.getBars(symbol, market, timeframe);
    const pipeline = result.pipelines[0];
    const intelligence = {
      ...pipelineToSymbolIntelligence(pipeline, bars, [], result.timestamp),
      riskSource: risk.source,
    };

    // Phase 4 — centralized research artifacts
    const lastBarTime = bars.length > 0 ? new Date(bars[bars.length - 1].timestamp).getTime() : new Date(result.timestamp).getTime();
    const ageSec = Math.max(0, Math.round((Date.now() - lastBarTime) / 1000));
    const dataTruth = computeDataTruth({
      marketDataAgeSec: ageSec,
      timeframe,
      isCached: false,
      sourceErrors: result.errors.filter((e) => e.symbol === symbol).map((e) => e.error),
    });
    const researchScore = computeInternalResearchScore({ snapshot: intelligence, dataTruth });
    const setup = classifySetup(intelligence);

    // Include bar data for charting (last 200 bars max)
    const chartBars = bars.slice(-200).map((b) => ({
      timestamp: b.timestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    return NextResponse.json({
      ...intelligence,
      bars: chartBars,
      research: {
        dataTruth,
        score: researchScore,
        setup,
      },
      meta: {
        pipelinesCount: result.pipelines.length,
        errors: result.errors,
        timestamp: result.timestamp,
        environmentMode: result.environmentMode,
        engineVersions: result.engineVersions,
        risk,
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
