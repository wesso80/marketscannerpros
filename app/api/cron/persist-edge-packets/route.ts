/**
 * POST /api/cron/persist-edge-packets
 *
 * Scheduled persister for `admin_edge_packets`. Without this cron the
 * ARCA cycle's candidate universe is whatever the admin browser happens
 * to have loaded via /api/admin/opportunities — which is why the cockpit
 * kept cycling the same handful of tickers.
 *
 * It no longer runs the operator engine itself (that re-fetched every symbol
 * from Alpha Vantage once per ACTIVE workspace). It reads the shared saved
 * admin scan (lib/admin/sharedScan.ts, table admin_scan_results) and, for
 * every workspace with an ACTIVE `arca_portfolios` row:
 *   1. takes the current (status ok, not stale) saved packets for the market,
 *      with the newest bulk-quote price applied,
 *   2. recomputes whatChanged against that workspace's prior snapshot,
 *   3. projects to canonical AdminEdgePacket[],
 *   4. inserts the ones the workspace does not already have into `admin_edge_packets`.
 * It also nudges the shared scan (a no-op when it is fresh or already running),
 * so edge packets keep flowing even if the radar crons are retired.
 *
 * Body: `{ "market": "CRYPTO" | "EQUITIES", "timeframe"?: string, "limit"?: number }`
 *
 * Auth: x-cron-secret header (CRON_SECRET env). No session fallback —
 * this is cron-only, not user-facing.
 *
 * Research only. No execution. No broker.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { q } from "@/lib/db";
import type { Market } from "@/types/operator";
import { whatChangedForWorkspace } from "@/lib/admin/getAdminResearchPacket";
import { projectEdgePacket, type AdminEdgePacket } from "@/lib/admin/edgePacket";
import { filterNewEdgePackets, persistEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import { detachRun, isRankable, readSavedScan, startSharedScan, withFreshQuote } from "@/lib/admin/sharedScan";
import { sharedScanUniverse } from "@/lib/admin/sharedScanLogic";
import { notifyAdmin } from "@/lib/admin/notifyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function authorise(req: NextRequest): boolean {
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  const headerCron = req.headers.get("x-cron-secret") || "";
  return !!cronSecret && timingSafeCompare(headerCron, cronSecret);
}

export async function POST(req: NextRequest) {
  if (!authorise(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const marketRaw = typeof body.market === "string" ? body.market.toUpperCase() : "CRYPTO";
    if (marketRaw !== "CRYPTO" && marketRaw !== "EQUITIES") {
      return NextResponse.json({ ok: false, error: "market must be CRYPTO or EQUITIES" }, { status: 400 });
    }
    const market = marketRaw as Market;
    const timeframe = typeof body.timeframe === "string" ? body.timeframe : "15m";
    const universe = sharedScanUniverse(market === "CRYPTO" ? "CRYPTO" : "EQUITIES");
    const limit = typeof body.limit === "number" && body.limit > 0
      ? Math.min(body.limit, universe.length)
      : universe.length;
    const symbols = universe.slice(0, limit);

    const scanMarket = market === "CRYPTO" ? "CRYPTO" : "EQUITIES";
    const view = await readSavedScan({ market: scanMarket, timeframe, symbols });
    if (!view.available) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "saved_scan_unavailable",
        message: view.message,
        durationMs: Date.now() - started,
      });
    }
    // Keep the shared scan moving (no-op when fresh or already running).
    const scan = await startSharedScan({ market: scanMarket, timeframe, trigger: "edge" });
    detachRun(scan);
    const current = view.packets.filter(isRankable).map(withFreshQuote);

    // Active workspaces from the same source the arca-cycle cron uses.
    let workspaces: Array<{ workspace_id: string }> = [];
    try {
      workspaces = await q<{ workspace_id: string }>(
        `SELECT DISTINCT workspace_id FROM arca_portfolios WHERE status='ACTIVE'`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const missing = /relation .* does not exist|arca_portfolios/i.test(msg);
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: missing ? "arca_portfolios_table_missing" : "portfolio_lookup_failed",
        message: msg,
        durationMs: Date.now() - started,
      });
    }
    const savedScan = {
      ageLabel: view.ageLabel,
      currentPackets: current.length,
      savedPackets: view.packets.length,
      scanStarted: scan.started,
      scanNote: scan.started ? scan.runId : scan.message,
    };
    if (workspaces.length === 0 || current.length === 0) {
      return NextResponse.json({
        ok: true,
        workspacesProcessed: 0,
        market,
        symbolsRequested: symbols.length,
        reason: workspaces.length === 0 ? "no_active_workspaces" : "no_current_saved_packets",
        savedScan,
        durationMs: Date.now() - started,
      });
    }

    const results: Array<{ workspaceId: string; written: number; packetsBuilt: number; error?: string }> = [];
    for (const w of workspaces) {
      try {
        const packets = [];
        for (const p of current) {
          packets.push({ ...p, whatChanged: await whatChangedForWorkspace(p, w.workspace_id) });
        }
        const edgePackets: AdminEdgePacket[] = packets.map((p) => projectEdgePacket(p));
        // Rank by opportunityRankScore desc; pin IGNORE state to bottom.
        edgePackets.sort((a, b) => {
          const aOut = a.adminState === "IGNORE" ? 1 : 0;
          const bOut = b.adminState === "IGNORE" ? 1 : 0;
          if (aOut !== bOut) return aOut - bOut;
          return b.opportunityRankScore - a.opportunityRankScore;
        });
        edgePackets.forEach((p, i) => { p.opportunityRank = i + 1; });
        const fresh = await filterNewEdgePackets(w.workspace_id, edgePackets);
        const written = await persistEdgePackets({ workspaceId: w.workspace_id, packets: fresh });
        results.push({ workspaceId: w.workspace_id, written, packetsBuilt: edgePackets.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ workspaceId: w.workspace_id, written: 0, packetsBuilt: 0, error: msg });
        notifyAdmin({
          subject: "persist-edge-packets workspace failed",
          body: `Workspace ${w.workspace_id} (${market}): ${msg}`,
          severity: "warn",
          context: { workspaceId: w.workspace_id, market, durationMs: Date.now() - started },
        }).catch(() => {});
      }
    }

    const totalWritten = results.reduce((acc, r) => acc + r.written, 0);
    return NextResponse.json({
      ok: true,
      market,
      symbolsRequested: symbols.length,
      workspacesProcessed: results.length,
      totalRowsWritten: totalWritten,
      savedScan,
      results,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notifyAdmin({
      subject: "persist-edge-packets cron failed",
      body: `persist-edge-packets crashed: ${msg}`,
      severity: "error",
      context: { durationMs: Date.now() - started },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
