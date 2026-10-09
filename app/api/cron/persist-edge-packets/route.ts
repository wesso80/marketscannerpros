import { currentAvBudget, runWithAvBudget } from '@/lib/avLimiter';
import { adminEquitiesPaused, ADMIN_EQUITIES_PAUSED_MESSAGE } from '@/lib/admin/adminEquities';
import { discoveryOnlyAction, discoveryOnlySkipBody, persistEdgeMarket } from '@/lib/admin/discoveryOnly';
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
 * It also starts the existing shared refresh and waits for completion before publishing.
 * No provider schedule or budget is increased. If another refresh owns the lock,
 * it retains the existing saved-results behavior and reports scanCompleted=false.
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
import { loadPriorPacketSnapshots, packetHistoryKey } from "@/lib/admin/researchPacketHistory";
import { whatChangedForWorkspace } from "@/lib/admin/getAdminResearchPacket";
import { projectEdgePacket, type AdminEdgePacket } from "@/lib/admin/edgePacket";
import { filterNewEdgePackets, persistEdgePackets } from "@/lib/admin/edgePacketSnapshots";
import { isRankable, readSavedScan, startSharedScan, withFreshQuote } from "@/lib/admin/sharedScan";
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

export async function POST(req: NextRequest): Promise<Response> {
  if (!currentAvBudget()) return runWithAvBudget({ lane: 'scheduled', feature: 'cron-persist-edge-packets' }, () => POST(req));
  if (!authorise(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const marketRaw = persistEdgeMarket(body);
    if (marketRaw === 'invalid') {
      return NextResponse.json({ ok: false, error: "market must be CRYPTO or EQUITIES" }, { status: 400 });
    }
    // Crypto persist stays a discovery-only no-op. Only the equity branch runs.
    if (discoveryOnlyAction('/api/cron/persist-edge-packets', 'POST', body) === 'skip_job') {
      return NextResponse.json(discoveryOnlySkipBody(), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    if (marketRaw === 'EQUITIES' && adminEquitiesPaused()) return NextResponse.json({
      ok: true, started: false, skipped: true, reason: 'admin_equities_paused', message: ADMIN_EQUITIES_PAUSED_MESSAGE,
    });
    const market = marketRaw as Market;
    const timeframe = typeof body.timeframe === "string" ? body.timeframe : "15m";
    const universe = sharedScanUniverse(market === "CRYPTO" ? "CRYPTO" : "EQUITIES");
    const limit = typeof body.limit === "number" && body.limit > 0
      ? Math.min(body.limit, universe.length)
      : universe.length;
    const symbols = universe.slice(0, limit);

    const scanMarket = market === "CRYPTO" ? "CRYPTO" : "EQUITIES";
    let view = await readSavedScan({ market: scanMarket, timeframe, symbols });
    if (!view.available) {
      return NextResponse.json({
        ok: false,
        skipped: true,
        reason: "saved_scan_unavailable",
        message: view.message,
        durationMs: Date.now() - started,
      }, { status: 503 });
    }
    // Keep the shared scan moving (no-op when fresh or already running).
    const scan = await startSharedScan({ market: scanMarket, timeframe, trigger: "edge" });
    if (!scan.started && scan.reason !== "already_running") {
      return NextResponse.json({ ok: false, reason: "scan_start_failed", message: scan.message,
        durationMs: Date.now() - started }, { status: 503 });
    }
    // This scheduled route has a 540s caller budget. Unlike interactive pages,
    // it must publish the scan it starts, not the pre-refresh snapshot. Leave
    // 60s for publication; an overlong scan continues under its existing lock.
    let scanCompleted = false;
    if (scan.started) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const remaining = Math.max(1, 480_000 - (Date.now() - started));
      const completion = await Promise.race([
        scan.done,
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), remaining); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (!completion || completion.status !== "done") {
        return NextResponse.json({ ok: false,
          reason: completion ? "shared_scan_failed" : "shared_scan_still_running",
          runId: scan.runId, message: completion?.error ?? "Scan has not completed within the publication budget.",
          durationMs: Date.now() - started }, { status: 503 });
      }
      scanCompleted = true;
      view = await readSavedScan({ market: scanMarket, timeframe, symbols });
      if (!view.available) {
        return NextResponse.json({ ok: false, reason: "completed_scan_unavailable", runId: scan.runId,
          message: view.message, durationMs: Date.now() - started }, { status: 503 });
      }
    }
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
        ok: false,
        skipped: true,
        reason: missing ? "arca_portfolios_table_missing" : "portfolio_lookup_failed",
        message: msg,
        durationMs: Date.now() - started,
      }, { status: 503 });
    }
    const savedScan = {
      ageLabel: view.ageLabel,
      currentPackets: current.length,
      savedPackets: view.packets.length,
      scanStarted: scan.started,
      scanCompleted,
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

    const results: Array<{ workspaceId: string; written: number; packetsBuilt: number; alreadyStored?: number; newPackets?: number; error?: string }> = [];
    for (const w of workspaces) {
      try {
        const history = await loadPriorPacketSnapshots(w.workspace_id, current);
        const packets = [];
        for (const p of current) {
          packets.push({ ...p, whatChanged: await whatChangedForWorkspace(p, w.workspace_id, history.get(packetHistoryKey(p)) ?? null) });
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
        results.push({ workspaceId: w.workspace_id, written, packetsBuilt: edgePackets.length, alreadyStored: edgePackets.length - fresh.length, newPackets: fresh.length });
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

    const ok = results.every((result) => !result.error);
    const totalWritten = results.reduce((acc, r) => acc + r.written, 0);
    return NextResponse.json({
      ok,
      market,
      symbolsRequested: symbols.length,
      workspacesProcessed: results.length,
      totalRowsWritten: totalWritten,
      savedScan,
      results,
      durationMs: Date.now() - started,
    }, { status: ok ? 200 : 503 });
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
