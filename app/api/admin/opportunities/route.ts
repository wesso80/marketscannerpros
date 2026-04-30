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
import type { Market } from "@/types/operator";
import type { AdminOpportunityRow } from "@/lib/admin/adminTypes";
import { getAdminResearchPacketsForSymbols } from "@/lib/admin/getAdminResearchPacket";

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
    const packets = await getAdminResearchPacketsForSymbols({ symbols, market, timeframe });
    const rows: AdminOpportunityRow[] = packets.map((packet) => ({
      rank: 0,
      symbol: packet.symbol,
      market: packet.market,
      timeframe: packet.timeframe,
      bias: packet.snapshot.bias,
      setup: packet.setup,
      score: packet.internalResearchScore,
      dataTruth: packet.dataTruth,
      changeSinceLastScan: 0,
      alertState: packet.alertEligibility.eligible ? "PENDING" : "SUPPRESSED",
    }));

    // Rank: highest score first; DATA_DEGRADED rows pinned to bottom
    rows.sort((a, b) => {
      const aDegraded = a.score.lifecycle === "DATA_DEGRADED" ? 1 : 0;
      const bDegraded = b.score.lifecycle === "DATA_DEGRADED" ? 1 : 0;
      if (aDegraded !== bDegraded) return aDegraded - bDegraded;
      return b.score.trustAdjustedScore - a.score.trustAdjustedScore;
    });
    rows.forEach((row, idx) => { row.rank = idx + 1; });

    return NextResponse.json({
      rows,
      errors: [],
      timestamp: new Date().toISOString(),
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
