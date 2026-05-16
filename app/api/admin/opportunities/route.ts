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
import type { Market } from "@/types/operator";
import { wrapTruth } from "@/lib/admin";
import type { AdminOpportunityRow } from "@/lib/admin/adminTypes";
import { getAdminResearchPacketsForSymbols } from "@/lib/admin/getAdminResearchPacket";
import { projectEdgePacket, deriveCrossAssetConfluence, type AdminEdgePacket } from "@/lib/admin/edgePacket";
import { syncQueueFromPacket } from "@/lib/admin/queueStore";
import { detectChangeTapeEvents, persistChangeTapeEvents, severityOf, type ChangeTapeEvent, type ChangeTapeSeverity } from "@/lib/admin/changeTape";
import { persistEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import { buildCrossAssetReport } from "@/lib/crossAsset/confluence";
import { unionWatchlistSymbols } from "@/lib/operator/watchlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Universe sources — derived from DEFAULT_WATCHLISTS via the shared union
// helper so every admin surface sees the same broad set. Pinned anchors
// (SPY/QQQ/BTC/ETH/…) sit at the head for macro consistency.
const DEFAULT_CRYPTO: string[] = unionWatchlistSymbols("CRYPTO", ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "MATIC", "ARB", "INJ"]);
const DEFAULT_EQUITY: string[] = unionWatchlistSymbols("EQUITIES", ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "AMZN", "TSLA", "GOOGL", "AMD"]);

export async function GET(req: NextRequest) {
  // Auth gate (mirrors /api/admin/symbol/[symbol] pattern)
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const session = await getSessionFromCookie();

  try {
    const { searchParams } = new URL(req.url);
    const marketParam = (searchParams.get("market") || "CRYPTO").toUpperCase();
    const timeframe = searchParams.get("timeframe") || "15m";
    const symbolsParam = searchParams.get("symbols");

    // Cross-asset mode: fetch both crypto + equities and interleave by opportunityRankScore.
    // No symbols override allowed in ALL mode (would be ambiguous which market each belongs to).
    const isCrossAsset = marketParam === "ALL" && !symbolsParam;

    const workspaceId = session?.workspaceId;
    let packets: Awaited<ReturnType<typeof getAdminResearchPacketsForSymbols>> = [];
    if (isCrossAsset) {
      const [cryptoPackets, equityPackets] = await Promise.all([
        getAdminResearchPacketsForSymbols({ symbols: DEFAULT_CRYPTO, market: "CRYPTO" as Market, timeframe, workspaceId }).catch(() => []),
        getAdminResearchPacketsForSymbols({ symbols: DEFAULT_EQUITY, market: "EQUITIES" as Market, timeframe, workspaceId }).catch(() => []),
      ]);
      packets = [...cryptoPackets, ...equityPackets];
    } else {
      const market = (marketParam === "ALL" ? "CRYPTO" : marketParam) as Market;
      const symbols = symbolsParam
        ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : market === "EQUITIES"
          ? DEFAULT_EQUITY
          : DEFAULT_CRYPTO;

      if (symbols.length === 0) {
        return NextResponse.json({ rows: [], edgePackets: [], errors: [], timestamp: new Date().toISOString() });
      }
      packets = await getAdminResearchPacketsForSymbols({ symbols, market, timeframe, workspaceId });
    }

    if (packets.length === 0) {
      return NextResponse.json({ rows: [], edgePackets: [], changesBySymbol: {}, errors: [], timestamp: new Date().toISOString() });
    }

    // Project to canonical AdminEdgePacket[] (Admin Edge Layer contract).
    const edgePackets: AdminEdgePacket[] = packets.map((p) => projectEdgePacket(p));

    // Rank by opportunityRankScore descending; pin do-nothing/IGNORE to bottom.
    edgePackets.sort((a, b) => {
      const aOut = a.adminState === "IGNORE" ? 1 : 0;
      const bOut = b.adminState === "IGNORE" ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      return b.opportunityRankScore - a.opportunityRankScore;
    });
    edgePackets.forEach((p, i) => { p.opportunityRank = i + 1; });

    // Macro / cross-asset confluence — enrich only the top 5 to bound market-data cost.
    // Equities-only (basket is SPY/QQQ/TLT/GLD/USO/UUP — not meaningful for crypto symbols).
    const macroTargets = edgePackets
      .slice(0, 5)
      .filter((p) => p.assetClass === "equity" && p.bias !== "NEUTRAL");
    await Promise.allSettled(macroTargets.map(async (p) => {
      try {
        const report = await buildCrossAssetReport(p.symbol);
        p.crossAssetConfluence = deriveCrossAssetConfluence(report, p.bias);
      } catch {
        p.crossAssetConfluence = null;
      }
    }));

    // Side-effects: sync queue state + emit change-tape events + persist
    // edge-packet snapshots for audit/calibration. All best-effort.
    const changesBySymbol: Record<string, Array<{ eventType: string; severity: ChangeTapeSeverity; magnitude: number }>> = {};
    if (session?.workspaceId) {
      const ws = session.workspaceId;
      await Promise.allSettled(edgePackets.map((p) => syncQueueFromPacket({ workspaceId: ws, packet: p })));
      // Persist canonical edge-packet snapshots (Tier 1 #2). Awaited so
      // any DB error surfaces in logs while still being non-blocking via
      // the outer try/catch — see persistEdgePackets internal swallow.
      await persistEdgePackets({ workspaceId: ws, packets: edgePackets }).catch(() => 0);
      const allEvents: ChangeTapeEvent[][] = await Promise.all(
        packets.map((p) => detectChangeTapeEvents({ workspaceId: ws, packet: p }).catch(() => [] as ChangeTapeEvent[])),
      );
      const flat = allEvents.flat();
      if (flat.length) await persistChangeTapeEvents(flat).catch(() => 0);
      // Group events by symbol with severity for board surface.
      for (const ev of flat) {
        const sev = severityOf(ev.eventType, ev.magnitude);
        const list = changesBySymbol[ev.symbol] ?? (changesBySymbol[ev.symbol] = []);
        list.push({ eventType: ev.eventType, severity: sev, magnitude: ev.magnitude });
      }
      // Sort each symbol's changes critical-first.
      const sevRank: Record<ChangeTapeSeverity, number> = { critical: 0, notable: 1, info: 2 };
      for (const sym of Object.keys(changesBySymbol)) {
        changesBySymbol[sym].sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.magnitude - a.magnitude);
      }
    }

    // Legacy AdminOpportunityRow[] retained for components that still consume it.
    const rows: AdminOpportunityRow[] = packets.map((packet, idx) => ({
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
      _edgeRank: edgePackets[idx]?.opportunityRank,
    }) as AdminOpportunityRow & { _edgeRank?: number });

    rows.sort((a, b) => {
      const aDegraded = a.score.lifecycle === "DATA_DEGRADED" ? 1 : 0;
      const bDegraded = b.score.lifecycle === "DATA_DEGRADED" ? 1 : 0;
      if (aDegraded !== bDegraded) return aDegraded - bDegraded;
      return b.score.trustAdjustedScore - a.score.trustAdjustedScore;
    });
    rows.forEach((row, idx) => { row.rank = idx + 1; });

    return NextResponse.json({
      rows,
      edgePackets,
      changesBySymbol,
      errors: [],
      timestamp: new Date().toISOString(),
      meta: {
        symbolsRequested: packets.length,
        symbolsScored: rows.length,
        market: isCrossAsset ? "ALL" : marketParam,
        timeframe,
        crossAsset: isCrossAsset,
      },
      truth: wrapTruth({ rows, edgePackets }, { source: 'admin:operator-engine', freshness: 'real-time' }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
