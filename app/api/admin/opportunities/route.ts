/**
 * GET /api/admin/opportunities — Opportunity Research Board
 *
 * Runs the operator engine across a curated symbol set, scores each
 * with the centralized InternalResearchScore engine, attaches a
 * DataTruth verdict, and returns a ranked list for the admin board.
 *
 * Boundary: research analytics only. No execution / order semantics.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { runScan } from "@/lib/operator/orchestrator";
import type { Bar, Market } from "@/types/operator";
import { alphaVantageProvider } from "@/lib/operator/market-data";
import { pipelineToSymbolIntelligence } from "@/lib/admin/serializer";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { computeDataTruth } from "@/lib/engines/dataTruth";
import { computeInternalResearchScore } from "@/lib/engines/internalResearchScore";
import { classifySetup } from "@/lib/engines/setupClassifier";
import type { AdminOpportunityRow } from "@/lib/admin/adminTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CRYPTO = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"];
const DEFAULT_EQUITY = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"];

export async function GET(req: NextRequest) {
  // Auth gate (mirrors /api/admin/symbol/[symbol] pattern)
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const market = (searchParams.get("market") || "CRYPTO").toUpperCase() as Market;
    const timeframe = searchParams.get("timeframe") || "15m";
    const symbolsParam = searchParams.get("symbols");
    const symbols = symbolsParam
      ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : market === "EQUITIES"
        ? DEFAULT_EQUITY
        : DEFAULT_CRYPTO;

    if (symbols.length === 0) {
      return NextResponse.json({ rows: [], errors: [], timestamp: new Date().toISOString() });
    }

    const { context, risk } = await buildAdminScanContext();
    const result = await runScan({ symbols, market, timeframe }, context, alphaVantageProvider);
    const scanTime = new Date(result.timestamp).getTime();

    const rows: AdminOpportunityRow[] = [];

    for (const pipeline of result.pipelines) {
      const symbol = pipeline.candidate.symbol;
      let bars: Bar[];
      try {
        bars = await alphaVantageProvider.getBars(symbol, market, timeframe);
      } catch {
        bars = [];
      }
      const snapshot = pipelineToSymbolIntelligence(pipeline, bars, [], result.timestamp);

      const lastBarTime = bars.length > 0 ? new Date(bars[bars.length - 1].timestamp).getTime() : scanTime;
      const ageSec = Math.max(0, Math.round((Date.now() - lastBarTime) / 1000));

      const dataTruth = computeDataTruth({
        marketDataAgeSec: ageSec,
        timeframe,
        isCached: false,
        sourceErrors: result.errors.filter((e) => e.symbol === symbol).map((e) => e.error),
      });

      const score = computeInternalResearchScore({ snapshot, dataTruth });
      const setup = classifySetup(snapshot);

      rows.push({
        rank: 0, // assigned after sort
        symbol,
        market,
        timeframe,
        bias: snapshot.bias,
        setup,
        score,
        dataTruth,
        changeSinceLastScan: 0, // Phase 5 will diff from previous scan log
        alertState: "NONE",
      });
    }

    // Rank: highest score first; DATA_DEGRADED rows pinned to bottom
    rows.sort((a, b) => {
      const aDegraded = a.score.lifecycle === "DATA_DEGRADED" ? 1 : 0;
      const bDegraded = b.score.lifecycle === "DATA_DEGRADED" ? 1 : 0;
      if (aDegraded !== bDegraded) return aDegraded - bDegraded;
      return b.score.score - a.score.score;
    });
    rows.forEach((row, idx) => { row.rank = idx + 1; });

    return NextResponse.json({
      rows,
      errors: result.errors,
      timestamp: result.timestamp,
      environmentMode: result.environmentMode,
      risk,
      meta: {
        symbolsRequested: symbols.length,
        symbolsScored: rows.length,
        market,
        timeframe,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
