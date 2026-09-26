/**
 * GET /api/admin/opportunities — Opportunity Research Board
 *
 * Reads the shared saved admin scan (lib/admin/sharedScan.ts) — each symbol's
 * operator-engine packet, InternalResearchScore and DataTruth as saved by the
 * scan job — and returns a ranked list for the admin board. It no longer runs
 * the engine live per load (216–990 Alpha Vantage calls per load before).
 * Each edge packet's underlying research packet carries savedScan { ageLabel,
 * status, stale }; "Rescan now" is POST /api/admin/scan.
 *
 * Boundary: research analytics only. No execution / order semantics.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { wrapTruth } from "@/lib/admin";
import type { AdminOpportunityRow } from "@/lib/admin/adminTypes";
import { whatChangedForWorkspace } from "@/lib/admin/getAdminResearchPacket";
import { projectEdgePacket, deriveCrossAssetConfluence, type AdminEdgePacket } from "@/lib/admin/edgePacket";
import { syncQueueFromPacket } from "@/lib/admin/queueStore";
import { detectChangeTapeEvents, persistChangeTapeEvents, severityOf, type ChangeTapeEvent, type ChangeTapeSeverity } from "@/lib/admin/changeTape";
import { filterNewEdgePackets, persistEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import { buildCrossAssetReport } from "@/lib/crossAsset/confluence";
import { isRankable, readSavedScan, scanStatusForResponse, type SavedPacket, type SavedScanView } from "@/lib/admin/sharedScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Universe: the shared scan universe (DEFAULT_WATCHLISTS union, anchors first) — see lib/admin/sharedScanLogic.ts.

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
    let views: SavedScanView[] = [];
    if (isCrossAsset) {
      views = await Promise.all([
        readSavedScan({ market: "CRYPTO", timeframe }),
        readSavedScan({ market: "EQUITIES", timeframe }),
      ]);
    } else {
      const market = marketParam === "EQUITIES" ? "EQUITIES" : "CRYPTO";
      const symbols = symbolsParam
        ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : undefined;
      if (symbols && symbols.length === 0) {
        return NextResponse.json({ rows: [], edgePackets: [], errors: [], timestamp: new Date().toISOString() });
      }
      views = [await readSavedScan({ market, timeframe, symbols })];
    }
    const savedScan = views.map(scanStatusForResponse);
    const scanTimestamp = views.map((v) => v.newestScannedAt).filter((t): t is string => !!t).sort().pop() ?? null;
    let packets: SavedPacket[] = views.flatMap((v) => v.packets);
    const unavailable = views.filter((v) => !v.available).map((v) => v.message ?? "saved scan unavailable");

    if (packets.length === 0) {
      return NextResponse.json({
        rows: [], edgePackets: [], changesBySymbol: {}, errors: unavailable, savedScan,
        timestamp: scanTimestamp ?? new Date().toISOString(),
      });
    }

    // whatChanged relative to this admin's workspace snapshots (saved packets are workspace-neutral).
    if (workspaceId) {
      const withDelta: SavedPacket[] = [];
      for (const p of packets) withDelta.push({ ...p, whatChanged: await whatChangedForWorkspace(p, workspaceId) });
      packets = withDelta;
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
      // Failed / stale saved rows are shown (with their status) but never queued, persisted or taped.
      const rankableIds = new Set(packets.filter(isRankable).map((p) => p.packetId));
      const liveEdge = edgePackets.filter((p) => rankableIds.has(p.packetId));
      const livePackets = packets.filter((p) => rankableIds.has(p.packetId));
      await Promise.allSettled(liveEdge.map((p) => syncQueueFromPacket({ workspaceId: ws, packet: p })));
      // Persist canonical edge-packet snapshots (Tier 1 #2). Awaited so
      // any DB error surfaces in logs while still being non-blocking via
      // the outer try/catch — see persistEdgePackets internal swallow.
      // Saved packets keep their id until re-scanned: only store ones this workspace does not have yet.
      await filterNewEdgePackets(ws, liveEdge)
        .then((fresh) => persistEdgePackets({ workspaceId: ws, packets: fresh }))
        .catch(() => 0);
      const allEvents: ChangeTapeEvent[][] = await Promise.all(
        livePackets.map((p) => detectChangeTapeEvents({ workspaceId: ws, packet: p }).catch(() => [] as ChangeTapeEvent[])),
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
      errors: unavailable,
      // When the newest saved result was built — shown as the scan age on the board.
      timestamp: scanTimestamp ?? new Date().toISOString(),
      savedScan,
      meta: {
        symbolsRequested: packets.length,
        symbolsScored: rows.length,
        market: isCrossAsset ? "ALL" : marketParam,
        timeframe,
        crossAsset: isCrossAsset,
      },
      truth: wrapTruth({ rows, edgePackets }, { source: 'admin:shared-saved-scan', freshness: 'delayed', fetchedAt: scanTimestamp ?? undefined }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
